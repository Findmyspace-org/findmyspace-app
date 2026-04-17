/**
 * Renter-supplied `bookings.notes` should only appear in UI after the host has
 * declined or once payment is confirmed — not while a request is pending or awaiting payment.
 */
export function shouldShowBookingRequestNotes(
  status: string | null | undefined,
  paymentStatus: string | null | undefined
): boolean {
  const s = (status || "").toLowerCase();
  const ps = (paymentStatus || "").toLowerCase();

  if (s === "declined") return true;

  if (s === "paid_confirmed" || s === "confirmed" || s === "completed") {
    return true;
  }

  if (ps === "paid" || ps === "paid_confirmed") return true;

  return false;
}
