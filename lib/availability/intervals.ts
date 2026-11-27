/**
 * Occupancy statuses copied from apply_host_booking_response.
 * A pending request is not in this list and does not reserve the space.
 */
export const RESERVING_BOOKING_STATUSES = [
  "approved",
  "accepted_awaiting_payment",
  "awaiting_payment",
  "paid_confirmed",
  "confirmed",
  "completed",
] as const;

export const PENDING_BOOKING_STATUSES = ["pending", "pending_owner"] as const;

/** Same key as migration 066: hashtext('booking-space:' || space_id). */
export const SPACE_AVAILABILITY_LOCK_PREFIX = "booking-space:";

export type ReservingBookingStatus = (typeof RESERVING_BOOKING_STATUSES)[number];

export function bookingStatusReservesAvailability(
  status: string | null | undefined
): boolean {
  return RESERVING_BOOKING_STATUSES.includes(status as ReservingBookingStatus);
}

export function bookingStatusIsPending(status: string | null | undefined): boolean {
  return status === "pending" || status === "pending_owner";
}

/**
 * Half-open overlap on stored instants: [start, end).
 * Back-to-back ranges (one ends when the next starts) do not overlap.
 * This matches the predicate in apply_host_booking_response.
 */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function availabilityLockKey(spaceId: string): string {
  return `${SPACE_AVAILABILITY_LOCK_PREFIX}${spaceId}`;
}
