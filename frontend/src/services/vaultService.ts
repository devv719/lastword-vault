import api from '../api/client';
import type {
  ActivityEvent,
  ApiVaultItem,
  CheckInSettings,
  Contact,
  DevForcedState,
  RemoteVault,
  VaultItem,
  VaultSummary,
} from '../types';
import {
  initialActivityEvents,
  initialContacts,
  initialSettings,
  initialVaultItems,
} from '../mocks/vaultData';

const STORAGE_KEYS = {
  ITEMS: 'lastword_vault_items',
  CONTACTS: 'lastword_vault_contacts',
  SETTINGS: 'lastword_vault_settings',
  ACTIVITY: 'lastword_vault_activity',
  LAST_CHECKIN: 'lastword_last_checkin_timestamp',
};

function getForcedState(): DevForcedState {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  if (state === 'loading' || state === 'empty' || state === 'error') {
    return state;
  }
  return null;
}

function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const vaultService = {
  async getSummary(): Promise<VaultSummary> {
    const forced = getForcedState();
    if (forced === 'loading') {
      await new Promise(() => {}); // never resolves
    }
    if (forced === 'error') {
      await delay(200);
      throw new Error('Simulated network error retrieving vault summary.');
    }

    await delay(180);
    const settings = await this.getSettings();
    const items = await this.getItems();
    const contacts = await this.getContacts();

    const storedLastCheckin = localStorage.getItem(STORAGE_KEYS.LAST_CHECKIN);
    const lastCheckinTime = storedLastCheckin ? parseInt(storedLastCheckin, 10) : Date.now() - 3600 * 1000 * 12;

    const intervalSeconds = settings.demoMode
      ? settings.demoIntervalSeconds
      : settings.customDays * 86400;

    const elapsed = Math.floor((Date.now() - lastCheckinTime) / 1000);
    const remaining = Math.max(0, intervalSeconds - elapsed);

    let status: VaultSummary['status'] = 'active';
    if (remaining === 0) {
      status = 'warning';
    }

    const authorized = items.filter((i) => i.releaseAuthorized).length;
    const verified = contacts.filter((c) => c.status === 'verified').length;
    const assignedPercentage = items.length > 0
      ? Math.round((items.filter((i) => i.recipientId !== null).length / items.length) * 100)
      : 0;

    return {
      status,
      nextDeadline: new Date(lastCheckinTime + intervalSeconds * 1000).toISOString(),
      secondsRemaining: remaining,
      totalSecondsInInterval: intervalSeconds,
      lastCheckinAt: new Date(lastCheckinTime).toISOString(),
      totalItems: items.length,
      authorizedItems: authorized,
      filesCount: items.filter((i) => i.type === 'file').length,
      notesCount: items.filter((i) => i.type === 'note').length,
      contactsCount: contacts.length,
      verifiedContactsCount: verified,
      assignedPercentage,
    };
  },

  async checkInNow(): Promise<VaultSummary> {
    await delay(350);
    const now = Date.now();
    localStorage.setItem(STORAGE_KEYS.LAST_CHECKIN, now.toString());

    // Record activity event
    const newEvent: ActivityEvent = {
      id: `act-${Date.now()}`,
      type: 'checkin',
      title: 'Manual Check-in Pulse Authenticated',
      description: 'Owner authenticated active presence. All fail-safe countdowns reset to baseline.',
      timestamp: new Date().toISOString(),
      ipAddress: '198.51.100.42 (Local session)',
      device: navigator.userAgent.includes('Mac') ? 'Desktop Console (macOS)' : 'Web Client',
      method: 'Interactive Pulse Button',
    };

    const currentActivities = await this.getActivityEvents();
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify([newEvent, ...currentActivities]));

    return this.getSummary();
  },

  async getRemoteVault(): Promise<RemoteVault | null> {
    try {
      const resp = await api.get<RemoteVault>('/vault');
      return resp.data;
    } catch {
      return null;
    }
  },

  async initRemoteVault(
    envelope: { encryptedKey: string; salt: string; iv: string },
    name = 'Primary Vault'
  ): Promise<RemoteVault> {
    const resp = await api.post<RemoteVault>('/vault', {
      name,
      encrypted_vault_key_envelope: envelope.encryptedKey,
      envelope_salt: envelope.salt,
      envelope_iv: envelope.iv,
      kdf_algorithm: 'PBKDF2-SHA256',
      kdf_iterations: 100000,
    });
    return resp.data;
  },

  async getItems(): Promise<VaultItem[]> {
    const forced = getForcedState();
    if (forced === 'loading') await new Promise(() => {});
    if (forced === 'error') {
      await delay(200);
      throw new Error('Failed to load cryptographic vault records.');
    }
    if (forced === 'empty') {
      await delay(150);
      return [];
    }

    // Attempt real backend call first
    try {
      const resp = await api.get<ApiVaultItem[]>('/vault/items');
      if (Array.isArray(resp.data)) {
        return resp.data.map((item) => ({
          id: item.id,
          title: item.title,
          type: item.item_type === 'document' ? 'file' : 'note',
          category: (item.category as any) || 'Documents',
          originalFilename: item.original_filename || undefined,
          fileSizeBytes: item.file_size || item.file_size_bytes || undefined,
          noteContent: item.encrypted_note || item.encrypted_content || undefined,
          s3Key: item.s3_key || null,
          releaseAuthorized: item.release_authorized,
          recipientId: item.assigned_contact_id || null,
          recipientName: item.assigned_contact ? item.assigned_contact.name : null,
          verificationStatus: item.assigned_contact ? 'verified' : 'unassigned',
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        }));
      }
    } catch {
      // Fallback to local storage
    }

    await delay(200);
    const raw = localStorage.getItem(STORAGE_KEYS.ITEMS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(initialVaultItems));
      return initialVaultItems;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return initialVaultItems;
    }
  },

  async createItem(
    item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>,
    cryptoMeta?: {
      encryptedTitle?: string;
      encryptedContent?: string;
      encryptionIv?: string;
      mimeType?: string;
      fileSize?: number;
    }
  ): Promise<VaultItem> {
    const isValidUuid = (val?: string | null) =>
      Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

    // For file documents, large ciphertext is uploaded to S3 via PUT /vault/items/{id}/file
    // Avoid sending multi-megabyte ciphertext in POST /vault/items to prevent 413/422 payload errors
    const isDocument = item.type === 'file';
    const contentToSend = isDocument ? null : (cryptoMeta?.encryptedContent || item.noteContent || null);

    try {
      const resp = await api.post<ApiVaultItem>('/vault/items', {
        title: item.title,
        item_type: isDocument ? 'document' : 'note',
        category: item.category,
        encrypted_title: cryptoMeta?.encryptedTitle || null,
        encrypted_content: contentToSend,
        encryption_iv: cryptoMeta?.encryptionIv || null,
        mime_type: cryptoMeta?.mimeType || null,
        file_size: cryptoMeta?.fileSize || item.fileSizeBytes || null,
        encrypted_note: contentToSend,
        original_filename: item.originalFilename || null,
        file_size_bytes: item.fileSizeBytes || cryptoMeta?.fileSize || null,
        release_authorized: item.releaseAuthorized,
        assigned_contact_id: isValidUuid(item.recipientId) ? item.recipientId : null,
      });

      const backendItem = resp.data;
      const newItem: VaultItem = {
        ...item,
        id: backendItem.id,
        createdAt: backendItem.created_at,
        updatedAt: backendItem.updated_at,
      };

      // Also sync to local storage cache
      const local = await this.getItems();
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify([newItem, ...local]));
      return newItem;
    } catch (err: any) {
      // If the backend responded with an HTTP error (422, 400, 404, 500, etc.),
      // DO NOT mask it with fake vlt-* local storage fallback!
      // Throw the real error with the backend's validation details so callers and users know.
      if (err?.response) {
        const detail = err.response.data?.detail;
        const msg = typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d: any) => `${d.loc ? d.loc.slice(1).join('.') + ': ' : ''}${d.msg}`).join(', ')
            : JSON.stringify(detail || err.message);
        throw new Error(`API Error (${err.response.status}): ${msg}`);
      }

      // Only fallback to local storage if purely offline / demo without backend connectivity
      const isNetworkError = err?.code === 'ERR_NETWORK' || !err?.response;
      if (isNetworkError && !item.originalFilename) {
        await delay(300);
        const items = await this.getItems();
        const newItem: VaultItem = {
          ...item,
          id: `vlt-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const updated = [newItem, ...items];
        localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(updated));
        return newItem;
      }

      throw err;
    }
  },

  async uploadFile(
    itemId: string,
    fileData: ArrayBuffer | Uint8Array | Blob,
    metadata?: { originalFilename?: string; mimeType?: string }
  ): Promise<VaultItem> {
    const formData = new FormData();
    const blob = fileData instanceof Blob
      ? fileData
      : new Blob([fileData as any], { type: metadata?.mimeType || 'application/octet-stream' });
    formData.append('file', blob, metadata?.originalFilename || 'encrypted.bin');

    const resp = await api.put<ApiVaultItem>(`/vault/items/${itemId}/file`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const updated = resp.data;
    const item: VaultItem = {
      id: updated.id,
      title: updated.title,
      type: 'file',
      category: (updated.category as any) || 'Documents',
      originalFilename: updated.original_filename || metadata?.originalFilename || undefined,
      fileSizeBytes: updated.file_size || updated.file_size_bytes || undefined,
      noteContent: undefined,
      s3Key: updated.s3_key || null,
      releaseAuthorized: updated.release_authorized,
      recipientId: updated.assigned_contact_id || null,
      recipientName: updated.assigned_contact ? updated.assigned_contact.name : null,
      verificationStatus: updated.assigned_contact ? 'verified' : 'unassigned',
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };

    // Update local cache
    const items = await this.getItems();
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      items[idx] = item;
    } else {
      items.unshift(item);
    }
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items));
    return item;
  },

  async downloadFile(itemId: string): Promise<{
    data: ArrayBuffer;
    iv: string;
    originalFilename?: string;
    mimeType?: string;
  }> {
    const resp = await api.get(`/vault/items/${itemId}/file`, {
      responseType: 'arraybuffer',
    });

    const iv = (resp.headers['x-encryption-iv'] || resp.headers['X-Encryption-IV'] || '') as string;
    const originalFilename = (resp.headers['x-original-filename'] || resp.headers['X-Original-Filename'] || '') as string;
    const mimeType = (resp.headers['content-type'] || 'application/octet-stream') as string;

    return {
      data: resp.data as ArrayBuffer,
      iv,
      originalFilename: originalFilename || undefined,
      mimeType,
    };
  },

  async updateItem(id: string, updates: Partial<VaultItem>): Promise<VaultItem> {
    try {
      const resp = await api.patch<ApiVaultItem>(`/vault/items/${id}`, {
        title: updates.title,
        category: updates.category,
        release_authorized: updates.releaseAuthorized,
        assigned_contact_id: updates.recipientId,
        encrypted_note: updates.noteContent,
        encrypted_content: updates.noteContent,
      });

      const updated = resp.data;
      return {
        id: updated.id,
        title: updated.title,
        type: updated.item_type === 'document' ? 'file' : 'note',
        category: (updated.category as any) || 'Documents',
        originalFilename: updated.original_filename || undefined,
        fileSizeBytes: updated.file_size || updated.file_size_bytes || undefined,
        noteContent: updated.encrypted_content || updated.encrypted_note || undefined,
        releaseAuthorized: updated.release_authorized,
        recipientId: updated.assigned_contact_id || null,
        recipientName: updated.assigned_contact ? updated.assigned_contact.name : null,
        verificationStatus: updated.assigned_contact ? 'verified' : 'unassigned',
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };
    } catch {
      await delay(250);
      const items = await this.getItems();
      const index = items.findIndex((i) => i.id === id);
      if (index === -1) throw new Error('Item not found');

      const updatedItem = {
        ...items[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      items[index] = updatedItem;
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items));
      return updatedItem;
    }
  },

  async deleteItem(id: string): Promise<void> {
    try {
      await api.delete(`/vault/items/${id}`);
    } catch {
      // Ignore or fallback
    }
    const items = await this.getItems();
    const filtered = items.filter((i) => i.id !== id);
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(filtered));
  },

  async getContacts(): Promise<Contact[]> {
    const forced = getForcedState();
    if (forced === 'loading') await new Promise(() => {});
    if (forced === 'error') {
      await delay(200);
      throw new Error('Failed to load trusted contacts directory.');
    }
    if (forced === 'empty') {
      await delay(150);
      return [];
    }

    // 1. Try real backend API first
    try {
      const resp = await api.get<any[]>('/contacts');
      if (Array.isArray(resp.data)) {
        const contacts: Contact[] = resp.data.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          relationship: c.relationship_type || 'Trusted Contact',
          status: c.verified ? 'verified' : 'pending',
          assignedItemsCount: 0,
          phone: c.phone || undefined,
          verifiedAt: c.verified_at || undefined,
          createdAt: c.created_at,
        }));
        localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
        return contacts;
      }
    } catch {
      // Backend not reached, fall through to localStorage
    }

    // 2. Local fallback
    await delay(180);
    const raw = localStorage.getItem(STORAGE_KEYS.CONTACTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(initialContacts));
      return initialContacts;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return initialContacts;
    }
  },

  async createContact(
    contact: Omit<Contact, 'id' | 'status' | 'assignedItemsCount' | 'createdAt'>
  ): Promise<Contact> {
    try {
      const resp = await api.post('/contacts', {
        name: contact.name,
        email: contact.email,
        relationship_type: contact.relationship,
        phone: contact.phone || null,
      });
      const c = resp.data;
      const newContact: Contact = {
        id: c.id,
        name: c.name,
        email: c.email,
        relationship: c.relationship_type || contact.relationship,
        status: c.verified ? 'verified' : 'pending',
        assignedItemsCount: 0,
        phone: c.phone || undefined,
        verifiedAt: c.verified_at || undefined,
        createdAt: c.created_at,
      };
      const contacts = await this.getContacts();
      localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify([...contacts, newContact]));

      // Log activity
      const activity: ActivityEvent = {
        id: `act-${Date.now()}`,
        type: 'contact_verification',
        title: 'New Trusted Contact Added',
        description: `Verification email dispatched via Amazon SES to ${contact.email} (${contact.name}).`,
        timestamp: new Date().toISOString(),
        ipAddress: '198.51.100.42',
        device: 'Vault Console',
        method: 'Amazon SES Dispatcher',
      };
      const currentActivities = await this.getActivityEvents();
      localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify([activity, ...currentActivities]));

      return newContact;
    } catch (err: any) {
      if (err?.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  async updateContact(id: string, updates: Partial<Contact>): Promise<Contact> {
    try {
      const resp = await api.patch(`/contacts/${id}`, {
        name: updates.name,
        email: updates.email,
        relationship_type: updates.relationship,
        phone: updates.phone,
      });
      const c = resp.data;
      const updatedContact: Contact = {
        id: c.id,
        name: c.name,
        email: c.email,
        relationship: c.relationship_type || updates.relationship || 'Trusted Contact',
        status: c.verified ? 'verified' : 'pending',
        assignedItemsCount: updates.assignedItemsCount || 0,
        phone: c.phone || undefined,
        verifiedAt: c.verified_at || undefined,
        createdAt: c.created_at,
      };
      const contacts = await this.getContacts();
      const idx = contacts.findIndex((c) => c.id === id);
      if (idx !== -1) contacts[idx] = updatedContact;
      localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
      return updatedContact;
    } catch (err: any) {
      if (err?.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  async deleteContact(id: string): Promise<void> {
    try {
      await api.delete(`/contacts/${id}`);
    } catch (err: any) {
      if (err?.response?.status !== 404 && err?.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
    }
    const contacts = await this.getContacts();
    const filtered = contacts.filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(filtered));

    // Clear recipients matching this contact from items
    const items = await this.getItems();
    const updatedItems = items.map((i) =>
      i.recipientId === id
        ? { ...i, recipientId: null, recipientName: null, verificationStatus: 'unassigned' as const }
        : i
    );
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(updatedItems));
  },

  async resendVerification(contactId: string): Promise<void> {
    try {
      await api.post(`/contacts/${contactId}/resend`);
      const activity: ActivityEvent = {
        id: `act-${Date.now()}`,
        type: 'contact_verification',
        title: 'Verification Link Dispatched',
        description: `Cryptographic verification challenge resent via Amazon SES.`,
        timestamp: new Date().toISOString(),
        ipAddress: '198.51.100.42',
        device: 'Vault Console',
        method: 'Amazon SES Dispatcher',
      };
      const currentActivities = await this.getActivityEvents();
      localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify([activity, ...currentActivities]));
    } catch (err: any) {
      if (err?.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  async sendTestEmail(toEmail?: string): Promise<{ success: boolean; message: string; details?: any }> {
    const resp = await api.post('/checkin/test-email', { to_email: toEmail || null });
    return resp.data;
  },

  async sendCheckinReminder(): Promise<{ message: string; deadline: string; hours_remaining: number }> {
    const resp = await api.post('/checkin/send-reminder');
    return resp.data;
  },

  async getSettings(): Promise<CheckInSettings> {
    await delay(120);
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
      return initialSettings;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return initialSettings;
    }
  },

  async updateSettings(settings: CheckInSettings): Promise<CheckInSettings> {
    await delay(300);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));

    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      type: 'transition',
      title: 'Check-in Policy Reconfigured',
      description: settings.demoMode
        ? 'Demo mode active. Check-in schedule accelerated to 2-minute cycle.'
        : `Routine cadence adjusted to ${settings.intervalMode} schedule with ${settings.gracePeriodDays}-day grace buffer.`,
      timestamp: new Date().toISOString(),
      ipAddress: '198.51.100.42',
      device: 'Vault Console',
      method: 'Policy Engine',
    };
    const currentActivities = await this.getActivityEvents();
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify([activity, ...currentActivities]));

    return settings;
  },

  async getActivityEvents(): Promise<ActivityEvent[]> {
    const forced = getForcedState();
    if (forced === 'loading') await new Promise(() => {});
    if (forced === 'error') {
      await delay(200);
      throw new Error('Audit trail ledger unavailable.');
    }
    if (forced === 'empty') {
      await delay(150);
      return [];
    }

    await delay(150);
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(initialActivityEvents));
      return initialActivityEvents;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return initialActivityEvents;
    }
  },
};
