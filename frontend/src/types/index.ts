/** User account status in the dead man's switch lifecycle. */
export type UserStatus = "ACTIVE" | "WARNED" | "GRACE" | "RELEASED";

/** Core user profile returned by the API. */
export interface User {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  checkin_interval_hours: number;
  grace_period_hours: number;
  last_checkin_at: string | null;
  next_deadline: string | null;
  demo_mode: boolean;
  created_at: string;
}

/** A vault item stored by the user. */
export interface VaultItem {
  id: string;
  title: string;
  encrypted_note: string | null;
  s3_key: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  release_authorized: boolean;
  recipients: VaultItemRecipient[];
  created_at: string;
  updated_at: string;
}

/** A recipient assignment on a vault item. */
export interface VaultItemRecipient {
  id: string;
  vault_item_id: string;
  contact_id: string;
  contact_name: string;
  contact_email: string;
  downloaded: boolean;
  released_at: string | null;
}

/** A trusted contact. */
export interface Contact {
  id: string;
  name: string;
  email: string;
  relationship: string | null;
  verified: boolean;
  created_at: string;
}

/** An audit log entry. */
export interface AuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

/** Check-in status returned by the API. */
export interface CheckInStatus {
  status: UserStatus;
  next_deadline: string | null;
  seconds_remaining: number | null;
  last_checkin_at: string | null;
}

/** Dashboard summary returned by the API. */
export interface DashboardData {
  status: UserStatus;
  next_deadline: string | null;
  seconds_remaining: number | null;
  vault_item_count: number;
  authorized_item_count: number;
  contact_count: number;
  recent_activity: AuditEntry[];
}

/** Standard paginated response wrapper. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

/** API error response. */
export interface ApiError {
  detail: string;
}

