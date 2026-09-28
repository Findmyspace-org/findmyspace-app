/**
 * Booking commercial snapshot freeze rules.
 * Keep in lockstep with public.bookings_freeze_commercial_snapshot()
 * (migrations 071 and 073).
 */

export const BOOKING_COMMERCIAL_SNAPSHOT_COLUMNS = [
  "commercial_model",
  "platform_commission_percent",
  "transaction_fee_percent",
  "platform_commission_amount",
  "transaction_fee_amount",
  "monthly_subscription_amount",
  "commercial_terms_id",
  "commercial_terms_source",
  "commercial_terms_effective_at",
] as const;

export type BookingCommercialSnapshotFields = {
  commercial_model?: string | null;
  platform_commission_percent?: number | string | null;
  transaction_fee_percent?: number | string | null;
  platform_commission_amount?: number | string | null;
  transaction_fee_amount?: number | string | null;
  monthly_subscription_amount?: number | string | null;
  commercial_terms_id?: string | null;
  commercial_terms_source?: string | null;
  commercial_terms_effective_at?: string | null;
};

export function bookingHasCommercialSnapshot(
  row: BookingCommercialSnapshotFields | null | undefined
): boolean {
  if (!row) return false;
  return BOOKING_COMMERCIAL_SNAPSHOT_COLUMNS.some((column) => {
    const value = row[column];
    return value !== null && value !== undefined;
  });
}

export type CommercialSnapshotUpdateDecision =
  | { ok: true }
  | { ok: false; reason: "legacy_backfill" | "mutate_snapshot" };

function snapshotColumnChanged(
  previous: BookingCommercialSnapshotFields,
  next: BookingCommercialSnapshotFields
): boolean {
  return BOOKING_COMMERCIAL_SNAPSHOT_COLUMNS.some((column) => {
    const oldValue = previous[column] ?? null;
    const newValue = next[column] ?? null;
    return oldValue !== newValue;
  });
}

/**
 * Mirrors the freeze trigger: legacy NULL snapshots cannot be filled in,
 * and populated snapshots cannot change. Status, payment, payout, and
 * non-snapshot money columns are outside this check.
 */
export function commercialSnapshotUpdateAllowed(
  previous: BookingCommercialSnapshotFields,
  next: BookingCommercialSnapshotFields
): CommercialSnapshotUpdateDecision {
  if (!snapshotColumnChanged(previous, next)) return { ok: true };
  if (!bookingHasCommercialSnapshot(previous)) {
    return { ok: false, reason: "legacy_backfill" };
  }
  return { ok: false, reason: "mutate_snapshot" };
}
