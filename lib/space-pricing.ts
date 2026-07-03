import {
  formatMinBookingDuration,
  type MinBookingRow,
} from "@/lib/space-min-booking";

export const SPACE_PRICE_UNITS = [
  "hour",
  "day",
  "event",
  "month",
  "on_request",
] as const;

export type SpacePriceUnit = (typeof SPACE_PRICE_UNITS)[number];

export const SPACE_PRICE_UNIT_OPTIONS: { value: SpacePriceUnit; label: string }[] = [
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "event", label: "Per event" },
  { value: "month", label: "Per month" },
  { value: "on_request", label: "Price on request" },
];

const PRICE_UNIT_SET = new Set<string>(SPACE_PRICE_UNITS);

const MAX_PRICE = 100_000_000;

export type SpacePricingInput = {
  price_amount?: number | null;
  price_unit?: string | null;
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
  booking_unit?: string | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  price_per_month?: number | null;
};

export function isSpacePriceUnit(value: string | null | undefined): value is SpacePriceUnit {
  return Boolean(value && PRICE_UNIT_SET.has(value));
}

export function parsePriceAmountInput(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatPriceAmount(amount: number): string {
  const rounded = Math.round(amount);
  return `R${rounded.toLocaleString("en-ZA")}`;
}

const PRICE_UNIT_DISPLAY: Record<Exclude<SpacePriceUnit, "on_request">, string> = {
  hour: "per hour",
  day: "per day",
  event: "per event",
  month: "per month",
};

/** Normalize canonical `price_unit` from DB/form (trim, lowercase, aliases). */
export function normalizeCanonicalPriceUnit(
  value: string | null | undefined
): SpacePriceUnit | null {
  if (value == null || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "per_event" || normalized === "per-event") return "event";
  if (isSpacePriceUnit(normalized)) return normalized;
  return null;
}

/**
 * Pricing unit for display and charge logic.
 * Uses canonical `price_unit` first — never maps rental `booking_unit` over `price_unit = event`.
 */
export function resolveSpacePriceUnit(
  space: SpacePricingInput
): SpacePriceUnit | null {
  const canonical = normalizeCanonicalPriceUnit(space.price_unit);
  if (canonical) return canonical;

  const hasCanonicalAmount =
    space.price_amount != null && space.price_amount >= 0;

  // Legacy price columns imply pricing unit (not rental period).
  if (space.price_per_hour != null && space.price_per_hour > 0) return "hour";
  if (space.price_per_month != null && space.price_per_month > 0) return "month";
  if (space.price_per_day != null && space.price_per_day > 0) return "day";

  // Canonical amount without price_unit: do not guess label from booking_unit.
  if (hasCanonicalAmount) return null;

  const rental = space.booking_unit?.trim().toLowerCase();
  if (rental === "hour") return "hour";
  if (rental === "month") return "month";
  if (rental === "day") return "day";

  return null;
}

export function resolveSpacePriceAmount(space: SpacePricingInput): number | null {
  if (space.price_amount != null && space.price_amount >= 0) {
    return space.price_amount;
  }

  const unit = resolveSpacePriceUnit(space);
  if (!unit || unit === "on_request") return null;
  if (unit === "hour") return space.price_per_hour ?? null;
  if (unit === "month") return space.price_per_month ?? null;
  if (unit === "day") return space.price_per_day ?? null;
  if (unit === "event") return null;
  return null;
}

/** Space has a resolvable public price (including price on request). */
export function hasValidPublicPrice(space: SpacePricingInput): boolean {
  const unit = resolveSpacePriceUnit(space);
  if (unit === "on_request") return true;
  if (!unit) return false;
  const amount = resolveSpacePriceAmount(space);
  return amount != null && amount >= 0;
}

/** @alias resolveSpacePriceAmount */
export const getListingPriceAmount = resolveSpacePriceAmount;

/** @alias resolveSpacePriceUnit */
export const getEffectivePriceUnit = resolveSpacePriceUnit;

export function formatSpacePriceDisplay(space: SpacePricingInput): string {
  const unit = resolveSpacePriceUnit(space);
  if (unit === "on_request") return "Price on request";

  const amount = resolveSpacePriceAmount(space);
  if (amount != null && amount >= 0) {
    if (unit) {
      return `${formatPriceAmount(amount)} ${PRICE_UNIT_DISPLAY[unit]}`;
    }
    return formatPriceAmount(amount);
  }

  return "Price not set";
}

/** @alias formatSpacePriceDisplay */
export const formatSpacePrice = formatSpacePriceDisplay;

/** Price line with optional minimum booking duration suffix. */
export function formatSpacePriceWithMinBooking(
  space: SpacePricingInput & MinBookingRow
): string {
  const price = formatSpacePriceDisplay(space);
  const min = formatMinBookingDuration(space);
  if (min) return `${price} · minimum ${min}`;
  return price;
}

export function formatSpacePriceShort(space: SpacePricingInput): string {
  const unit = resolveSpacePriceUnit(space);
  if (unit === "on_request") return "Price on request";

  const amount = resolveSpacePriceAmount(space);
  if (unit && amount != null && amount >= 0) {
    return formatPriceAmount(amount);
  }

  return "Price not set";
}

export function formatSpacePriceSuffix(space: SpacePricingInput): string | null {
  const unit = resolveSpacePriceUnit(space);
  if (!unit || unit === "on_request") return null;
  const amount = resolveSpacePriceAmount(space);
  if (amount == null || amount < 0) return null;
  return ` ${PRICE_UNIT_DISPLAY[unit]}`;
}

export function formatSpaceDepositDisplay(
  space: Pick<SpacePricingInput, "deposit_required" | "deposit_amount">
): string | null {
  if (!space.deposit_required) return null;
  const amount = space.deposit_amount;
  if (amount == null || amount < 0) return null;
  return `Deposit: ${formatPriceAmount(amount)}`;
}

export function formatSpaceDepositDetail(
  space: Pick<SpacePricingInput, "deposit_required" | "deposit_amount">
): string | null {
  if (!space.deposit_required) return null;
  const amount = space.deposit_amount;
  if (amount == null || amount < 0) return null;
  return `Deposit required: ${formatPriceAmount(amount)}`;
}

/** Space has a pricing type configured (including price on request). */
export function spaceHasPricingType(space: SpacePricingInput): boolean {
  const unit = resolveSpacePriceUnit(space);
  if (unit === "on_request") return true;
  if (!unit) return false;
  const amount = resolveSpacePriceAmount(space);
  return amount != null && amount >= 0;
}

/** Property readiness: priced when on_request OR amount+unit set; deposit gaps count as incomplete. */
export function spaceHasCompletePricing(space: SpacePricingInput): boolean {
  const unit = resolveSpacePriceUnit(space);
  if (unit === "on_request") return true;
  if (!unit) return false;

  const amount = resolveSpacePriceAmount(space);
  if (amount == null || amount < 0) return false;

  if (space.deposit_required && (space.deposit_amount == null || space.deposit_amount < 0)) {
    return false;
  }

  return true;
}

/** @deprecated Use spaceHasCompletePricing for readiness; kept for bookable checks on legacy paths. */
export function spaceHasLegacyBookablePrice(space: SpacePricingInput): boolean {
  const unit = space.booking_unit || "day";
  if (unit === "hour") return (space.price_per_hour ?? 0) > 0;
  if (unit === "month") return (space.price_per_month ?? 0) > 0;
  return (space.price_per_day ?? 0) > 0;
}

const RENTAL_BOOKING_UNITS = new Set(["hour", "day", "month"]);

function normalizeRentalBookingUnit(
  value: string | null | undefined
): "hour" | "day" | "month" | null {
  if (value && RENTAL_BOOKING_UNITS.has(value)) {
    return value as "hour" | "day" | "month";
  }
  return null;
}

export type SyncLegacyPriceFieldsOptions = {
  /** How renters select booking duration (hour/day/month). Used when price_unit is event. */
  rentalBookingUnit?: string | null;
};

export function syncLegacyPriceFields(
  priceAmount: number | null,
  priceUnit: SpacePriceUnit | null,
  options?: SyncLegacyPriceFieldsOptions
): {
  booking_unit: string;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
} {
  const rentalUnit = normalizeRentalBookingUnit(options?.rentalBookingUnit);

  if (!priceUnit || priceUnit === "on_request") {
    return {
      booking_unit: rentalUnit ?? "day",
      price_per_hour: null,
      price_per_day: null,
      price_per_month: null,
    };
  }

  if (priceUnit === "event") {
    return {
      booking_unit: rentalUnit ?? "day",
      price_per_hour: null,
      price_per_day: null,
      price_per_month: null,
    };
  }

  if (priceUnit === "hour") {
    return {
      booking_unit: "hour",
      price_per_hour: priceAmount,
      price_per_day: null,
      price_per_month: null,
    };
  }

  if (priceUnit === "month") {
    return {
      booking_unit: "month",
      price_per_hour: null,
      price_per_day: null,
      price_per_month: priceAmount,
    };
  }

  return {
    booking_unit: "day",
    price_per_hour: null,
    price_per_day: priceAmount,
    price_per_month: null,
  };
}

export function validateSpacePricingFormValues(
  priceAmount: string,
  priceUnit: string,
  depositRequired: boolean,
  depositAmount: string
): string | null {
  if (!isSpacePriceUnit(priceUnit)) {
    return "Select a pricing type.";
  }

  const parsedAmount = parsePriceAmountInput(priceAmount);

  if (priceUnit !== "on_request") {
    if (parsedAmount == null) {
      return "Enter a price amount.";
    }
    if (parsedAmount < 0) {
      return "Price must be zero or greater.";
    }
    if (parsedAmount > MAX_PRICE) {
      return "Price is too large.";
    }
  } else if (priceAmount.trim()) {
    const parsedOptional = parsePriceAmountInput(priceAmount);
    if (parsedOptional == null) {
      return "Enter a valid price amount or leave it empty for price on request.";
    }
    if (parsedOptional < 0) {
      return "Price must be zero or greater.";
    }
  }

  if (depositRequired) {
    const parsedDeposit = parsePriceAmountInput(depositAmount);
    if (parsedDeposit == null) {
      return "Enter a deposit amount.";
    }
    if (parsedDeposit < 0) {
      return "Deposit amount must be zero or greater.";
    }
    if (parsedDeposit > MAX_PRICE) {
      return "Deposit amount is too large.";
    }
  }

  return null;
}

export function spacePricingFormFromRow(
  space: SpacePricingInput
): {
  priceAmount: string;
  priceUnit: SpacePriceUnit;
  depositRequired: boolean;
  depositAmount: string;
} {
  const unit = resolveSpacePriceUnit(space) ?? "day";
  const amount = resolveSpacePriceAmount(space);

  return {
    priceAmount:
      unit === "on_request"
        ? ""
        : amount != null
          ? String(amount)
          : "",
    priceUnit: unit,
    depositRequired: Boolean(space.deposit_required),
    depositAmount:
      space.deposit_amount != null ? String(space.deposit_amount) : "",
  };
}

export function spacePricingPayloadFromForm(
  priceAmount: string,
  priceUnit: string,
  depositRequired: boolean,
  depositAmount: string,
  rentalBookingUnit?: string | null
):
  | {
      ok: true;
      data: {
        price_amount: number | null;
        price_unit: SpacePriceUnit;
        deposit_required: boolean;
        deposit_amount: number | null;
        booking_unit: string;
        price_per_hour: number | null;
        price_per_day: number | null;
        price_per_month: number | null;
      };
    }
  | { ok: false; error: string } {
  const err = validateSpacePricingFormValues(
    priceAmount,
    priceUnit,
    depositRequired,
    depositAmount
  );
  if (err) return { ok: false, error: err };

  const unit = priceUnit as SpacePriceUnit;
  const parsedAmount =
    unit === "on_request" ? null : parsePriceAmountInput(priceAmount);
  const legacy = syncLegacyPriceFields(parsedAmount, unit, {
    rentalBookingUnit,
  });

  return {
    ok: true,
    data: {
      price_amount: parsedAmount,
      price_unit: unit,
      deposit_required: depositRequired,
      deposit_amount: depositRequired
        ? parsePriceAmountInput(depositAmount)
        : null,
      ...legacy,
    },
  };
}

export type SpacePricingPayload = {
  price_amount: number | null;
  price_unit: SpacePriceUnit;
  deposit_required: boolean;
  deposit_amount: number | null;
  booking_unit: string;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
};

export function parseSpacePricingInput(
  body: Record<string, unknown>
): { ok: true; data: SpacePricingPayload | null } | { ok: false; error: string } {
  const hasPricingField =
    "price_amount" in body ||
    "price_unit" in body ||
    "deposit_required" in body ||
    "deposit_amount" in body;

  if (!hasPricingField) {
    return { ok: true, data: null };
  }

  const priceUnitRaw = body.price_unit;
  const priceUnit =
    typeof priceUnitRaw === "string" ? priceUnitRaw.trim() : "";

  const depositRequired = Boolean(body.deposit_required);

  let priceAmount = "";
  if ("price_amount" in body) {
    const raw = body.price_amount;
    if (raw === null || raw === undefined) {
      priceAmount = "";
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      priceAmount = String(raw);
    } else if (typeof raw === "string") {
      priceAmount = raw;
    } else {
      return { ok: false, error: "Invalid price amount." };
    }
  }

  let depositAmount = "";
  if ("deposit_amount" in body) {
    const raw = body.deposit_amount;
    if (raw === null || raw === undefined) {
      depositAmount = "";
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      depositAmount = String(raw);
    } else if (typeof raw === "string") {
      depositAmount = raw;
    } else {
      return { ok: false, error: "Invalid deposit amount." };
    }
  }

  if (!priceUnit) {
    return { ok: false, error: "Select a pricing type." };
  }

  const rentalBookingUnitRaw = body.booking_unit;
  const rentalBookingUnit =
    typeof rentalBookingUnitRaw === "string" &&
    ["hour", "day", "month"].includes(rentalBookingUnitRaw.trim())
      ? rentalBookingUnitRaw.trim()
      : rentalBookingUnitRaw === "event"
        ? "day"
        : null;

  const parsed = spacePricingPayloadFromForm(
    priceAmount,
    priceUnit,
    depositRequired,
    depositAmount,
    rentalBookingUnit
  );
  if (!parsed.ok) return parsed;
  return { ok: true, data: parsed.data };
}
