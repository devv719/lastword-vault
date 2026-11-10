import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Key,
  Upload,
  Plus,
  Search,
  Trash2,
  Edit2,
  ShieldAlert,
  ShieldCheck,
  FileCode,
  AlertTriangle,
  Lock,
  Unlock,
  Download,
  Eye,
} from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { useAsync } from '../../hooks/useAsync';
import type { VaultItem, VaultCategory, RemoteVault } from '../../types';
import { Tabs } from '../../components/ui/Tabs';
import { PillButton } from '../../components/ui/PillButton';
import { Modal } from '../../components/ui/Modal';
import { Input, PasswordInput } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { VerificationBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import {
  encryptVaultData,
  decryptVaultData,
  encryptBinaryData,
  decryptBinaryData,
  base64ToBuffer,
  bufferToBase64,
  type EncryptedDataPayload,
} from '../../utils/crypto';
import toast from 'react-hot-toast';

export const VaultPage: React.FC = () => {
  const { vaultKey, hasVaultKey, lockVault, unlockVault } = useAuth();

  const [activeTab, setActiveTab] = useState<'all' | 'file' | 'note'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [remoteVault, setRemoteVault] = useState<RemoteVault | null>(null);

  // Modals state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [itemToDelete, setItemToDelete] = useState<VaultItem | null>(null);
  const [itemToEdit, setItemToEdit] = useState<VaultItem | null>(null);
  const [itemToView, setItemToView] = useState<VaultItem | null>(null);
  const [viewDecryptedContent, setViewDecryptedContent] = useState<string | null>(null);

  // Form states for adding/editing note
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<VaultCategory>('Credentials');
  const [noteRecipientId, setNoteRecipientId] = useState<string>('');
  const [noteAuthorized, setNoteAuthorized] = useState(true);
  const [noteMonospace, setNoteMonospace] = useState(false);

  // Upload state
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileRecipientId, setFileRecipientId] = useState<string>('');
  const [fileCategory, setFileCategory] = useState<VaultCategory>('Legal');
  const [fileAuthorized, setFileAuthorized] = useState(true);

  // Decrypted cache for in-memory plaintext display
  const [decryptedTitles, setDecryptedTitles] = useState<Record<string, string>>({});
  const [decryptedContents, setDecryptedContents] = useState<Record<string, string>>({});

  const {
    data: items,
    isLoading,
    isError,
    retry,
    setData: setItems,
  } = useAsync(() => vaultService.getItems(), []);

  const { data: contacts } = useAsync(() => vaultService.getContacts(), []);

  const categories: VaultCategory[] = ['Credentials', 'Legal', 'Financial', 'Personal', 'Other'];

  // Load remote vault metadata
  useEffect(() => {
    let isMounted = true;
    vaultService.getRemoteVault().then((v) => {
      if (isMounted && v) setRemoteVault(v);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // When vaultKey is available, automatically decrypt titles and notes in memory
  useEffect(() => {
    if (!vaultKey || !items) return;

    let isCancelled = false;

    const decryptAll = async () => {
      const newTitles: Record<string, string> = {};
      const newContents: Record<string, string> = {};

      for (const item of items) {
        // Try decrypting title if it is JSON encrypted payload
        if (item.title) {
          try {
            if (item.title.startsWith('{') && item.title.includes('ciphertext')) {
              const parsed = JSON.parse(item.title) as EncryptedDataPayload;
              const decrypted = await decryptVaultData(parsed, vaultKey);
              newTitles[item.id] = decrypted;
            } else {
              newTitles[item.id] = item.title;
            }
          } catch {
            newTitles[item.id] = item.title;
          }
        }

        // Try decrypting note content if it is JSON encrypted payload
        if (item.noteContent) {
          try {
            if (item.noteContent.startsWith('{') && item.noteContent.includes('ciphertext')) {
              const parsed = JSON.parse(item.noteContent) as EncryptedDataPayload;
              const decrypted = await decryptVaultData(parsed, vaultKey);
              newContents[item.id] = decrypted;
            } else {
              newContents[item.id] = item.noteContent;
            }
          } catch {
            newContents[item.id] = item.noteContent;
          }
        }
      }

      if (!isCancelled) {
        setDecryptedTitles(newTitles);
        setDecryptedContents(newContents);
      }
    };

    decryptAll();

    return () => {
      isCancelled = true;
    };
  }, [vaultKey, items]);

  // Compute counts
  const totalItemsCount = items?.length || 0;
  const documentsCount = items?.filter((i) => i.type === 'file').length || 0;
  const notesCount = items?.filter((i) => i.type === 'note').length || 0;

  // Filter items
  const filteredItems = useMemo(() => {
    return (items ?? []).filter((item) => {
      const matchesTab = activeTab === 'all' || item.type === activeTab;
      const displayTitle = decryptedTitles[item.id] || item.title || '';
      const matchesQuery =
        displayTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.originalFilename && item.originalFilename.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
      return matchesTab && matchesQuery && matchesCat;
    });
  }, [items, activeTab, searchQuery, selectedCategory, decryptedTitles]);

  // Handle master-password unlock
  const handleUnlockVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword) return;

    setIsUnlocking(true);
    setUnlockError(null);

    try {
      const success = await unlockVault(unlockPassword);
      if (success) {
        toast.success('Vault unlocked. Encryption key active in memory.');
        setIsUnlockModalOpen(false);
        setUnlockPassword('');
      } else {
        setUnlockError('Incorrect master password or corrupt key envelope.');
      }
    } catch (err: any) {
      setUnlockError(err.message || 'Decryption failed. Please verify your password.');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Handle locking
  const handleLockVault = () => {
    lockVault();
    setDecryptedTitles({});
    setDecryptedContents({});
    toast.success('Vault locked. Raw keys purged from memory.');
  };

  // Create encrypted note
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) {
      toast.error('Please enter a note title.');
      return;
    }

    if (!vaultKey) {
      toast.error('Vault is locked. Unlock vault first to encrypt content.');
      setIsUnlockModalOpen(true);
      return;
    }

    try {
      // 1. Client-side encryption of title and content
      const encryptedTitlePayload = await encryptVaultData(noteTitle.trim(), vaultKey);
      const encryptedContentPayload = await encryptVaultData(noteContent.trim(), vaultKey);

      const recipient = (contacts ?? []).find((c) => c.id === noteRecipientId);

      // 2. Transmit only ciphertext and encryption IV to backend
      const newItem = await vaultService.createItem(
        {
          title: noteTitle.trim(), // Stored locally for fast UI, backend receives encryptedTitle
          type: 'note',
          category: noteCategory,
          noteContent: JSON.stringify(encryptedContentPayload),
          isMonospace: noteMonospace,
          releaseAuthorized: noteAuthorized,
          recipientId: recipient ? recipient.id : null,
          recipientName: recipient ? recipient.name : null,
          verificationStatus: recipient ? recipient.status : 'unassigned',
        },
        {
          encryptedTitle: JSON.stringify(encryptedTitlePayload),
          encryptedContent: JSON.stringify(encryptedContentPayload),
          encryptionIv: encryptedContentPayload.iv,
        }
      );

      // Cache decrypted values in memory
      setDecryptedTitles((prev) => ({ ...prev, [newItem.id]: noteTitle.trim() }));
      setDecryptedContents((prev) => ({ ...prev, [newItem.id]: noteContent.trim() }));

      setItems([newItem, ...(items ?? [])]);
      toast.success('Secure note encrypted (AES-256-GCM) and sealed.');
      setIsNoteModalOpen(false);
      resetNoteForm();
    } catch (err: any) {
      toast.error(`Failed to encrypt and save note: ${err.message || 'Unknown error'}`);
    }
  };

  // Update existing note
  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToEdit) return;

    if (!vaultKey) {
      toast.error('Vault is locked. Unlock vault first.');
      setIsUnlockModalOpen(true);
      return;
    }

    try {
      const recipient = (contacts ?? []).find((c) => c.id === noteRecipientId);
      const titleToSave = noteTitle.trim() || itemToEdit.title;
      const contentToSave = noteContent.trim() || decryptedContents[itemToEdit.id] || '';

      const encryptedContentPayload = await encryptVaultData(contentToSave, vaultKey);

      const updated = await vaultService.updateItem(itemToEdit.id, {
        title: titleToSave,
        category: noteCategory,
        releaseAuthorized: noteAuthorized,
        recipientId: recipient ? recipient.id : null,
        recipientName: recipient ? recipient.name : null,
        verificationStatus: recipient ? recipient.status : 'unassigned',
        isMonospace: noteMonospace,
        noteContent: JSON.stringify(encryptedContentPayload),
      });

      setDecryptedTitles((prev) => ({ ...prev, [updated.id]: titleToSave }));
      setDecryptedContents((prev) => ({ ...prev, [updated.id]: contentToSave }));

      setItems((items ?? []).map((i) => (i.id === updated.id ? updated : i)));
      toast.success('Vault item updated.');
      setItemToEdit(null);
      resetNoteForm();
    } catch {
      toast.error('Failed to update item.');
    }
  };

  // Delete item
  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await vaultService.deleteItem(itemToDelete.id);
      setItems((items ?? []).filter((i) => i.id !== itemToDelete.id));
      toast.success('Item permanently purged from vault.');
      setItemToDelete(null);
    } catch {
      toast.error('Failed to delete item.');
    }
  };

  // File drop
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndStageFile(e.dataTransfer.files[0]);
    }
  };

  const validateAndStageFile = (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File exceeds maximum limit of 50 MB.');
      return;
    }
    setUploadedFile(file);
  };

  // Upload and client-side encrypt document
  const handleUploadSubmit = async () => {
    if (!uploadedFile) {
      toast.error('Please choose a file to encrypt.');
      return;
    }

    if (!vaultKey) {
      toast.error('Vault is locked. Unlock vault first to encrypt files.');
      setIsUnlockModalOpen(true);
      return;
    }

    try {
      setUploadProgress(15);

      // 1. Read binary bytes into ArrayBuffer
      const arrayBuffer = await uploadedFile.arrayBuffer();
      setUploadProgress(40);

      // 2. Encrypt binary file in browser with AES-256-GCM
      const encryptedFilePayload = await encryptBinaryData(arrayBuffer, vaultKey);
      setUploadProgress(60);

      // 3. Encrypt original filename
      const encryptedTitlePayload = await encryptVaultData(uploadedFile.name, vaultKey);
      setUploadProgress(75);

      const recipient = (contacts ?? []).find((c) => c.id === fileRecipientId);

      // 4. Send encrypted payload metadata to backend
      const newItem = await vaultService.createItem(
        {
          title: uploadedFile.name,
          originalFilename: uploadedFile.name,
          fileSizeBytes: uploadedFile.size,
          type: 'file',
          category: fileCategory,
          releaseAuthorized: fileAuthorized,
          recipientId: recipient ? recipient.id : null,
          recipientName: recipient ? recipient.name : null,
          verificationStatus: recipient ? recipient.status : 'unassigned',
        },
        {
          encryptedTitle: JSON.stringify(encryptedTitlePayload),
          encryptionIv: encryptedFilePayload.iv,
          mimeType: uploadedFile.type || 'application/octet-stream',
          fileSize: uploadedFile.size,
        }
      );

      // 5. Upload encrypted binary bytes to S3 via PUT /vault/items/{id}/file
      setUploadProgress(85);
      const encryptedBytes = base64ToBuffer(encryptedFilePayload.ciphertext);
      let finalItem = newItem;
      try {
        finalItem = await vaultService.uploadFile(newItem.id, encryptedBytes, {
          originalFilename: uploadedFile.name,
          mimeType: uploadedFile.type || 'application/octet-stream',
        });
      } catch (uploadErr: any) {
        // If file upload fails after metadata creation, attempt cleanup
        try {
          await vaultService.deleteItem(newItem.id);
        } catch {
          // ignore cleanup failure
        }
        throw new Error(`Failed to upload encrypted file to S3: ${uploadErr.message || uploadErr}`);
      }

      setUploadProgress(100);

      setDecryptedTitles((prev) => ({ ...prev, [finalItem.id]: uploadedFile.name }));
      setItems([finalItem, ...(items ?? [])]);

      toast.success('Document encrypted (AES-256-GCM) and committed to vault.');
      setTimeout(() => {
        setIsUploadModalOpen(false);
        setUploadedFile(null);
        setUploadProgress(null);
      }, 400);
    } catch (err: any) {
      toast.error(`Upload encryption failed: ${err.message || 'Unknown error'}`);
      setUploadProgress(null);
    }
  };

  // Decrypt and download document in browser
  const handleDownloadDocument = async (item: VaultItem) => {
    if (!vaultKey) {
      toast.error('Please unlock your vault to download and decrypt files.');
      setIsUnlockModalOpen(true);
      return;
    }

    try {
      toast.loading('Downloading and decrypting file in memory...', { id: 'file-decrypt' });

      let decryptedBuffer: ArrayBuffer;
      let filename = decryptedTitles[item.id] || item.originalFilename || item.title || 'document';

      // 1. Try S3 endpoint first
      try {
        const fileResult = await vaultService.downloadFile(item.id);
        const iv = fileResult.iv || '';
        if (!iv) {
          throw new Error('Encryption IV not provided in file metadata.');
        }
        // fileResult.data is raw ciphertext bytes from S3
        const payload: EncryptedDataPayload = {
          ciphertext: bufferToBase64(fileResult.data),
          iv: iv,
        };
        decryptedBuffer = await decryptBinaryData(payload, vaultKey);
        if (fileResult.originalFilename) {
          filename = decryptedTitles[item.id] || fileResult.originalFilename;
        }
      } catch (s3Err: any) {
        // 2. Fallback to legacy noteContent / DB encrypted_content if available
        if (item.noteContent) {
          let payload: EncryptedDataPayload;
          if (item.noteContent.startsWith('{')) {
            payload = JSON.parse(item.noteContent);
          } else {
            throw new Error('Encrypted payload missing or unformatted.');
          }
          decryptedBuffer = await decryptBinaryData(payload, vaultKey);
        } else {
          throw s3Err;
        }
      }

      // Trigger browser download
      const blob = new Blob([decryptedBuffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Document decrypted and downloaded.', { id: 'file-decrypt' });
    } catch (err: any) {
      toast.error(`Failed to decrypt document: ${err.message || 'Key mismatch'}`, {
        id: 'file-decrypt',
      });
    }
  };

  // View note / decrypt in modal
  const handleViewItem = async (item: VaultItem) => {
    setItemToView(item);
    if (!vaultKey) {
      setViewDecryptedContent(null);
      return;
    }

    if (decryptedContents[item.id]) {
      setViewDecryptedContent(decryptedContents[item.id]);
      return;
    }

    if (item.noteContent && item.noteContent.startsWith('{')) {
      try {
        const parsed = JSON.parse(item.noteContent) as EncryptedDataPayload;
        const decrypted = await decryptVaultData(parsed, vaultKey);
        setViewDecryptedContent(decrypted);
        setDecryptedContents((prev) => ({ ...prev, [item.id]: decrypted }));
      } catch {
        setViewDecryptedContent('[Unable to decrypt payload with current vault key]');
      }
    } else {
      setViewDecryptedContent(item.noteContent || '(Empty)');
    }
  };

  const resetNoteForm = () => {
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('Credentials');
    setNoteRecipientId('');
    setNoteAuthorized(true);
    setNoteMonospace(false);
  };

  const openEditModal = (item: VaultItem) => {
    setItemToEdit(item);
    setNoteTitle(decryptedTitles[item.id] || item.title);
    setNoteContent(decryptedContents[item.id] || item.noteContent || '');
    setNoteCategory(item.category);
    setNoteRecipientId(item.recipientId || '');
    setNoteAuthorized(item.releaseAuthorized);
    setNoteMonospace(!!item.isMonospace);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* ── 1. VAULT METRICS & STATUS BANNER ─────────────────────────── */}
      <div className="bg-white border border-border rounded-3xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-text">
                Enclave Security
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                  hasVaultKey
                    ? 'bg-success-soft text-success border-success/20'
                    : 'bg-warning-soft text-amber-700 border-amber-300'
                }`}
              >
                {hasVaultKey ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {hasVaultKey ? 'Vault Unlocked' : 'Vault Locked'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight mt-1">
              {remoteVault?.name || 'Primary Vault'}
            </h1>
            <p className="text-xs text-muted-text mt-0.5">
              Zero-knowledge AES-256-GCM enclave. Plaintext files and master keys never touch the server.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-stretch md:self-auto justify-end">
            {hasVaultKey ? (
              <PillButton
                onClick={handleLockVault}
                variant="secondary"
                size="sm"
                showArrow={false}
              >
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Lock vault
                </span>
              </PillButton>
            ) : (
              <PillButton
                onClick={() => setIsUnlockModalOpen(true)}
                variant="primary"
                size="sm"
                showArrow={false}
              >
                <span className="flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5" />
                  Unlock vault
                </span>
              </PillButton>
            )}

            <PillButton
              onClick={() => {
                if (!hasVaultKey) {
                  setIsUnlockModalOpen(true);
                  return;
                }
                setIsUploadModalOpen(true);
              }}
              variant="secondary"
              size="sm"
              showArrow={false}
            >
              <span className="flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Add Document
              </span>
            </PillButton>

            <PillButton
              onClick={() => {
                if (!hasVaultKey) {
                  setIsUnlockModalOpen(true);
                  return;
                }
                resetNoteForm();
                setIsNoteModalOpen(true);
              }}
              variant="primary"
              size="sm"
              showArrow={false}
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add Note
              </span>
            </PillButton>
          </div>
        </div>

        {/* ── Summary Counters Strip ────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-border/60">
          <div className="bg-surface rounded-2xl p-3 border border-border/60">
            <span className="text-[11px] font-mono uppercase text-muted-text">Stored Items</span>
            <p className="text-xl font-bold text-navy mt-0.5">{totalItemsCount}</p>
          </div>
          <div className="bg-surface rounded-2xl p-3 border border-border/60">
            <span className="text-[11px] font-mono uppercase text-muted-text">Documents</span>
            <p className="text-xl font-bold text-navy mt-0.5">{documentsCount}</p>
          </div>
          <div className="bg-surface rounded-2xl p-3 border border-border/60">
            <span className="text-[11px] font-mono uppercase text-muted-text">Secure Notes</span>
            <p className="text-xl font-bold text-navy mt-0.5">{notesCount}</p>
          </div>
        </div>
      </div>

      {/* ── 2. CONTROLS STRIP (TABS, SEARCH, CATEGORY FILTER) ──────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white border border-border rounded-2xl p-3 shadow-xs">
        <Tabs
          tabs={[
            { id: 'all', label: 'All Items', count: totalItemsCount },
            { id: 'file', label: 'Documents', count: documentsCount },
            { id: 'note', label: 'Notes', count: notesCount },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as typeof activeTab)}
        />

        <div className="flex items-center gap-2.5 flex-1 md:max-w-md justify-end">
          <div className="relative w-full max-w-xs">
            <Search className="w-3.5 h-3.5 text-muted-text absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-border rounded-full pl-8 pr-3.5 py-1.5 text-xs text-navy placeholder:text-muted-text focus:outline-none focus:bg-white focus:border-accent"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-surface border border-border rounded-full px-3 py-1.5 text-xs text-navy focus:outline-none cursor-pointer"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── 3. VAULT ITEMS TABLE / CARDS ───────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={retry} />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No vault records found"
          description={
            searchQuery || selectedCategory !== 'all'
              ? 'Try clearing your filters or search query.'
              : 'Add your first encrypted document or secure note to stage items for fail-safe release.'
          }
          actionLabel="Add secure note"
          onAction={() => {
            if (!hasVaultKey) {
              setIsUnlockModalOpen(true);
            } else {
              setIsNoteModalOpen(true);
            }
          }}
          icon={<Lock className="w-6 h-6" />}
        />
      ) : (
        <div className="bg-white border border-border rounded-[24px] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] font-mono uppercase tracking-wider text-muted-text">
                  <th className="py-3.5 px-6">Item Title</th>
                  <th className="py-3.5 px-4">Type / Category</th>
                  <th className="py-3.5 px-4">Designated Recipient</th>
                  <th className="py-3.5 px-4">Release Authorization</th>
                  <th className="py-3.5 px-4">Size / Updated</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs text-navy">
                {filteredItems.map((item) => {
                  const displayTitle = hasVaultKey
                    ? decryptedTitles[item.id] || item.title
                    : 'Encrypted Record (Locked)';

                  return (
                    <tr key={item.id} className="hover:bg-surface/50 transition-colors group">
                      {/* Title + Type icon */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-surface-2 text-accent shrink-0">
                            {!hasVaultKey ? (
                              <Lock className="w-4 h-4 text-muted-text" />
                            ) : item.type === 'file' ? (
                              <FileText className="w-4 h-4" />
                            ) : item.isMonospace ? (
                              <FileCode className="w-4 h-4" />
                            ) : (
                              <Key className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p
                              className={`font-semibold text-navy truncate tracking-tight cursor-pointer hover:underline ${
                                !hasVaultKey ? 'text-muted-text italic' : ''
                              }`}
                              onClick={() => handleViewItem(item)}
                            >
                              {displayTitle}
                            </p>
                            {item.originalFilename && hasVaultKey && (
                              <p className="text-[11px] text-muted-text truncate font-mono">
                                {item.originalFilename}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type / Category */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-surface-2 text-navy border border-border">
                            {item.type === 'file' ? 'DOC' : 'NOTE'}
                          </span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-muted-text">
                            {item.category}
                          </span>
                        </div>
                      </td>

                      {/* Recipient */}
                      <td className="py-4 px-4">
                        {item.recipientName ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-navy">{item.recipientName}</span>
                            <VerificationBadge status={item.verificationStatus} />
                          </div>
                        ) : (
                          <span className="text-muted-text italic">Unassigned</span>
                        )}
                      </td>

                      {/* Release Authorization Indicator */}
                      <td className="py-4 px-4">
                        {item.releaseAuthorized ? (
                          <span
                            title="Authorized: This item will be unsealed and delivered if deadline expires"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success text-[11px] font-medium border border-success/20 cursor-help"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Authorized</span>
                          </span>
                        ) : (
                          <span
                            title="Unauthorized: Kept permanently encrypted even after release trigger"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-muted-text text-[11px] font-medium border border-border cursor-help"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Withheld</span>
                          </span>
                        )}
                      </td>

                      {/* Size / Updated */}
                      <td className="py-4 px-4 text-muted-text font-mono text-[11px]">
                        {item.type === 'file' ? formatFileSize(item.fileSizeBytes) : 'Secure Note'}
                        <div className="text-[10px] text-muted-text/80">
                          {new Date(item.updatedAt).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Row Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View note / details */}
                          <button
                            type="button"
                            onClick={() => handleViewItem(item)}
                            title="View / Decrypt item"
                            className="p-1.5 rounded-lg text-muted-text hover:text-navy hover:bg-surface-2 transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Download decrypted document */}
                          {item.type === 'file' && (
                            <button
                              type="button"
                              onClick={() => handleDownloadDocument(item)}
                              title="Download & Decrypt Document"
                              className="p-1.5 rounded-lg text-accent hover:bg-accent-soft transition-colors cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}

                          {/* Edit item */}
                          {item.type === 'note' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!hasVaultKey) {
                                  setIsUnlockModalOpen(true);
                                  return;
                                }
                                openEditModal(item);
                              }}
                              title="Edit note"
                              className="p-1.5 rounded-lg text-muted-text hover:text-navy hover:bg-surface-2 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete item */}
                          <button
                            type="button"
                            onClick={() => setItemToDelete(item)}
                            title="Purge from vault"
                            className="p-1.5 rounded-lg text-muted-text hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. UNLOCK VAULT MODAL ─────────────────────────────────── */}
      <Modal
        isOpen={isUnlockModalOpen}
        onClose={() => {
          setIsUnlockModalOpen(false);
          setUnlockPassword('');
          setUnlockError(null);
        }}
        title="Unlock Secure Enclave"
        description="Enter your master password to derive the PBKDF2 wrapping key and unseal your AES-256-GCM vault key into browser memory."
        maxWidth="sm"
      >
        <form onSubmit={handleUnlockVault} className="space-y-4">
          <PasswordInput
            label="Master Password"
            placeholder="••••••••••••"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            required
            autoFocus
          />

          {unlockError && (
            <div className="p-3 bg-danger-soft border border-danger/20 rounded-2xl flex items-start gap-2.5 text-xs text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{unlockError}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setIsUnlockModalOpen(false);
                setUnlockPassword('');
                setUnlockError(null);
              }}
              className="px-4 py-2 rounded-full text-xs font-medium text-muted-text hover:text-navy cursor-pointer"
            >
              Cancel
            </button>
            <PillButton type="submit" disabled={isUnlocking} size="sm" showArrow={false}>
              {isUnlocking ? 'Unwrapping Key...' : 'Unlock Vault'}
            </PillButton>
          </div>
        </form>
      </Modal>

      {/* ── 5. VIEW / DECRYPT ITEM MODAL ──────────────────────────── */}
      <Modal
        isOpen={!!itemToView}
        onClose={() => {
          setItemToView(null);
          setViewDecryptedContent(null);
        }}
        title={
          hasVaultKey
            ? decryptedTitles[itemToView?.id || ''] || itemToView?.title || 'Vault Item'
            : 'Encrypted Record (Locked)'
        }
        description={`Category: ${itemToView?.category || 'Documents'} • Type: ${
          itemToView?.type === 'file' ? 'Encrypted Document' : 'Secure Note'
        }`}
      >
        <div className="space-y-4">
          {!hasVaultKey ? (
            <div className="p-6 bg-surface border border-border rounded-2xl text-center space-y-3">
              <Lock className="w-8 h-8 text-muted-text mx-auto" />
              <p className="text-sm font-semibold text-navy">This item is encrypted.</p>
              <p className="text-xs text-muted-text max-w-sm mx-auto">
                Unlock your vault with your master password to decrypt and read this payload in memory.
              </p>
              <div className="pt-2">
                <PillButton
                  onClick={() => {
                    setItemToView(null);
                    setIsUnlockModalOpen(true);
                  }}
                  size="sm"
                  showArrow={false}
                >
                  Unlock Vault
                </PillButton>
              </div>
            </div>
          ) : itemToView?.type === 'file' ? (
            <div className="p-6 bg-surface border border-border rounded-2xl text-center space-y-4">
              <FileText className="w-10 h-10 text-accent mx-auto" />
              <div>
                <p className="text-sm font-semibold text-navy">
                  {decryptedTitles[itemToView.id] || itemToView.originalFilename || itemToView.title}
                </p>
                <p className="text-xs text-muted-text font-mono mt-0.5">
                  Size: {formatFileSize(itemToView.fileSizeBytes)} • Encrypted with AES-256-GCM
                </p>
              </div>
              <PillButton
                onClick={() => handleDownloadDocument(itemToView)}
                size="sm"
                showArrow={false}
              >
                <span className="flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Decrypt and Download
                </span>
              </PillButton>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase text-muted-text">Decrypted Secret Content</label>
              <div
                className={`w-full bg-surface border border-border rounded-2xl p-4 text-xs text-navy whitespace-pre-wrap select-text max-h-72 overflow-y-auto ${
                  itemToView?.isMonospace ? 'font-mono' : 'font-sans'
                }`}
              >
                {viewDecryptedContent || '(No content)'}
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                setItemToView(null);
                setViewDecryptedContent(null);
              }}
              className="px-4 py-2 rounded-full text-xs font-medium text-muted-text hover:text-navy cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* ── 6. ADD / EDIT SECURE NOTE MODAL ───────────────────────── */}
      <Modal
        isOpen={isNoteModalOpen || !!itemToEdit}
        onClose={() => {
          setIsNoteModalOpen(false);
          setItemToEdit(null);
          resetNoteForm();
        }}
        title={itemToEdit ? 'Edit Vault Item' : 'Seal New Secure Note'}
        description="Encrypted in the browser using AES-256-GCM. The plaintext never leaves your machine."
      >
        <form onSubmit={itemToEdit ? handleUpdateItem : handleCreateNote} className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Master Hardware Wallet Seed Phrase"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Category"
              value={noteCategory}
              onChange={(e) => setNoteCategory(e.target.value as VaultCategory)}
              options={categories.map((c) => ({ value: c, label: c }))}
            />

            <Select
              label="Designated Recipient"
              value={noteRecipientId}
              onChange={(e) => setNoteRecipientId(e.target.value)}
              options={[
                { value: '', label: 'None (Unassigned)' },
                ...(contacts ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.relationship})`,
                })),
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-navy">Secret Payload</label>
              <button
                type="button"
                onClick={() => setNoteMonospace(!noteMonospace)}
                className={`text-[11px] font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  noteMonospace ? 'bg-navy text-white' : 'bg-surface-2 text-muted-text'
                }`}
              >
                {noteMonospace ? 'Monospace: ON' : 'Monospace: OFF'}
              </button>
            </div>
            <textarea
              rows={4}
              placeholder="Paste recovery seed words, credentials, or personal message..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className={`w-full bg-surface border border-border rounded-2xl p-3.5 text-xs text-navy focus:outline-none focus:bg-white focus:border-accent ${
                noteMonospace ? 'font-mono' : 'font-sans'
              }`}
            />
          </div>

          <div className="p-3.5 bg-surface rounded-2xl border border-border">
            <Switch
              checked={noteAuthorized}
              onChange={setNoteAuthorized}
              label="Authorize Release on Heartbeat Expiry"
              description="When checked, this note is decrypted and delivered to the recipient if silence is confirmed."
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setIsNoteModalOpen(false);
                setItemToEdit(null);
                resetNoteForm();
              }}
              className="px-4 py-2 rounded-full text-xs font-medium text-muted-text hover:text-navy cursor-pointer"
            >
              Cancel
            </button>
            <PillButton type="submit" size="sm" showArrow={false}>
              {itemToEdit ? 'Save Changes' : 'Encrypt & Seal Note'}
            </PillButton>
          </div>
        </form>
      </Modal>

      {/* ── 7. UPLOAD DOCUMENT MODAL WITH PROGRESS ─────────────────── */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => {
          if (uploadProgress === null || uploadProgress === 100) {
            setIsUploadModalOpen(false);
            setUploadedFile(null);
            setUploadProgress(null);
          }
        }}
        title="Upload Encrypted Attachment"
        description="Documents are read and encrypted with AES-256-GCM on your device before transfer."
      >
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              dragOver
                ? 'border-accent bg-accent-soft/20'
                : 'border-border bg-surface hover:bg-white'
            }`}
          >
            {uploadedFile ? (
              <div className="space-y-2">
                <FileText className="w-8 h-8 text-accent mx-auto" />
                <p className="text-sm font-semibold text-navy">{uploadedFile.name}</p>
                <p className="text-xs text-muted-text font-mono">
                  {formatFileSize(uploadedFile.size)}
                </p>
                <button
                  type="button"
                  onClick={() => setUploadedFile(null)}
                  className="text-xs text-danger hover:underline cursor-pointer"
                >
                  Choose another file
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 text-muted-text mx-auto" />
                <p className="text-sm font-medium text-navy">Drag files here, or browse</p>
                <p className="text-xs text-muted-text">PDF, ZIP, TXT, DOCX up to 50 MB</p>
                <label className="inline-block mt-2">
                  <span className="px-3.5 py-1.5 rounded-full bg-white border border-border text-xs font-medium text-navy shadow-xs cursor-pointer hover:bg-surface-2 transition-colors">
                    Browse Files
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        validateAndStageFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Category"
              value={fileCategory}
              onChange={(e) => setFileCategory(e.target.value as VaultCategory)}
              options={categories.map((c) => ({ value: c, label: c }))}
            />

            <Select
              label="Designated Recipient"
              value={fileRecipientId}
              onChange={(e) => setFileRecipientId(e.target.value)}
              options={[
                { value: '', label: 'None (Unassigned)' },
                ...(contacts ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.relationship})`,
                })),
              ]}
            />
          </div>

          <div className="p-3.5 bg-surface rounded-2xl border border-border">
            <Switch
              checked={fileAuthorized}
              onChange={setFileAuthorized}
              label="Authorize File Release"
              description="Make file accessible to the designated contact if the switch triggers."
            />
          </div>

          {uploadProgress !== null && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-muted-text">
                <span>Encrypting payload with AES-256-GCM...</span>
                <span className="font-mono font-medium">{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setIsUploadModalOpen(false);
                setUploadedFile(null);
                setUploadProgress(null);
              }}
              className="px-4 py-2 rounded-full text-xs font-medium text-muted-text hover:text-navy cursor-pointer"
            >
              Cancel
            </button>
            <PillButton
              onClick={handleUploadSubmit}
              disabled={!uploadedFile || uploadProgress !== null}
              size="sm"
              showArrow={false}
            >
              Seal and Store File
            </PillButton>
          </div>
        </div>
      </Modal>

      {/* ── 8. CONFIRM DELETE MODAL ───────────────────────────────── */}
      <Modal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        title="Purge Vault Item"
        description="This action permanently removes the encrypted item from your vault."
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-danger-soft border border-danger/20 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-navy leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong>&quot;{decryptedTitles[itemToDelete?.id || ''] || itemToDelete?.title}&quot;</strong>?
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setItemToDelete(null)}
              className="px-4 py-2 rounded-full text-xs font-medium text-muted-text hover:text-navy cursor-pointer"
            >
              Cancel
            </button>
            <PillButton onClick={handleDeleteItem} variant="danger" size="sm" showArrow={false}>
              Purge Item
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
};
