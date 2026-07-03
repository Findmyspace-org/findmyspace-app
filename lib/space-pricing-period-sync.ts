import type { MinBookingDurationUnit } from "@/lib/space-min-booking";
import { isMinBookingDurationUnit } from "@/lib/space-min-booking";
import type { SpacePriceUnit } from "@/lib/space-pricing";
import { isSpacePriceUnit } from "@/lib/space-pricing";

export const RENTAL_PERIODS = ["hourly", "daily", "weekly", "monthly"] as const;
export type RentalPeriod = (typeof RENTAL_PERIODS)[number];

export const PRICING_TYPES = [
  "per_hour",
  "per_day",
  "per_week",
  "per_month",
] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

export const MIN_BOOKING_UNITS_PLURAL = [
  "hours",
  "days",
  "weeks",
  "months",
] as const;
export type MinBookingUnitPlural = (typeof MIN_BOOKING_UNITS_PLURAL)[number];

export type SpacePeriodSourceField =
  | "rental_period"
  | "pricing_type"
  | "min_booking_unit";

export type SpacePricingPeriodFormState = {
  rentalPeriod: RentalPeriod | "";
  pricingType: PricingType | "per_event" | "on_request" | "";
  minBookingUnit: MinBookingUnitPlural | "";
  priceAmount: string;
  minBookingDuration: string;
};

export type SpacePricingPeriodDbFields = {
  booking_unit: string | null;
  price_unit: string | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
};

export type PeriodConfig = {
  rentalPeriod: RentalPeriod;
  pricingType: PricingType;
  minBookingUnit: MinBookingUnitPlural;
  bookingUnit: "hour" | "day" | "month";
  priceUnit: "hour" | "day" | "month";
  minBookingUnitSingular: MinBookingDurationUnit;
};

const CORE_PERIOD_CONFIG: Record<
  Exclude<RentalPeriod, "weekly">,
  PeriodConfig
> = {
  hourly: {
    rentalPeriod: "hourly",
    pricingType: "per_hour",
    minBookingUnit: "hours",
    bookingUnit: "hour",
    priceUnit: "hour",
    minBookingUnitSingular: "hour",
  },
  daily: {
    rentalPeriod: "daily",
    pricingType: "per_day",
    minBookingUnit: "days",
    bookingUnit: "day",
    priceUnit: "day",
    minBookingUnitSingular: "day",
  },
  monthly: {
    rentalPeriod: "monthly",
    pricingType: "per_month",
    minBookingUnit: "months",
    bookingUnit: "month",
    priceUnit: "month",
    minBookingUnitSingular: "month",
  },
};

/** Weekly is defined for API symmetry; not persisted without schema support. */
const WEEKLY_PERIOD_CONFIG: PeriodConfig = {
  rentalPeriod: "weekly",
  pricingType: "per_week",
  minBookingUnit: "weeks",
  bookingUnit: "day",
  priceUnit: "day",
  minBookingUnitSingular: "day",
};

export const SPACE_PRICING_PERIOD_HELPER_TEXT =
  "Choose how renters book the space and how the price is charged. For event pricing, renters still choose a date and time, but the price applies to the whole booking.";

export const SPACE_PRICING_PERIOD_VALIDATION_ERROR =
  "Please align the rental period, pricing type and minimum booking unit.";

export function getPeriodConfig(period: RentalPeriod): PeriodConfig {
  if (period === "weekly") return WEEKLY_PERIOD_CONFIG;
  return CORE_PERIOD_CONFIG[period];
}

export function inferPeriodFromPricingType(
  pricingType: string | null | undefined
): RentalPeriod | null {
  if (!pricingType) return null;
  switch (pricingType) {
    case "per_hour":
      return "hourly";
    case "per_day":
    case "per_event":
      return "daily";
    case "per_week":
      return "weekly";
    case "per_month":
      return "monthly";
    case "on_request":
      return null;
    default:
      return null;
  }
}

export function inferPeriodFromMinBookingUnit(
  unit: string | null | undefined
): RentalPeriod | null {
  if (!unit) return null;
  const normalized = unit.toLowerCase();
  if (normalized === "hour" || normalized === "hours") return "hourly";
  if (normalized === "day" || normalized === "days") return "daily";
  if (normalized === "week" || normalized === "weeks") return "weekly";
  if (normalized === "month" || normalized === "months") return "monthly";
  return null;
}

