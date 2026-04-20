/**
 * Temporary client-side booking draft for auth handoff (sessionStorage).
 * Cleared after a successful booking request or when stale.
 */

const BOOKING_DRAFT_STORAGE_KEY = "findmyspace_booking_draft_v1";

const DRAFT_VERSION = 1 as const;
const MAX_AGE_MS = 1000 * 60 * 60 * 48; // 48 hours

export type BookingUnitKind = "hour" | "day" | "month";

export type BookingDraftV1 = {
  v: typeof DRAFT_VERSION;
  spaceId: string;
  bookingUnit: BookingUnitKind;
  hourDate: string;
  hourStart: string;
  hourEnd: string;
  dayStart: string;
  dayEnd: string;
  monthStart: string;
  monthEnd: string;
  savedAt: number;
};

export function normalizeBookingUnit(
  unit: string | null | undefined
): BookingUnitKind {
  if (unit === "hour" || unit === "day" || unit === "month") return unit;
  return "day";
}

function isBookingDraftV1(value: unknown): value is BookingDraftV1 {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    o.v === DRAFT_VERSION &&
    typeof o.spaceId === "string" &&
    (o.bookingUnit === "hour" ||
      o.bookingUnit === "day" ||
      o.bookingUnit === "month") &&
    typeof o.savedAt === "number"
  );
}

export function readBookingDraft(): BookingDraftV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isBookingDraftV1(parsed)) {
      sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function writeBookingDraft(fields: {
  spaceId: string;
  bookingUnit: BookingUnitKind;
  hourDate: string;
  hourStart: string;
  hourEnd: string;
  dayStart: string;
  dayEnd: string;
  monthStart: string;
  monthEnd: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    const draft: BookingDraftV1 = {
      v: DRAFT_VERSION,
      spaceId: fields.spaceId,
      bookingUnit: fields.bookingUnit,
      hourDate: fields.hourDate,
      hourStart: fields.hourStart,
      hourEnd: fields.hourEnd,
      dayStart: fields.dayStart,
      dayEnd: fields.dayEnd,
      monthStart: fields.monthStart,
      monthEnd: fields.monthEnd,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearBookingDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function draftMatchesSpace(
  draft: BookingDraftV1,
  spaceId: string,
  bookingUnit: string | null
): boolean {
  return (
    draft.spaceId === spaceId &&
    draft.bookingUnit === normalizeBookingUnit(bookingUnit)
  );
}
