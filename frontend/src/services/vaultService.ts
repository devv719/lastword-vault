import type {
  ActivityEvent,
  CheckInSettings,
  Contact,
  DevForcedState,
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

  async createItem(item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<VaultItem> {
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

    // Log activity
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      type: 'item_update',
      title: `New ${item.type === 'file' ? 'Document' : 'Secure Note'} Sealed`,
      description: `"${item.title}" encrypted and committed to vault inventory.`,
      timestamp: new Date().toISOString(),
      ipAddress: '198.51.100.42',
      device: 'Vault Console',
      method: 'Client-side AES-GCM Seal',
    };
    const currentActivities = await this.getActivityEvents();
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify([activity, ...currentActivities]));

    return newItem;
  },

  async updateItem(id: string, updates: Partial<VaultItem>): Promise<VaultItem> {
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
  },

  async deleteItem(id: string): Promise<void> {
    await delay(250);
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
    await delay(300);
    const contacts = await this.getContacts();
    const newContact: Contact = {
      ...contact,
      id: `cnt-${Date.now()}`,
      status: 'pending',
      assignedItemsCount: 0,
      createdAt: new Date().toISOString(),
    };
    const updated = [...contacts, newContact];
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(updated));

    // Log activity
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      type: 'contact_verification',
      title: 'New Trusted Contact Added',
      description: `Verification dispatched to ${contact.email} (${contact.name}).`,
      timestamp: new Date().toISOString(),
      ipAddress: '198.51.100.42',
      device: 'Vault Console',
      method: 'Contact Registry',
    };
    const currentActivities = await this.getActivityEvents();
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify([activity, ...currentActivities]));

    return newContact;
  },

  async updateContact(id: string, updates: Partial<Contact>): Promise<Contact> {
    await delay(250);
    const contacts = await this.getContacts();
    const idx = contacts.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Contact not found');

    const updatedContact = { ...contacts[idx], ...updates };
    contacts[idx] = updatedContact;
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
    return updatedContact;
  },

  async deleteContact(id: string): Promise<void> {
    await delay(250);
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
    await delay(350);
    const contacts = await this.getContacts();
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) throw new Error('Contact not found');

    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      type: 'contact_verification',
      title: 'Verification Link Dispatched',
      description: `Cryptographic verification challenge resent to ${contact.email}.`,
      timestamp: new Date().toISOString(),
      ipAddress: '198.51.100.42',
      device: 'Vault Console',
      method: 'Automated Dispatcher',
    };
    const currentActivities = await this.getActivityEvents();
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify([activity, ...currentActivities]));
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
