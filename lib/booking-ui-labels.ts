/**
 * Shared human-readable labels for booking lifecycle UI (presentation only).
 * Does not change database values or business rules.
 */

/** Owner-facing booking.status on listing booking cards (incoming requests). */
export function ownerListingBookingStatusLabel(status: string | null | undefined): string {
  const s = status || "";
  if (s === "pending_owner" || s === "pending") return "Awaiting your response";
  if (s === "accepted_awaiting_payment") return "Awaiting payment";
  if (s === "paid_confirmed" || s === "confirmed") return "Confirmed";
  if (s === "completed") return "Completed";
  if (s === "declined") return "Declined";
  if (s === "expired") return "Expired";
  if (s === "approved") return "Approved";
  return "Awaiting your response";
}

/** Renter-facing booking.status on My bookings. */
export function renterBookingStatusLabel(status: string | null | undefined): string {
  const s = status || "";
  if (s === "pending_owner") return "Waiting for host";
  if (s === "accepted_awaiting_payment") return "Awaiting payment";
  if (s === "paid_confirmed" || s === "confirmed" || s === "completed") return "Confirmed";
  if (s === "declined") return "Declined";
  if (s === "expired") return "Expired";
  return "In progress";
}

/**
 * Renter-facing payment_status chip (raw DB values → short copy).
 */
export function renterPaymentStatusLabel(paymentStatus: string | null | undefined): string {
  const s = (paymentStatus || "unpaid").toLowerCase();
  if (s === "paid" || s === "paid_confirmed") return "Paid";
  if (s === "awaiting_payment") return "Awaiting payment";
  if (s === "unpaid") return "Not paid yet";
  return paymentStatus || "Not paid yet";
}

/** Labels for owner request pipeline (matches previous getStageLabel semantics, centralized). */
export const OWNER_BOOKING_STAGE_LABELS = {
  booking_request: "Booking request",
  booking_approved: "Booking approved",
  awaiting_payment: "Awaiting payment",
  payment_received: "Payment received",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "Expired",
} as const;

export type OwnerBookingStageKey = keyof typeof OWNER_BOOKING_STAGE_LABELS;
