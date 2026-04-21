/**
 * Browse "When" filter — URL + label helpers.
 * Date-range presets are stored for future availability; only duration unit + preset affect client filter today.
 */

export type WhenDurationUnit = "hour" | "day" | "month";

export type WhenPresetId =
  | "1h"
  | "2h"
  | "halfday"
  | "fullday"
  | "1d"
  | "3d"
  | "1w"
  | "1m"
  | "3m"
  | "6m"
  | "1y";

export type WhenDatePresetId = "today" | "tomorrow" | "weekend" | "nextweek";

export type AppliedWhen = {
  unit: WhenDurationUnit;
  preset: WhenPresetId | null;
  datePreset: WhenDatePresetId | null;
  startDate: string | null;
  endDate: string | null;
};

const WHEN_UNIT = "whenUnit";
const WHEN_PRESET = "whenPreset";
const WHEN_DATE = "whenDate";
const WHEN_FROM = "whenFrom";
const WHEN_TO = "whenTo";

export function parseAppliedWhenFromParams(
  params: URLSearchParams
): AppliedWhen | null {
  const unit = params.get(WHEN_UNIT);
  if (unit !== "hour" && unit !== "day" && unit !== "month") return null;

  const preset = params.get(WHEN_PRESET) as WhenPresetId | null;
  const datePreset = params.get(WHEN_DATE) as WhenDatePresetId | null;
  const startDate = params.get(WHEN_FROM);
  const endDate = params.get(WHEN_TO);

  const validPresets: WhenPresetId[] = [
    "1h",
    "2h",
    "halfday",
    "fullday",
    "1d",
    "3d",
    "1w",
    "1m",
    "3m",
    "6m",
    "1y",
  ];
  const validDates: WhenDatePresetId[] = [
    "today",
    "tomorrow",
    "weekend",
    "nextweek",
  ];

  return {
    unit,
    preset: preset && validPresets.includes(preset as WhenPresetId)
      ? (preset as WhenPresetId)
      : null,
    datePreset:
      datePreset && validDates.includes(datePreset as WhenDatePresetId)
        ? (datePreset as WhenDatePresetId)
        : null,
    startDate: startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
    endDate: endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null,
  };
}

export function writeAppliedWhenToParams(
  params: URLSearchParams,
  applied: AppliedWhen | null
): void {
  params.delete(WHEN_UNIT);
  params.delete(WHEN_PRESET);
  params.delete(WHEN_DATE);
  params.delete(WHEN_FROM);
  params.delete(WHEN_TO);

  if (!applied) return;

  params.set(WHEN_UNIT, applied.unit);
  if (applied.preset) params.set(WHEN_PRESET, applied.preset);
  if (applied.datePreset) params.set(WHEN_DATE, applied.datePreset);
  if (applied.startDate) params.set(WHEN_FROM, applied.startDate);
  if (applied.endDate) params.set(WHEN_TO, applied.endDate);
}

/** Minimum booking threshold implied by preset (for client-side filter). */
export function presetToMinBookingThreshold(
  unit: WhenDurationUnit,
  preset: WhenPresetId | null
): number | null {
  if (!preset) return null;
  if (unit === "hour") {
    if (preset === "1h") return 1;
    if (preset === "2h") return 2;
    if (preset === "halfday") return 4;
    if (preset === "fullday") return 8;
  }
  if (unit === "day") {
    if (preset === "1d") return 1;
    if (preset === "3d") return 3;
    if (preset === "1w") return 7;
  }
  if (unit === "month") {
    if (preset === "1m") return 1;
    if (preset === "3m") return 3;
    if (preset === "6m") return 6;
    if (preset === "1y") return 12;
  }
  return null;
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/** Soft client filter: listing minimum booking must not exceed the user's chosen duration. */
export function spaceMatchesWhenMinBooking(
  space: {
    min_booking_hours: number | null;
    min_booking_days: number | null;
    min_booking_months: number | null;
  },
  applied: AppliedWhen
): boolean {
  const t = presetToMinBookingThreshold(applied.unit, applied.preset);
  if (t === null) return true;
  if (applied.unit === "hour") {
    const m = space.min_booking_hours;
    if (m == null) return true;
    return m <= t;
  }
  if (applied.unit === "day") {
    const m = space.min_booking_days;
    if (m == null) return true;
    return m <= t;
  }
  const m = space.min_booking_months;
  if (m == null) return true;
  return m <= t;
}

export function formatWhenFilterLabel(applied: AppliedWhen | null): string {
  if (!applied) return "When";

  const presetLabels: Record<WhenPresetId, string> = {
    "1h": "1 hour",
    "2h": "2 hours",
    halfday: "Half day",
    fullday: "Full day",
    "1d": "1 day",
    "3d": "3 days",
    "1w": "1 week",
    "1m": "1 month",
    "3m": "3 months",
    "6m": "6 months",
    "1y": "1 year",
  };

  const dateLabels: Record<WhenDatePresetId, string> = {
    today: "Today",
    tomorrow: "Tomorrow",
    weekend: "This weekend",
    nextweek: "Next week",
  };

  if (applied.datePreset && !applied.preset && dateLabels[applied.datePreset]) {
    return `When: ${dateLabels[applied.datePreset]}`;
  }

  const parts: string[] = [];

  if (applied.preset && presetLabels[applied.preset]) {
    parts.push(presetLabels[applied.preset]);
  } else if (!applied.datePreset) {
    parts.push(
      applied.unit === "hour"
        ? "Hourly"
        : applied.unit === "day"
          ? "Daily"
          : "Monthly"
    );
  }

  if (applied.datePreset && dateLabels[applied.datePreset]) {
    parts.push(dateLabels[applied.datePreset]);
  } else if (applied.startDate && applied.endDate) {
    parts.push(`${shortDate(applied.startDate)} – ${shortDate(applied.endDate)}`);
  } else if (applied.startDate) {
    parts.push(`from ${shortDate(applied.startDate)}`);
  }

  return `When: ${parts.join(" · ")}`;
}
