import { calculateBookingQuantity } from "@/lib/booking-request-server";
import {
  exclusiveEndDate,
  FLEXIBLE_PERIOD_LABELS,
  flexibleQuantityLabel,
  formatCivilDate,
  isFlexiblePeriod,
  johannesburgLocalToUtc,
  parseCivilDate,
  storedBookingUnitForPeriod,
  type FlexiblePeriod,
} from "@/lib/booking-periods";

export type EnabledFlexibleRate = {
  period: FlexiblePeriod;
  amount: number;
};

export type FlexibleBookingQuote = {
  period: FlexiblePeriod;
  periodLabel: string;
  storedBookingUnit: string;
  startAt: string;
  endAt: string;
  startLabel: string;
  endLabel: string;
  quantity: number;
  quantityLabel: string;
  unitPrice: number;
  totalPrice: number;
};

export type FlexibleBookingInput = {
  rates: EnabledFlexibleRate[];
  ratePeriod?: string | null;
  quantity?: number | null;
  startDate?: string | null;
  startAt?: string | null;
  endAt?: string | null;
};

function money(value: number): number {
  return Number(value.toFixed(2));
}

function hourLabel(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date) + " SAST";
}

export function resolveFlexibleBooking(
  input: FlexibleBookingInput
): { ok: true; quote: FlexibleBookingQuote } | { ok: false; error: string } {
  const period = String(input.ratePeriod || "");
  if (!isFlexiblePeriod(period)) {
    return { ok: false, error: "Choose a booking period offered by this space." };
  }
  const rate = input.rates.find((row) => row.period === period && row.amount > 0);
  if (!rate) {
    return { ok: false, error: "This booking period is not offered for this space." };
  }

  if (period === "hour") {
    const start = new Date(String(input.startAt || ""));
    const end = new Date(String(input.endAt || ""));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return { ok: false, error: "Choose a valid start and end time." };
    }
    const quantity = calculateBookingQuantity("hour", start.toISOString(), end.toISOString());
    if (quantity <= 0) {
      return { ok: false, error: "Please choose a valid booking period." };
    }
    return {
      ok: true,
      quote: {
        period,
        periodLabel: FLEXIBLE_PERIOD_LABELS.hour,
        storedBookingUnit: storedBookingUnitForPeriod(period),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        startLabel: hourLabel(start.toISOString()),
        endLabel: hourLabel(end.toISOString()),
        quantity,
        quantityLabel: flexibleQuantityLabel(period, quantity),
        unitPrice: money(rate.amount),
        totalPrice: money(quantity * rate.amount),
      },
    };
  }

  const startDate = parseCivilDate(String(input.startDate || ""));
  if (!startDate) {
    return { ok: false, error: "Choose a valid start date." };
  }
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 36) {
    return { ok: false, error: "Choose between 1 and 36 booking periods." };
  }
  let endDate;
  try {
    endDate = exclusiveEndDate(period, startDate, quantity);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Choose a valid booking period.",
    };
  }
  const startAt = johannesburgLocalToUtc(startDate).toISOString();
  const endAt = johannesburgLocalToUtc(endDate).toISOString();
  return {
    ok: true,
    quote: {
      period,
      periodLabel: FLEXIBLE_PERIOD_LABELS[period],
      storedBookingUnit: storedBookingUnitForPeriod(period),
      startAt,
      endAt,
      startLabel: `${formatCivilDate(startDate)} 00:00 SAST`,
      endLabel: `${formatCivilDate(endDate)} 00:00 SAST`,
      quantity,
      quantityLabel: flexibleQuantityLabel(period, quantity),
      unitPrice: money(rate.amount),
      totalPrice: money(quantity * rate.amount),
    },
  };
}

export function parseFlexibleRateDraft(
  rows: unknown
): { ok: true; rates: EnabledFlexibleRate[] } | { ok: false; error: string } {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Enable at least one booking period and enter its price." };
  }
  const seen = new Set<string>();
  const rates: EnabledFlexibleRate[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      return { ok: false, error: "Enter a price for each enabled booking period." };
    }
    const period = String((row as { period?: unknown }).period || "");
    const amount = Number((row as { amount?: unknown }).amount);
    if (!isFlexiblePeriod(period) || seen.has(period)) {
      return { ok: false, error: "Choose each booking period only once." };
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      return { ok: false, error: "Enter a price greater than zero for each enabled period." };
    }
    seen.add(period);
    rates.push({ period, amount: Number(amount.toFixed(2)) });
  }
  return { ok: true, rates };
}
