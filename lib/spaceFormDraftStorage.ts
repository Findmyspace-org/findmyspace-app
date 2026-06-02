/**
 * Persists listing form text/number state across refresh (localStorage).
 * Files (images, ownership) cannot be restored — user re-adds those.
 */

const KEY = "findmyspace_space_form_draft_v2";
const MAX_AGE_MS = 1000 * 60 * 60 * 72; // 72 hours

export type SpaceFormDraftV1 = {
  v: 2;
  savedAt: number;
  title: string;
  description: string;
  city: string;
  suburb: string;
  streetAddress: string;
  spaceType: string;
  bookingUnit: string;
  pricePerHour: string;
  pricePerDay: string;
  pricePerMonth: string;
  minBookingHours: string;
  minBookingDays: string;
  minBookingMonths: string;
  province: string;
  postalCode: string;
  country: string;
  depositType: string;
  latitude: number;
  longitude: number;
  manualAdvisorCode: string;
  attributes: Record<string, string[]>;
  /** Multi-step guided flow */
  currentStep?: number;
  maxUnlockedStep?: number;
  bookingIntelData?: Record<string, unknown> | null;
  bookingRequirements?: Record<string, boolean> | null;
};

function isDraft(value: unknown): value is SpaceFormDraftV1 {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    o.v === 2 &&
    typeof o.savedAt === "number" &&
    typeof o.title === "string" &&
    typeof o.streetAddress === "string"
  );
}

export function readSpaceFormDraft(): SpaceFormDraftV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function writeSpaceFormDraft(draft: Omit<SpaceFormDraftV1, "v" | "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SpaceFormDraftV1 = {
      v: 2,
      savedAt: Date.now(),
      ...draft,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function clearSpaceFormDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
