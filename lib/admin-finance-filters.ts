import type { FinanceBookingInput, FinanceLineItem } from "@/lib/finance-booking-lines";
import {
  monthKeyFromPaidAt,
  monthLabelFromKey,
  resolveEffectivePaidAt,
} from "@/lib/finance-booking-lines";
import {
  isChargeLinePaidForReporting,
  normalizeChargeLineStatus,
} from "@/lib/finance-status";

export type AdminFinanceFilters = {
  dateFrom: string;
  dateTo: string;
  status: string;
  chargeType: string;
  spaceId: string;
};

export function parseAdminFinanceFilters(
  searchParams: URLSearchParams
): AdminFinanceFilters {
  return {
    dateFrom: searchParams.get("dateFrom") || "",
    dateTo: searchParams.get("dateTo") || "",
    status: searchParams.get("status") || "all",
    chargeType: searchParams.get("chargeType") || "all",
    spaceId: searchParams.get("spaceId") || "all",
  };
}

export function filterFinanceLineItems(
  lines: FinanceLineItem[],
  bookings: FinanceBookingInput[],
  f: AdminFinanceFilters
): FinanceLineItem[] {
  const fromTs = f.dateFrom
    ? new Date(`${f.dateFrom}T00:00:00.000Z`).getTime()
    : null;
  const toTs = f.dateTo
    ? new Date(`${f.dateTo}T23:59:59.999Z`).getTime()
    : null;

  return lines.filter((t) => {
    const booking = bookings.find((x) => x.id === t.bookingId);

    if (f.spaceId !== "all") {
      if (!booking || booking.space_id !== f.spaceId) return false;
    }

    if (f.chargeType !== "all" && t.chargeType !== f.chargeType) {
      return false;
    }

    const lineStatusNorm = normalizeChargeLineStatus(t.status);
    if (f.status !== "all" && lineStatusNorm !== f.status) {
      return false;
    }

    if (fromTs !== null || toTs !== null) {
      if (isChargeLinePaidForReporting(t.status)) {
        const effectivePaidAt = resolveEffectivePaidAt(t, booking);
        if (!effectivePaidAt) return fromTs === null && toTs === null;
        const p = new Date(effectivePaidAt).getTime();
        if (fromTs !== null && p < fromTs) return false;
        if (toTs !== null && p > toTs) return false;
      } else {
        if (fromTs !== null || toTs !== null) return false;
      }
    }

    return true;
  });
}

export function summarizePaidLines(lines: FinanceLineItem[]) {
  let grossBookingValue = 0;
  let totalPlatformFees = 0;
  let totalOwnerEarnings = 0;
  let depositsCollected = 0;

  for (const t of lines) {
    if (!isChargeLinePaidForReporting(t.status)) continue;
    grossBookingValue += t.gross;
    totalPlatformFees += t.platformFee;
    totalOwnerEarnings += t.netOwner;
    if (t.chargeType === "deposit") {
      depositsCollected += t.gross;
    }
  }

  return {
    grossBookingValue,
    totalPlatformFees,
    totalOwnerEarnings,
    depositsCollected,
  };
}

export type MonthlyFinanceRollup = {
  key: string;
  label: string;
  gross: number;
  platform: number;
  net: number;
  count: number;
};

export function groupMonthlyPaidLines(
  lines: FinanceLineItem[],
  bookings: FinanceBookingInput[]
): MonthlyFinanceRollup[] {
  const paid = lines.filter((t) => {
    if (!isChargeLinePaidForReporting(t.status)) return false;
    const b = bookings.find((x) => x.id === t.bookingId);
    return Boolean(resolveEffectivePaidAt(t, b));
  });
  const map = new Map<
    string,
    { gross: number; platform: number; net: number; count: number }
  >();
  for (const t of paid) {
    const b = bookings.find((x) => x.id === t.bookingId);
    const key = monthKeyFromPaidAt(resolveEffectivePaidAt(t, b));
    if (!key) continue;
    const cur = map.get(key) || { gross: 0, platform: 0, net: 0, count: 0 };
    cur.gross += t.gross;
    cur.platform += t.platformFee;
    cur.net += t.netOwner;
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, v]) => ({
      key,
      label: monthLabelFromKey(key),
      ...v,
    }));
}
