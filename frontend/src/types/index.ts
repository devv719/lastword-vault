export type VaultState = 'active' | 'warning' | 'grace' | 'releasing' | 'released';

export type VaultCategory = 'Financial' | 'Legal' | 'Credentials' | 'Personal' | 'Other';

export type RecipientVerificationStatus = 'verified' | 'pending' | 'unassigned' | 'failed' | 'expired';

export interface VaultItem {
  id: string;
  title: string;
  type: 'file' | 'note';
  category: VaultCategory;
  originalFilename?: string;
  fileSizeBytes?: number;
  noteContent?: string;
  isMonospace?: boolean;
  releaseAuthorized: boolean;
  recipientId: string | null;
  recipientName: string | null;
  verificationStatus: RecipientVerificationStatus;
  updatedAt: string;
  createdAt: string;
}

export type ContactStatus = 'verified' | 'pending' | 'failed' | 'expired';

export interface Contact {
  id: string;
  name: string;
  email: string;
  relationship: string;
  status: ContactStatus;
  assignedItemsCount: number;
  phone?: string;
  verifiedAt?: string;
  createdAt: string;
}

export interface CheckInSettings {
  intervalMode: 'daily' | 'weekly' | 'custom';
  customDays: number;
  gracePeriodDays: number;
  demoMode: boolean;
  demoIntervalSeconds: number;
  demoGraceSeconds: number;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  reminderHoursBefore: number[];
}

export type ActivityEventType =
  | 'checkin'
  | 'warning'
  | 'transition'
  | 'release'
  | 'item_update'
  | 'contact_verification';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string;
  fromState?: VaultState;
  toState?: VaultState;
  timestamp: string;
  ipAddress: string;
  device: string;
  method: string;
}

export interface VaultSummary {
  status: VaultState;
  nextDeadline: string;
  secondsRemaining: number;
  totalSecondsInInterval: number;
  lastCheckinAt: string;
  totalItems: number;
  authorizedItems: number;
  filesCount: number;
  notesCount: number;
  contactsCount: number;
  verifiedContactsCount: number;
  assignedPercentage: number;
}

export type AsyncState = 'idle' | 'loading' | 'success' | 'error' | 'empty';

export type DevForcedState = 'loading' | 'empty' | 'error' | null;

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  status: 'ACTIVE' | 'WARNED' | 'GRACE' | 'RELEASED';
  checkin_interval_hours: number;
  grace_period_hours: number;
  last_checkin_at?: string | null;
  next_deadline?: string | null;
  warned_at?: string | null;
  grace_expires_at?: string | null;
  demo_mode: boolean;
  pending_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

