/**
 * Shared finance / payment state helpers for invoices, PayFast, dashboards, and CSV.
 * Keep logic centralized so UI, API routes, and line builders stay aligned.
 */

export function normalizePaymentStatus(
  paymentStatus: string | null | undefined
): string {
  return (paymentStatus || "").trim();
}

export function normalizeBookingStatus(
  status: string | null | undefined
): string {
  return (status || "").trim();
}

/** Renter payment has cleared (invoices, paid summaries). */
export function isPaymentSettledForReporting(
  paymentStatus: string | null | undefined
): boolean {
  const ps = normalizePaymentStatus(paymentStatus).toLowerCase();
  return ps === "paid" || ps === "paid_confirmed";
}

/** Booking lifecycle status used for paid / invoice eligibility. */
export function isBookingStatusEligibleForPaidReporting(
  status: string | null | undefined
): boolean {
  const s = normalizeBookingStatus(status).toLowerCase();
  return (
    s === "paid_confirmed" || s === "confirmed" || s === "completed"
  );
}

/** Invoice HTML and similar: paid + allowed booking status. */
export function isInvoiceEligibleBooking(
  status: string | null | undefined,
  paymentStatus: string | null | undefined
): boolean {
  return (
    isPaymentSettledForReporting(paymentStatus) &&
    isBookingStatusEligibleForPaidReporting(status)
  );
}

/**
 * Synthetic finance line when a booking has no booking_charges rows but payment
 * was recorded on the booking row (legacy / failed charge insert).
 */
export function isLegacyPaidBookingWithoutCharges(booking: {
  status: string | null;
  payment_status: string | null;
  total_price: number | null;
}): boolean {
  const tp = Number(booking.total_price || 0);
  if (tp <= 0) return false;
  return (
    isPaymentSettledForReporting(booking.payment_status) &&
    isBookingStatusEligibleForPaidReporting(booking.status)
  );
}

/**
 * Normalize charge row status for filters and summaries.
 * Maps paid_confirmed → paid so dropdowns and comparisons stay consistent.
 */
export function normalizeChargeLineStatus(
  raw: string | null | undefined
): string {
  const s = (raw || "").trim().toLowerCase();
  if (s === "paid" || s === "paid_confirmed") return "paid";
  if (s === "pending") return "pending";
  return raw?.trim() || "pending";
}

export function isChargeLinePaidForReporting(
  status: string | null | undefined
): boolean {
  return normalizeChargeLineStatus(status) === "paid";
}

export function isChargeLinePendingForReporting(
  status: string | null | undefined
): boolean {
  return normalizeChargeLineStatus(status) === "pending";
}

/** PayFast ITN / initiate: booking is waiting for checkout payment. */
export function isAwaitingGatewayPayment(booking: {
  status: string | null;
  payment_status: string | null;
}): boolean {
  return (
    normalizeBookingStatus(booking.status).toLowerCase() ===
      "accepted_awaiting_payment" &&
    normalizePaymentStatus(booking.payment_status || "unpaid").toLowerCase() ===
      "awaiting_payment"
  );
}
