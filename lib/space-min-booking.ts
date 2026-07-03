export const MIN_BOOKING_DURATION_UNITS = ["hour", "day", "month"] as const;

export type MinBookingDurationUnit = (typeof MIN_BOOKING_DURATION_UNITS)[number];

export type MinBookingRow = {
  min_booking_hours?: number | null;
  min_booking_days?: number | null;
  min_booking_months?: number | null;
  booking_unit?: string | null;
};

export type MinBookingFormValues = {
  duration: string;
  unit: MinBookingDurationUnit | "";
};

export type MinBookingPayload = {
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
};

const UNIT_LABELS: Record<MinBookingDurationUnit, { singular: string; plural: string }> = {
  hour: { singular: "hour", plural: "hours" },
  day: { singular: "day", plural: "days" },
  month: { singular: "month", plural: "months" },
};

export function isMinBookingDurationUnit(
  value: string | null | undefined
): value is MinBookingDurationUnit {
  return MIN_BOOKING_DURATION_UNITS.includes(value as MinBookingDurationUnit);
}

export function minBookingFormFromRow(row: MinBookingRow): MinBookingFormValues {
  if (row.min_booking_hours != null && row.min_booking_hours >= 1) {
    return { duration: String(row.min_booking_hours), unit: "hour" };
  }
  if (row.min_booking_days != null && row.min_booking_days >= 1) {
    return { duration: String(row.min_booking_days), unit: "day" };
  }
  if (row.min_booking_months != null && row.min_booking_months >= 1) {
    return { duration: String(row.min_booking_months), unit: "month" };
  }
  return { duration: "", unit: "" };
}

export function validateMinBookingFormValues(
  duration: string,
  unit: MinBookingDurationUnit | ""
): string | null {
  const hasDuration = duration.trim() !== "";
  const hasUnit = Boolean(unit);

  if (!hasDuration && !hasUnit) return null;
  if (hasDuration && !hasUnit) {
    return "Select a duration unit when minimum booking duration is set.";
  }
  if (!hasDuration && hasUnit) {
    return "Enter a minimum booking duration when a unit is selected.";
  }

  const n = Number(duration);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return "Minimum booking duration must be a whole number of at least 1.";
  }

  return null;
}

export function minBookingPayloadFromForm(
  duration: string,
  unit: MinBookingDurationUnit | ""
): { ok: true; data: MinBookingPayload } | { ok: false; error: string } {
  const err = validateMinBookingFormValues(duration, unit);
  if (err) return { ok: false, error: err };

  if (!duration.trim() || !unit) {
    return {
      ok: true,
      data: {
        min_booking_hours: null,
        min_booking_days: null,
        min_booking_months: null,
      },
    };
  }

  const value = Number(duration);
  return {
    ok: true,
    data: {
      min_booking_hours: unit === "hour" ? value : null,
      min_booking_days: unit === "day" ? value : null,
      min_booking_months: unit === "month" ? value : null,
    },
  };
}

export function parseMinBookingDurationInput(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return undefined;
    return Math.floor(n);
  }
  return undefined;
}

export function parseMinBookingInput(body: Record<string, unknown>):
  | { ok: true; data: MinBookingPayload | undefined }
  | { ok: false; error: string } {
  const hasUnified =
    "min_booking_duration" in body || "min_booking_duration_unit" in body;

  if (hasUnified) {
    const duration = parseMinBookingDurationInput(body.min_booking_duration);
    const unitRaw =
      typeof body.min_booking_duration_unit === "string"
        ? body.min_booking_duration_unit.trim()
        : body.min_booking_duration_unit === null
          ? null
          : undefined;

    if (duration === undefined) {
      return { ok: false, error: "Invalid minimum booking duration." };
    }

    const unit =
      unitRaw === null || unitRaw === ""
        ? ""
        : isMinBookingDurationUnit(unitRaw)
          ? unitRaw
          : null;

    if (unit === null) {
      return { ok: false, error: "Duration unit must be hour, day, or month." };
    }

    const payload = minBookingPayloadFromForm(
      duration == null ? "" : String(duration),
      unit
    );
    if (!payload.ok) return payload;
    return { ok: true, data: payload.data };
  }

  const hasLegacy =
    "min_booking_hours" in body ||
    "min_booking_days" in body ||
    "min_booking_months" in body;

  if (!hasLegacy) {
    return { ok: true, data: undefined };
  }

  const hours = parseMinBookingDurationInput(body.min_booking_hours);
  const days = parseMinBookingDurationInput(body.min_booking_days);
  const months = parseMinBookingDurationInput(body.min_booking_months);

  if (hours === undefined || days === undefined || months === undefined) {
    return { ok: false, error: "Invalid minimum booking duration." };
  }

  for (const value of [hours, days, months]) {
    if (value != null && value < 1) {
      return {
        ok: false,
        error: "Minimum booking duration must be at least 1.",
      };
    }
  }

  return {
    ok: true,
    data: {
      min_booking_hours: hours,
      min_booking_days: days,
      min_booking_months: months,
    },
  };
}

export function formatMinBookingDuration(
  row: MinBookingRow
): string | null {
  const form = minBookingFormFromRow(row);
  if (!form.duration || !form.unit) return null;

  const n = Number(form.duration);
  if (!Number.isFinite(n) || n < 1) return null;

  const labels = UNIT_LABELS[form.unit];
  const unitLabel = n === 1 ? labels.singular : labels.plural;
  return `${n} ${unitLabel}`;
}

export function formatMinBookingDetailLabel(row: MinBookingRow): string | null {
  const formatted = formatMinBookingDuration(row);
  return formatted ? `Minimum booking: ${formatted}` : null;
}

export function minBookingValidationMessage(row: MinBookingRow): string | null {
  const formatted = formatMinBookingDuration(row);
  return formatted
    ? `This space has a minimum booking duration of ${formatted}.`
    : null;
}

/** Rental period for calendar/date selection (hour, day, or month). */
export function resolveRentalBookingUnit(row: MinBookingRow): string {
  const unit = row.booking_unit;
  if (unit === "hour" || unit === "day" || unit === "month") return unit;
  if (unit === "event") return "day";
  return "day";
}

/** Booking unit used to evaluate minimum duration in booking forms. */
export function resolveMinBookingUnit(row: MinBookingRow): string {
  if (row.min_booking_hours != null && row.min_booking_hours >= 1) return "hour";
  if (row.min_booking_days != null && row.min_booking_days >= 1) return "day";
  if (row.min_booking_months != null && row.min_booking_months >= 1) return "month";
  return row.booking_unit || "day";
}

export function applyMinBookingPatch(
  patch: Record<string, unknown>,
  data: MinBookingPayload
) {
  patch.min_booking_hours = data.min_booking_hours;
  patch.min_booking_days = data.min_booking_days;
  patch.min_booking_months = data.min_booking_months;

  const unit = resolveMinBookingUnit({
    min_booking_hours: data.min_booking_hours,
    min_booking_days: data.min_booking_days,
    min_booking_months: data.min_booking_months,
    booking_unit: null,
  });
  if (data.min_booking_hours || data.min_booking_days || data.min_booking_months) {
    patch.booking_unit = unit;
  }
}
