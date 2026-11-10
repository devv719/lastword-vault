import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  Phone,
  Shield,
  Send,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { useAsync } from '../../hooks/useAsync';
import type { Contact } from '../../types';
import { PillButton } from '../../components/ui/PillButton';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { VerificationBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';

export const ContactsPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');

  const {
    data: contacts,
    isLoading,
    isError,
    retry,
    setData: setContacts,
  } = useAsync(() => vaultService.getContacts(), []);

  const resetForm = () => {
    setName('');
    setEmail('');
    setRelationship('');
    setPhone('');
    setContactToEdit(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (contact: Contact) => {
    setContactToEdit(contact);
    setName(contact.name);
    setEmail(contact.email);
    setRelationship(contact.relationship);
    setPhone(contact.phone || '');
    setIsModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email are required.');
      return;
    }

    try {
      if (contactToEdit) {
        const updated = await vaultService.updateContact(contactToEdit.id, {
          name: name.trim(),
          email: email.trim(),
          relationship: relationship.trim(),
          phone: phone.trim() || undefined,
        });
        setContacts((contacts ?? []).map((c) => (c.id === updated.id ? updated : c)));
        toast.success('Contact details updated.');
      } else {
        const newContact = await vaultService.createContact({
          name: name.trim(),
          email: email.trim(),
          relationship: relationship.trim() || 'Beneficiary',
          phone: phone.trim() || undefined,
        });
        setContacts([...(contacts ?? []), newContact]);
        toast.success(`Verification link dispatched to ${email.trim()}.`);
      }
      setIsModalOpen(false);
      resetForm();
    } catch {
      toast.error('Failed to save contact.');
    }
  };

  const handleDeleteContact = async () => {
    if (!contactToDelete) return;
    try {
      await vaultService.deleteContact(contactToDelete.id);
      setContacts((contacts ?? []).filter((c) => c.id !== contactToDelete.id));
      toast.success('Contact removed from directory.');
      setContactToDelete(null);
    } catch {
      toast.error('Failed to remove contact.');
    }
  };

  const handleResendVerification = async (contact: Contact) => {
    try {
      await vaultService.resendVerification(contact.id);
      toast.success(`Verification challenge resent to ${contact.email}`);
    } catch {
      toast.error('Failed to resend verification.');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── 1. HEADER ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
            Trusted Contacts
          </h1>
          <p className="text-xs text-muted-text mt-0.5">
            Verified executors and beneficiaries eligible to receive unsealed documents.
          </p>
        </div>

        <PillButton onClick={handleOpenAddModal} size="sm">
          <span className="flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            Add trusted contact
          </span>
        </PillButton>
      </div>

      {/* ── 2. CARDS GRID ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-[24px]" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={retry} />
      ) : (contacts ?? []).length === 0 ? (
        <EmptyState
          title="No trusted contacts registered"
          description="Designate executors, attorneys, or family members who will receive your unsealed assets."
          actionLabel="Add first contact"
          onAction={handleOpenAddModal}
          icon={<Users className="w-6 h-6" />}
          badge="DIRECTORY: 0"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(contacts ?? []).map((contact) => (
            <div
              key={contact.id}
              className="bg-white border border-border rounded-[24px] p-6 shadow-xs flex flex-col justify-between hover:shadow-sm transition-all"
            >
              <div>
                {/* Top: Avatar, Names, Verification badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-accent-soft text-accent font-semibold text-sm flex items-center justify-center shrink-0 border border-accent/20">
                      {contact.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-navy tracking-tight">
                        {contact.name}
                      </h3>
                      <p className="text-xs text-muted-text mt-0.5">{contact.relationship}</p>
                    </div>
                  </div>
                  <VerificationBadge status={contact.status} />
                </div>

                {/* Details list */}
                <div className="mt-4 pt-4 border-t border-border/60 space-y-2 text-xs text-muted-text">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                  {contact.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span>{contact.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span>
                      {contact.assignedItemsCount}{' '}
                      {contact.assignedItemsCount === 1 ? 'item' : 'items'} explicitly assigned
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="mt-6 pt-3 border-t border-border flex items-center justify-between">
                {contact.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={() => handleResendVerification(contact)}
                    className="text-xs text-accent font-medium hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3 h-3" /> Resend invite
                  </button>
                ) : (
                  <span className="text-[11px] text-success font-medium inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Identity confirmed
                  </span>
                )}

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(contact)}
                    title="Edit contact"
                    className="p-1.5 rounded-lg text-muted-text hover:text-navy hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactToDelete(contact)}
                    title="Remove contact"
                    className="p-1.5 rounded-lg text-muted-text hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. ADD / EDIT CONTACT MODAL ───────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={contactToEdit ? 'Edit Contact Profile' : 'Add Trusted Contact'}
        description="Recipients receive an out-of-band verification challenge before items can be released."
      >
        <form onSubmit={handleSaveContact} className="space-y-4">
          <Input
            label="Full Legal Name"
            placeholder="e.g. Maya Chen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. maya@havenfield.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Relationship / Role"
              placeholder="e.g. Partner, Attorney, Sibling"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            />

            <Input
              label="Phone Number (Optional)"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="px-4 py-2 rounded-full text-xs font-medium text-muted-text hover:text-navy cursor-pointer"
            >
              Cancel
            </button>
            <PillButton type="submit" size="sm" showArrow={false}>
              {contactToEdit ? 'Update Contact' : 'Send Verification Handshake'}
            </PillButton>
          </div>
        </form>
      </Modal>

      {/* ── 4. CONFIRM REMOVE MODAL ───────────────────────────────── */}
      <Modal
        isOpen={!!contactToDelete}
        onClose={() => setContactToDelete(null)}
        title="Remove Contact"
        description="Removing this contact unassigns them from all designated vault items."
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-danger-soft border border-danger/20 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-navy leading-relaxed">
              Remove <strong>{contactToDelete?.name}</strong> from your trusted contacts?
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setContactToDelete(null)}
              className="px-4 py-2 rounded-full text-xs font-medium text-muted-text hover:text-navy cursor-pointer"
            >
              Cancel
            </button>
            <PillButton onClick={handleDeleteContact} variant="danger" size="sm" showArrow={false}>
              Confirm Removal
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
};
