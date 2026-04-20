/**
 * Booking draft for date/unit selections across auth redirect.
 * sessionStorage: same tab; localStorage: survives refresh / some redirects.
 * Cleared after a successful booking request or when stale.
 */

const BOOKING_DRAFT_STORAGE_KEY = "findmyspace_booking_draft_v1";
const BOOKING_DRAFT_LOCAL_KEY = "findmyspace_booking_draft_v1_ls";

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

function parseDraft(raw: string | null): BookingDraftV1 | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isBookingDraftV1(parsed)) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readBookingDraft(): BookingDraftV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const fromSession = parseDraft(
      sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY)
    );
    if (fromSession) return fromSession;

    const fromLocal = parseDraft(localStorage.getItem(BOOKING_DRAFT_LOCAL_KEY));
    if (fromLocal) {
      try {
        sessionStorage.setItem(
          BOOKING_DRAFT_STORAGE_KEY,
          JSON.stringify(fromLocal)
        );
      } catch {
        /* ignore */
      }
      return fromLocal;
    }
    return null;
  } catch {
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
    const s = JSON.stringify(draft);
    sessionStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, s);
    try {
      localStorage.setItem(BOOKING_DRAFT_LOCAL_KEY, s);
    } catch {
      /* ignore */
    }
  } catch {
    /* quota / private mode */
  }
}

export function clearBookingDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    localStorage.removeItem(BOOKING_DRAFT_LOCAL_KEY);
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