export function inferPeriodFromBookingUnit(
  bookingUnit: string | null | undefined
): RentalPeriod | null {
  if (bookingUnit === "hour") return "hourly";
  if (bookingUnit === "day") return "daily";
  if (bookingUnit === "month") return "monthly";
  return null;
}

export function bookingUnitToRentalPeriod(
  bookingUnit: string | null | undefined
): RentalPeriod | "" {
  return inferPeriodFromBookingUnit(bookingUnit) ?? "";
}

export function rentalPeriodToBookingUnit(
  rentalPeriod: RentalPeriod
): "hour" | "day" | "month" {
  return getPeriodConfig(rentalPeriod).bookingUnit;
}

export function priceUnitToPricingType(
  priceUnit: string | null | undefined
): SpacePricingPeriodFormState["pricingType"] {
  if (!priceUnit) return "";
  if (priceUnit === "hour") return "per_hour";
  if (priceUnit === "day") return "per_day";
  if (priceUnit === "month") return "per_month";
  if (priceUnit === "event") return "per_event";
  if (priceUnit === "on_request") return "on_request";
  return "";
}

export function pricingTypeToPriceUnit(
  pricingType: SpacePricingPeriodFormState["pricingType"]
): SpacePriceUnit | "" {
  if (pricingType === "per_hour") return "hour";
  if (pricingType === "per_day") return "day";
  if (pricingType === "per_month") return "month";
  if (pricingType === "per_event") return "event";
  if (pricingType === "on_request") return "on_request";
  return "";
}

export function minBookingUnitSingularToPlural(
  unit: MinBookingDurationUnit | ""
): MinBookingUnitPlural | "" {
  if (unit === "hour") return "hours";
  if (unit === "day") return "days";
  if (unit === "month") return "months";
  return "";
}

export function minBookingUnitPluralToSingular(
  unit: MinBookingUnitPlural | ""
): MinBookingDurationUnit | "" {
  if (unit === "hours") return "hour";
  if (unit === "days") return "day";
  if (unit === "weeks") return "day";
  if (unit === "months") return "month";
  return "";
}

export function spacePricingPeriodFormFromDb(row: {
  booking_unit?: string | null;
  price_unit?: string | null;
  min_booking_hours?: number | null;
  min_booking_days?: number | null;
  min_booking_months?: number | null;
}): Pick<
  SpacePricingPeriodFormState,
  "rentalPeriod" | "pricingType" | "minBookingUnit"
> {
  const rentalPeriod = bookingUnitToRentalPeriod(row.booking_unit);
  const pricingType = priceUnitToPricingType(row.price_unit);

  let minBookingUnit: MinBookingUnitPlural | "" = "";
  if (row.min_booking_hours != null && row.min_booking_hours >= 1) {
    minBookingUnit = "hours";
  } else if (row.min_booking_days != null && row.min_booking_days >= 1) {
    minBookingUnit = "days";
  } else if (row.min_booking_months != null && row.min_booking_months >= 1) {
    minBookingUnit = "months";
  }

  return { rentalPeriod, pricingType, minBookingUnit };
}

export function spacePricingPeriodToFormFields(state: Pick<
  SpacePricingPeriodFormState,
  "rentalPeriod" | "pricingType" | "minBookingUnit"
>): {
  bookingUnit: string;
  priceUnit: string;
  minBookingUnit: MinBookingDurationUnit | "";
} {
  const priceUnit = pricingTypeToPriceUnit(state.pricingType);
  const bookingUnit = state.rentalPeriod
    ? rentalPeriodToBookingUnit(state.rentalPeriod)
    : "";
  const minBookingUnit = minBookingUnitPluralToSingular(state.minBookingUnit);

  return {
    bookingUnit,
    priceUnit,
    minBookingUnit,
  };
}

function resolveCorePeriod(
  sourceField: SpacePeriodSourceField,
  value: string,
  current: SpacePricingPeriodFormState
): RentalPeriod | null {
  if (sourceField === "rental_period") {
    return RENTAL_PERIODS.includes(value as RentalPeriod)
      ? (value as RentalPeriod)
      : null;
  }

  if (sourceField === "pricing_type") {
    if (value === "per_event") return "daily";
    if (value === "on_request") return null;
    return inferPeriodFromPricingType(value);
  }

  if (sourceField === "min_booking_unit") {
    return inferPeriodFromMinBookingUnit(value);
  }

  return (
    inferPeriodFromPricingType(current.pricingType) ??
    (current.rentalPeriod || null) ??
    inferPeriodFromMinBookingUnit(current.minBookingUnit)
  );
}

