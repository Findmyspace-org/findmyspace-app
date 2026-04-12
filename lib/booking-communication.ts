/**
 * Renter ↔ owner messaging eligibility (My Bookings + API enforcement).
 */

export function isCommunicationAllowed(booking: {
  status: string | null;
  payment_status: string | null;
}): boolean {
  const st = (booking.status || "").trim().toLowerCase();
  const ps = (booking.payment_status || "").trim().toLowerCase();

  const statusOk =
    st === "paid_confirmed" || st === "confirmed" || st === "completed";

  const paymentOk = ps === "paid" || ps === "paid_confirmed";

  return statusOk && paymentOk;
}
