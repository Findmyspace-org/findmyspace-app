/**
 * Notification lifecycle: unread / read / archived.
 *
 * Unread:     read_at IS NULL AND archived_at IS NULL
 * Read:       read_at IS NOT NULL AND archived_at IS NULL
 * Archived:   archived_at IS NOT NULL
 */

export type NotificationLifecycleRow = {
  read_at?: string | null;
  archived_at?: string | null;
  is_read?: boolean | null;
};

export type NotificationState = "unread" | "read" | "archived";

export function getNotificationState(
  row: NotificationLifecycleRow
): NotificationState {
  if (row.archived_at) return "archived";
  if (row.read_at || row.is_read) return "read";
  return "unread";
}

export function isNotificationUnread(row: NotificationLifecycleRow): boolean {
  return getNotificationState(row) === "unread";
}

/** Payload when marking a notification read (keeps legacy is_read in sync). */
export function markNotificationReadPayload(now = new Date()): {
  read_at: string;
  is_read: true;
} {
  return { read_at: now.toISOString(), is_read: true };
}

/** Payload when archiving a notification (also marks read if still unread). */
export function markNotificationArchivedPayload(now = new Date()): {
  read_at: string;
  archived_at: string;
  is_read: true;
} {
  const iso = now.toISOString();
  return { read_at: iso, archived_at: iso, is_read: true };
}

/** Types that require user action — not informational approvals. */
export const ACTION_REQUIRED_NOTIFICATION_TYPES = new Set<string>([
  "booking_request",
  "listing_enquiry",
  "listing_enquiry_received",
  "listing_claim_interest",
  "listing_question",
  "listing_pending",
  "identity_rejected",
  "bank_rejected",
  "payment_needed",
  "booking_message",
]);

/** Completed / approved outcomes — green badge, informational. */
export const APPROVED_NOTIFICATION_TYPES = new Set<string>([
  "identity_verified",
  "bank_verified",
  "listing_activated",
  "ownership_proof_verified",
  "booking_confirmed",
  "booking_paid",
  "payment_received",
  "listing_question_answered",
]);

export function isActionRequiredNotificationType(type: string): boolean {
  return ACTION_REQUIRED_NOTIFICATION_TYPES.has(type);
}

export function isApprovedNotificationType(type: string): boolean {
  return APPROVED_NOTIFICATION_TYPES.has(type);
}

/** Admin queue types cleared when an admin opens the related item. */
export const ADMIN_AUTO_READ_NOTIFICATION_TYPES = [
  "identity_submitted",
  "bank_submitted",
  "listing_enquiry",
  "listing_enquiry_received",
  "listing_claim_interest",
  "listing_submitted",
  "listing_pending",
  "booking_request",
  "payment_received",
] as const;

/** Host/renter verification outcome types cleared on verification page visit. */
export const VERIFICATION_OUTCOME_NOTIFICATION_TYPES = [
  "identity_verified",
  "identity_rejected",
  "bank_verified",
  "bank_rejected",
  "identity_submitted",
  "bank_submitted",
] as const;
