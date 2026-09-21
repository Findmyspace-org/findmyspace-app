function normalizeBookingRange(
  bookingUnit: string | null,
  startAt: string,
  endAt: string
): { start: Date; end: Date } {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (bookingUnit === "day") {
    const normalizedStart = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(end);
    const isLegacyInclusiveEnd =
      end.getUTCHours() === 23 &&
      end.getUTCMinutes() === 59 &&
      end.getUTCSeconds() >= 59;
    if (isLegacyInclusiveEnd) {
      normalizedEnd.setUTCDate(normalizedEnd.getUTCDate() + 1);
      normalizedEnd.setUTCHours(0, 0, 0, 0);
    }
    return { start: normalizedStart, end: normalizedEnd };
  }

  if (bookingUnit === "month") {
    return {
      start: new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0, 0)
      ),
      end: new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 0, 0, 0, 0)
      ),
    };
  }

  return { start, end };
}

export function bookingRangesOverlap(
  aUnit: string | null,
  aStart: string,
  aEnd: string,
  bUnit: string | null,
  bStart: string,
  bEnd: string
): boolean {
  const a = normalizeBookingRange(aUnit, aStart, aEnd);
  const b = normalizeBookingRange(bUnit, bStart, bEnd);
  return a.start < b.end && a.end > b.start;
}

export const HOST_APPROVE_BLOCKING_STATUSES = [
  "approved",
  "accepted_awaiting_payment",
  "awaiting_payment",
  "paid_confirmed",
  "confirmed",
  "completed",
] as const;

export const HOST_PENDING_STATUSES = ["pending", "pending_owner"] as const;

export function canHostRespondToStatus(status: string | null | undefined): boolean {
  return status === "pending_owner" || status === "pending";
}