export function syncSpacePricingPeriod(
  sourceField: SpacePeriodSourceField,
  value: string,
  currentState: SpacePricingPeriodFormState
): SpacePricingPeriodFormState {
  const next: SpacePricingPeriodFormState = { ...currentState };

  if (sourceField === "pricing_type" && value === "on_request") {
    next.pricingType = "on_request";
    return next;
  }

  if (sourceField === "pricing_type" && value === "per_event") {
    next.pricingType = "per_event";
    return next;
  }

  const period = resolveCorePeriod(sourceField, value, currentState);
  if (!period || period === "weekly") {
    if (sourceField === "rental_period" && value === "weekly") {
      const weekly = getPeriodConfig("weekly");
      next.rentalPeriod = "weekly";
      next.pricingType = weekly.pricingType;
      if (currentState.minBookingDuration?.trim()) {
        next.minBookingUnit = weekly.minBookingUnit;
      }
    }
    return next;
  }

  const config = getPeriodConfig(period);
  next.rentalPeriod = config.rentalPeriod;
  next.pricingType = config.pricingType;
  if (sourceField === "min_booking_unit") {
    next.minBookingUnit = config.minBookingUnit;
  } else if (currentState.minBookingDuration?.trim()) {
    next.minBookingUnit = config.minBookingUnit;
  }

  return next;
}

export function syncSpacePricingPeriodFromFormFields(
  sourceField: SpacePeriodSourceField,
  value: string,
  fields: {
    bookingUnit: string;
    priceUnit: string;
    minBookingUnit: MinBookingDurationUnit | "";
    priceAmount: string;
    minBookingDuration: string;
  }
): typeof fields {
  const periodState: SpacePricingPeriodFormState = {
    rentalPeriod: bookingUnitToRentalPeriod(fields.bookingUnit),
    pricingType: priceUnitToPricingType(fields.priceUnit),
    minBookingUnit: minBookingUnitSingularToPlural(fields.minBookingUnit),
    priceAmount: fields.priceAmount,
    minBookingDuration: fields.minBookingDuration,
  };

  const synced = syncSpacePricingPeriod(sourceField, value, periodState);
  const mapped = spacePricingPeriodToFormFields(synced);

  return {
    ...fields,
    bookingUnit: mapped.bookingUnit || fields.bookingUnit,
    priceUnit: mapped.priceUnit || fields.priceUnit,
    minBookingUnit: mapped.minBookingUnit,
    priceAmount: synced.priceAmount,
    minBookingDuration: synced.minBookingDuration,
  };
}

export function validateSpacePricingPeriodAlignment(
  state: Pick<
    SpacePricingPeriodFormState,
    "rentalPeriod" | "pricingType" | "minBookingUnit"
  > & {
    minBookingDuration?: string;
  }
): string | null {
  const hasMinDuration = Boolean(state.minBookingDuration?.trim());
  const rentalPeriod = state.rentalPeriod;
  const pricingType = state.pricingType;
  const minBookingUnit = state.minBookingUnit;

  if (!rentalPeriod && !pricingType && !minBookingUnit && !hasMinDuration) {
    return null;
  }

  if (pricingType === "on_request") {
    if (!rentalPeriod) return null;
    if (hasMinDuration && !minBookingUnit) {
      return SPACE_PRICING_PERIOD_VALIDATION_ERROR;
    }
    if (
      minBookingUnit &&
      inferPeriodFromMinBookingUnit(minBookingUnit) !== rentalPeriod
    ) {
      return SPACE_PRICING_PERIOD_VALIDATION_ERROR;
    }
    return null;
  }

  if (pricingType === "per_event") {
    if (hasMinDuration && !minBookingUnit) {
      return SPACE_PRICING_PERIOD_VALIDATION_ERROR;
    }
    return null;
  }

  if (!rentalPeriod || !pricingType) {
    return SPACE_PRICING_PERIOD_VALIDATION_ERROR;
  }

  const config = getPeriodConfig(rentalPeriod);
  if (pricingType !== config.pricingType) {
    return SPACE_PRICING_PERIOD_VALIDATION_ERROR;
  }

  if (
    hasMinDuration &&
    minBookingUnit &&
    minBookingUnit !== config.minBookingUnit
  ) {
    return SPACE_PRICING_PERIOD_VALIDATION_ERROR;
  }

  if (
    hasMinDuration &&
    !minBookingUnit
  ) {
    return SPACE_PRICING_PERIOD_VALIDATION_ERROR;
  }

  return null;
}

