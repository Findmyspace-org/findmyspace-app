/**
 * Manual MVP (`manual_mvp` / `manual_test`) is a production-reachable test
 * checkout on `/dashboard/my-bookings/[id]/pay`. `payments.owner_id` is NOT NULL
 * in the database, so organisation / NULL-owner bookings cannot use it.
 *
 * Supported production payment is PayFast. Do not stamp a manager as owner_id.
 */
export function bookingAllowsManualMvpPayment(booking: {
  owner_id: string | null;
  organisation_id?: string | null;
}): boolean {
  if (!booking.owner_id) return false;
  if (booking.organisation_id) return false;
  return true;
}
