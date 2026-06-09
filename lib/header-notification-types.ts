/**
 * Notification types shown in the header bell dropdown and counted on the Comms badge.
 * Keeps badge count aligned with visible dropdown items.
 */
export const HEADER_DROPDOWN_NOTIFICATION_TYPES = [
  "payment_needed",
  "booking_request",
  "booking_declined",
  "booking_expired",
  "booking_confirmed",
  "booking_paid",
  "payment_received",
  "booking_message",
  "identity_submitted",
  "bank_submitted",
  "identity_verified",
  "identity_rejected",
  "bank_verified",
  "bank_rejected",
  "listing_question",
  "listing_question_answered",
  "listing_submitted",
  "listing_pending",
  "listing_rejected",
  "listing_needs_changes",
  "listing_activated",
  "ownership_proof_verified",
  "listing_enquiry",
  "listing_enquiry_received",
  "listing_claim_interest",
  "listing_claimed",
] as const;

export const HEADER_DROPDOWN_NOTIFICATION_TYPE_SET = new Set<string>(
  HEADER_DROPDOWN_NOTIFICATION_TYPES
);
