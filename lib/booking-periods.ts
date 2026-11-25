/**
 * Local calendar arithmetic for new flexible bookings.
 * Historical booking timestamps are never rewritten by these helpers.
 * Africa/Johannesburg has no daylight-saving change; the offset is still
 * read from the time zone so the rule stays attached to that zone.
 */

export const BOOKING_TIME_ZONE = "Africa/Johannesburg";

export const FLEXIBLE_PERIODS = [
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;

export type FlexiblePeriod = (typeof FLEXIBLE_PERIODS)[number];

export type CivilDate = {
  year: number;
  month: number;
  day: number;
};

export function isFlexiblePeriod(value: string): value is FlexiblePeriod {
  return (FLEXIBLE_PERIODS as readonly string[]).includes(value);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarMonths(date: CivilDate, months: number): CivilDate {
  const absolute = date.month - 1 + months;
  const year = date.year + Math.floor(absolute / 12);
  const monthIndex = ((absolute % 12) + 12) % 12;
  const month = monthIndex + 1;
  return {
    year,
    month,
    day: Math.min(date.day, daysInMonth(year, month)),
  };
}

export function addCalendarDays(date: CivilDate, days: number): CivilDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function parseCivilDate(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatCivilDate(date: CivilDate): string {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

export function johannesburgOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(instant);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 120;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

/** Local wall time in Africa/Johannesburg as a UTC instant. */
export function johannesburgLocalToUtc(
  date: CivilDate,
  hour = 0,
  minute = 0
): Date {
  const guess = new Date(
    Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0)
  );
  const offset = johannesburgOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60_000);
}

export function exclusiveEndDate(
  period: Exclude<FlexiblePeriod, "hour">,
  start: CivilDate,
  quantity: number
): CivilDate {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 36) {
    throw new Error("Choose between 1 and 36 booking periods.");
  }
  if (period === "day") return addCalendarDays(start, quantity);
  if (period === "week") return addCalendarDays(start, quantity * 7);
  if (period === "month") return addCalendarMonths(start, quantity);
  if (period === "quarter") return addCalendarMonths(start, quantity * 3);
  return addCalendarMonths(start, quantity * 12);
}

export function storedBookingUnitForPeriod(period: FlexiblePeriod): string {
  if (period === "day") return "flex_day";
  if (period === "month") return "flex_month";
  return period;
}

export const FLEXIBLE_PERIOD_LABELS: Record<FlexiblePeriod, string> = {
  hour: "Per hour",
  day: "Per day",
  week: "Per week",
  month: "Per month",
  quarter: "Per quarter",
  year: "Per year",
};

export function flexibleQuantityLabel(
  period: FlexiblePeriod,
  quantity: number
): string {
  const names: Record<FlexiblePeriod, [string, string]> = {
    hour: ["hour", "hours"],
    day: ["day", "days"],
    week: ["week", "weeks"],
    month: ["month", "months"],
    quarter: ["quarter", "quarters"],
    year: ["year", "years"],
  };
  const [one, many] = names[period];
  const rendered = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(1);
  return `${rendered} ${quantity === 1 ? one : many}`;
}
