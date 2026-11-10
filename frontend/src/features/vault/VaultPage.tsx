import React, { useState } from 'react';
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
  Lock as LockIcon,
} from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { useAsync } from '../../hooks/useAsync';
import type { VaultItem, VaultCategory } from '../../types';
import { Tabs } from '../../components/ui/Tabs';
import { PillButton } from '../../components/ui/PillButton';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { VerificationBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';

export const VaultPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'file' | 'note'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modals state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<VaultItem | null>(null);
  const [itemToEdit, setItemToEdit] = useState<VaultItem | null>(null);

  // Form states for adding/editing note
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<VaultCategory>('Credentials');
  const [noteRecipientId, setNoteRecipientId] = useState<string>('');
  const [noteAuthorized, setNoteAuthorized] = useState(true);
  const [noteMonospace, setNoteMonospace] = useState(false);

  // Upload simulation state
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileRecipientId, setFileRecipientId] = useState<string>('');
  const [fileCategory, setFileCategory] = useState<VaultCategory>('Legal');
  const [fileAuthorized, setFileAuthorized] = useState(true);

  const {
    data: items,
    isLoading,
    isError,
    retry,
    setData: setItems,
  } = useAsync(() => vaultService.getItems(), []);

  const { data: contacts } = useAsync(() => vaultService.getContacts(), []);

  const categories: VaultCategory[] = ['Credentials', 'Legal', 'Financial', 'Personal', 'Other'];

  // Filter items
  const filteredItems = (items ?? []).filter((item) => {
    const matchesTab = activeTab === 'all' || item.type === activeTab;
    const matchesQuery =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.originalFilename && item.originalFilename.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesTab && matchesQuery && matchesCat;
  });

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) {
      toast.error('Please enter a note title.');
      return;
    }

    try {
      const recipient = (contacts ?? []).find((c) => c.id === noteRecipientId);
      const newItem = await vaultService.createItem({
        title: noteTitle.trim(),
        type: 'note',
        category: noteCategory,
        noteContent: noteContent.trim(),
        isMonospace: noteMonospace,
        releaseAuthorized: noteAuthorized,
        recipientId: recipient ? recipient.id : null,
        recipientName: recipient ? recipient.name : null,
        verificationStatus: recipient ? recipient.status : 'unassigned',
      });

      setItems([newItem, ...(items ?? [])]);
      toast.success('Secure note encrypted and added to vault.');
      setIsNoteModalOpen(false);
      resetNoteForm();
    } catch {
      toast.error('Failed to save secure note.');
    }
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToEdit) return;

    try {
      const recipient = (contacts ?? []).find((c) => c.id === noteRecipientId);
      const updated = await vaultService.updateItem(itemToEdit.id, {
        title: noteTitle.trim() || itemToEdit.title,
        category: noteCategory,
        releaseAuthorized: noteAuthorized,
        recipientId: recipient ? recipient.id : null,
        recipientName: recipient ? recipient.name : null,
        verificationStatus: recipient ? recipient.status : 'unassigned',
        isMonospace: noteMonospace,
        noteContent: noteContent.trim() || itemToEdit.noteContent,
      });

      setItems((items ?? []).map((i) => (i.id === updated.id ? updated : i)));
      toast.success('Vault item updated.');
      setItemToEdit(null);
      resetNoteForm();
    } catch {
      toast.error('Failed to update item.');
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await vaultService.deleteItem(itemToDelete.id);
      setItems((items ?? []).filter((i) => i.id !== itemToDelete.id));
      toast.success('Item purged from vault.');
      setItemToDelete(null);
    } catch {
      toast.error('Failed to delete item.');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndStageFile(e.dataTransfer.files[0]);
    }
  };

  const validateAndStageFile = (file: File) => {
    // 50MB client-side limit
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File exceeds maximum limit of 50 MB.');
      return;
    }
    setUploadedFile(file);
  };

  const handleUploadSubmit = async () => {
    if (!uploadedFile) {
      toast.error('Please choose a file to encrypt.');
      return;
    }

    setUploadProgress(15);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (!prev) return 25;
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + 20;
      });
    }, 150);

    await new Promise((resolve) => setTimeout(resolve, 900));
    clearInterval(interval);
    setUploadProgress(100);

    const recipient = (contacts ?? []).find((c) => c.id === fileRecipientId);
    const newItem = await vaultService.createItem({
      title: uploadedFile.name.replace(/\.[^/.]+$/, ''),
      originalFilename: uploadedFile.name,
      fileSizeBytes: uploadedFile.size,
      type: 'file',
      category: fileCategory,
      releaseAuthorized: fileAuthorized,
      recipientId: recipient ? recipient.id : null,
      recipientName: recipient ? recipient.name : null,
      verificationStatus: recipient ? recipient.status : 'unassigned',
    });

    setItems([newItem, ...(items ?? [])]);
    toast.success('Document encrypted and sealed in vault.');
    setTimeout(() => {
      setIsUploadModalOpen(false);
      setUploadedFile(null);
      setUploadProgress(null);
    }, 400);
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
    setNoteTitle(item.title);
    setNoteContent(item.noteContent || '');
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
      {/* ── 1. HEADER & ACTION BUTTONS ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">My Vault</h1>
          <p className="text-xs text-muted-text mt-0.5">
            Encrypted documents, credentials, and directives bound to verified recipients.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <PillButton
            onClick={() => setIsUploadModalOpen(true)}
            variant="secondary"
            size="sm"
            showArrow={false}
          >
            <span className="flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              Upload file
            </span>
          </PillButton>
          <PillButton
            onClick={() => {
              resetNoteForm();
              setIsNoteModalOpen(true);
            }}
            variant="primary"
            size="sm"
            showArrow={false}
          >
            <span className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Add secure note
            </span>
          </PillButton>
        </div>
      </div>

      {/* ── 2. CONTROLS STRIP (TABS, SEARCH, CATEGORY FILTER) ──────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white border border-border rounded-2xl p-3 shadow-xs">
        {/* Segmented Tabs */}
        <Tabs
          tabs={[
            { id: 'all', label: 'All Items', count: items?.length },
            { id: 'file', label: 'Files', count: items?.filter((i) => i.type === 'file').length },
            { id: 'note', label: 'Secure Notes', count: items?.filter((i) => i.type === 'note').length },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as typeof activeTab)}
        />

        {/* Search & Category Filter */}
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
              : 'Add your first document or secure note to stage items for fail-safe release.'
          }
          actionLabel="Add secure note"
          onAction={() => setIsNoteModalOpen(true)}
          icon={<LockIcon className="w-6 h-6" />}
        />
      ) : (
        <div className="bg-white border border-border rounded-[24px] overflow-hidden shadow-xs">
          {/* Desktop Table View */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] font-mono uppercase tracking-wider text-muted-text">
                  <th className="py-3.5 px-6">Item Title</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Designated Recipient</th>
                  <th className="py-3.5 px-4">Release Authorization</th>
                  <th className="py-3.5 px-4">Size / Updated</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs text-navy">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-surface/50 transition-colors group">
                    {/* Title + Type icon */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-surface-2 text-accent shrink-0">
                          {item.type === 'file' ? (
                            <FileText className="w-4 h-4" />
                          ) : item.isMonospace ? (
                            <FileCode className="w-4 h-4" />
                          ) : (
                            <Key className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-navy truncate tracking-tight">
                            {item.title}
                          </p>
                          {item.originalFilename && (
                            <p className="text-[11px] text-muted-text truncate font-mono">
                              {item.originalFilename}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-4 px-4">
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-surface-2 text-navy border border-border">
                        {item.category}
                      </span>
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
                      <div className="flex items-center justify-end gap-1.5 opacity-90 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          title="Edit authorization or recipient"
                          className="p-1.5 rounded-lg text-muted-text hover:text-navy hover:bg-surface-2 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          title="Delete from vault"
                          className="p-1.5 rounded-lg text-muted-text hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. ADD / EDIT SECURE NOTE MODAL ───────────────────────── */}
      <Modal
        isOpen={isNoteModalOpen || !!itemToEdit}
        onClose={() => {
          setIsNoteModalOpen(false);
          setItemToEdit(null);
          resetNoteForm();
        }}
        title={itemToEdit ? 'Edit Vault Item' : 'Seal New Secure Note'}
        description="Encrypted client-side. The payload is sealed with AES-GCM before dispatch."
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

          {/* Release Authorization Toggle */}
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

      {/* ── 5. UPLOAD DOCUMENT MODAL WITH PROGRESS SIMULATION ──────── */}
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
        description="Attachments are encrypted on your device and bound to single-use release tokens."
      >
        <div className="space-y-4">
          {/* Drag & Drop Area */}
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

          {/* Form options */}
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

          {/* Upload Progress Simulation Bar */}
          {uploadProgress !== null && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-muted-text">
                <span>Encrypting and uploading payload...</span>
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

      {/* ── 6. CONFIRM DELETE MODAL ───────────────────────────────── */}
      <Modal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        title="Purge Vault Item"
        description="This action immediately destroys the local encrypted record. Designated recipients will not receive this item."
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-danger-soft border border-danger/20 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-navy leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong>&quot;{itemToDelete?.title}&quot;</strong>?
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