export function validateSpacePricingPeriodFormFields(fields: {
  bookingUnit: string;
  priceUnit: string;
  minBookingUnit: MinBookingDurationUnit | "";
  minBookingDuration: string;
}): string | null {
  return validateSpacePricingPeriodAlignment({
    rentalPeriod: bookingUnitToRentalPeriod(fields.bookingUnit),
    pricingType: priceUnitToPricingType(fields.priceUnit),
    minBookingUnit: minBookingUnitSingularToPlural(fields.minBookingUnit),
    minBookingDuration: fields.minBookingDuration,
  });
}

export function normalizeSpacePricingPeriodDbFields(
  fields: SpacePricingPeriodDbFields
): SpacePricingPeriodDbFields {
  const sanitizedBookingUnit =
    fields.booking_unit === "event" ? "day" : fields.booking_unit;

  const form = spacePricingPeriodFormFromDb({
    ...fields,
    booking_unit: sanitizedBookingUnit,
  });
  const hasMin =
    (fields.min_booking_hours != null && fields.min_booking_hours >= 1) ||
    (fields.min_booking_days != null && fields.min_booking_days >= 1) ||
    (fields.min_booking_months != null && fields.min_booking_months >= 1);

  let synced = form;
  if (form.pricingType === "on_request") {
    if (form.rentalPeriod) {
      const config = getPeriodConfig(form.rentalPeriod);
      synced = {
        rentalPeriod: config.rentalPeriod,
        pricingType: "on_request",
        minBookingUnit: hasMin ? config.minBookingUnit : form.minBookingUnit,
      };
    }
  } else if (form.pricingType === "per_event") {
    synced = {
      rentalPeriod: form.rentalPeriod || "daily",
      pricingType: "per_event",
      minBookingUnit: hasMin ? form.minBookingUnit : "",
    };
  } else if (form.rentalPeriod) {
    const config = getPeriodConfig(form.rentalPeriod);
    synced = {
      rentalPeriod: config.rentalPeriod,
      pricingType: config.pricingType,
      minBookingUnit: hasMin ? config.minBookingUnit : "",
    };
  }

  const mapped = spacePricingPeriodToFormFields(synced);
  const booking_unit =
    mapped.bookingUnit ||
    (sanitizedBookingUnit && sanitizedBookingUnit !== "event"
      ? sanitizedBookingUnit
      : null) ||
    "day";
  const price_unit = mapped.priceUnit || fields.price_unit || "day";

  let min_booking_hours = fields.min_booking_hours;
  let min_booking_days = fields.min_booking_days;
  let min_booking_months = fields.min_booking_months;

  if (hasMin && mapped.minBookingUnit) {
    const duration =
      mapped.minBookingUnit === "hour"
        ? fields.min_booking_hours
        : mapped.minBookingUnit === "day"
          ? fields.min_booking_days
          : fields.min_booking_months;

    min_booking_hours =
      mapped.minBookingUnit === "hour" ? duration ?? null : null;
    min_booking_days =
      mapped.minBookingUnit === "day" ? duration ?? null : null;
    min_booking_months =
      mapped.minBookingUnit === "month" ? duration ?? null : null;
  }

  return {
    booking_unit,
    price_unit,
    min_booking_hours,
    min_booking_days,
    min_booking_months,
  };
}

export function assertSpacePricingPeriodDbFields(
  fields: SpacePricingPeriodDbFields
): { ok: true } | { ok: false; error: string } {
  const form = spacePricingPeriodFormFromDb(fields);
  const hasMin =
    (fields.min_booking_hours != null && fields.min_booking_hours >= 1) ||
    (fields.min_booking_days != null && fields.min_booking_days >= 1) ||
    (fields.min_booking_months != null && fields.min_booking_months >= 1);

  const err = validateSpacePricingPeriodAlignment({
    ...form,
    minBookingDuration: hasMin ? "1" : "",
  });

  if (err) return { ok: false, error: err };
  return { ok: true };
}

export function isAlignablePriceUnit(
  value: string | null | undefined
): value is SpacePriceUnit {
  return isSpacePriceUnit(value);
}

export function isAlignableMinBookingSingular(
  value: string | null | undefined
): value is MinBookingDurationUnit {
  return isMinBookingDurationUnit(value);
}
