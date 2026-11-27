import {
  addCalendarDays,
  addCalendarMonths,
  formatCivilDate,
  johannesburgLocalToUtc,
  parseCivilDate,
  type CivilDate,
} from "@/lib/booking-periods";

/**
 * Fortnightly sessions use the ISO week of the start date as week zero.
 * A later session is included when its Monday-based week number is even.
 * Tuesday and Thursday in that pattern stay in the same weeks. Daily and
 * weekly patterns do not use the week number.
 * The last allowed end date is 24 calendar months after the start date.
 */

export const RECURRING_FREQUENCIES = ["daily", "weekly", "fortnightly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
export const RECURRING_PLATFORM_MAX_OCCURRENCES = 750;
export const RECURRING_MAX_SESSION_HOURS = 12;

export type RecurringSession = {
  date: string;
  start: Date;
  end: Date;
  excluded: boolean;
};

export type RecurringPattern = {
  frequency: RecurringFrequency;
  weekdays: number[];
  localStart: string;
  localEnd: string;
  startsOn: string;
  endsOn: string;
  excludedDates: string[];
};

export type RecurringQuote = {
  pattern: RecurringPattern;
  sessions: RecurringSession[];
  includedCount: number;
  hoursPerSession: number;
  totalHours: number;
  hourlyRate: number;
  sessionPrice: number;
  rentalSubtotal: number;
  summary: string;
};

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function isoWeekday(date: CivilDate): number {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const day = utc.getUTCDay();
  return day === 0 ? 7 : day;
}

function isoWeekStart(date: CivilDate): CivilDate {
  return addCalendarDays(date, 1 - isoWeekday(date));
}

function daysBetween(start: CivilDate, end: CivilDate): number {
  const a = Date.UTC(start.year, start.month - 1, start.day);
  const b = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((b - a) / 86_400_000);
}

function parseClock(value: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function isRecurringFrequency(value: string): value is RecurringFrequency {
  return (RECURRING_FREQUENCIES as readonly string[]).includes(value);
}

export function recurringHorizonEnd(startsOn: CivilDate): CivilDate {
  return addCalendarMonths(startsOn, 24);
}

export function sessionHours(localStart: string, localEnd: string): number | null {
  const start = parseClock(localStart);
  const end = parseClock(localEnd);
  if (!start || !end) return null;
  const minutes = end.hour * 60 + end.minute - (start.hour * 60 + start.minute);
  if (start.minute % 30 !== 0 || end.minute % 30 !== 0) return null;
  if (minutes <= 0 || minutes % 30 !== 0) return null;
  return minutes / 60;
}

function weekdayPhrase(weekdays: number[]): string {
  const names = [...weekdays].sort((a, b) => a - b).map((day) => WEEKDAY_NAMES[day - 1]);
  if (weekdays.length === 7) return "day";
  if (names.join() === "Monday,Tuesday,Wednesday,Thursday,Friday") return "Monday to Friday";
  if (names.join() === "Saturday,Sunday") return "Saturday and Sunday";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function describeRecurringPattern(pattern: Pick<
  RecurringPattern,
  "frequency" | "weekdays" | "localStart" | "localEnd" | "startsOn" | "endsOn"
>): string {
  const start = parseCivilDate(pattern.startsOn);
  const end = parseCivilDate(pattern.endsOn);
  const startLabel = start
    ? new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(start.year, start.month - 1, start.day))
      )
    : pattern.startsOn;
  const endLabel = end
    ? new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(end.year, end.month - 1, end.day))
      )
    : pattern.endsOn;
  const times = `${pattern.localStart}–${pattern.localEnd}`;
  if (pattern.frequency === "daily") {
    return `Every day, ${times}, from ${startLabel} until ${endLabel}.`;
  }
  const days = weekdayPhrase(pattern.weekdays);
  if (pattern.frequency === "fortnightly") {
    return `Every second week on ${days}, ${times}, from ${startLabel} until ${endLabel}.`;
  }
  return `Every ${days}, ${times}, from ${startLabel} until ${endLabel}.`;
}

export function generateRecurringSessions(pattern: RecurringPattern): RecurringSession[] {
  const start = parseCivilDate(pattern.startsOn);
  const end = parseCivilDate(pattern.endsOn);
  const clockStart = parseClock(pattern.localStart);
  const clockEnd = parseClock(pattern.localEnd);
  if (!start || !end || !clockStart || !clockEnd) return [];
  const excluded = new Set(pattern.excludedDates);
  const anchorWeek = isoWeekStart(start);
  const sessions: RecurringSession[] = [];
  let day = start;
  let guard = 0;
  while (formatCivilDate(day) <= formatCivilDate(end)) {
    const weekday = isoWeekday(day);
    const weekIndex = daysBetween(anchorWeek, isoWeekStart(day)) / 7;
    const dayMatches =
      pattern.frequency === "daily" ||
      (pattern.weekdays.includes(weekday) &&
        (pattern.frequency === "weekly" || weekIndex % 2 === 0));
    if (dayMatches) {
      const date = formatCivilDate(day);
      sessions.push({
        date,
        start: johannesburgLocalToUtc(day, clockStart.hour, clockStart.minute),
        end: johannesburgLocalToUtc(day, clockEnd.hour, clockEnd.minute),
        excluded: excluded.has(date),
      });
    }
    day = addCalendarDays(day, 1);
    guard += 1;
    if (guard > 800) break;
  }
  return sessions;
}

export function quoteRecurringBooking(input: {
  pattern: RecurringPattern;
  hourlyRate: number;
  minHours?: number | null;
  maxOccurrences?: number | null;
}): { ok: true; quote: RecurringQuote } | { ok: false; error: string } {
  const { pattern } = input;
  if (!isRecurringFrequency(pattern.frequency)) {
    return { ok: false, error: "Choose daily, weekly, or fortnightly." };
  }
  const start = parseCivilDate(pattern.startsOn);
  const end = parseCivilDate(pattern.endsOn);
  if (!start || !end) return { ok: false, error: "Choose a start and end date." };
  if (formatCivilDate(end) < formatCivilDate(start)) {
    return { ok: false, error: "The end date must be on or after the start date." };
  }
  if (formatCivilDate(end) > formatCivilDate(recurringHorizonEnd(start))) {
    return { ok: false, error: "A recurring booking can run for at most 24 months." };
  }
  if (pattern.frequency !== "daily") {
    const days = [...new Set(pattern.weekdays)].filter((day) => day >= 1 && day <= 7);
    if (days.length === 0 || days.length !== pattern.weekdays.length) {
      return { ok: false, error: "Choose at least one day of the week." };
    }
  }
  const hours = sessionHours(pattern.localStart, pattern.localEnd);
  const minimum = Math.max(1, Number(input.minHours) || 1);
  if (hours == null) {
    return { ok: false, error: "Use a start and end time on a 30-minute interval." };
  }
  if (hours < minimum) {
    return { ok: false, error: `Each session must be at least ${minimum} hour${minimum === 1 ? "" : "s"}.` };
  }
  if (hours > RECURRING_MAX_SESSION_HOURS) {
    return { ok: false, error: "Each session must be 12 hours or less." };
  }
  if (!(input.hourlyRate > 0)) {
    return { ok: false, error: "This listing does not have an hourly price for recurring sessions." };
  }
  const sessions = generateRecurringSessions(pattern);
  if (sessions.length > RECURRING_PLATFORM_MAX_OCCURRENCES) {
    return { ok: false, error: "That pattern creates too many sessions. Shorten the date range." };
  }
  const unknownExclusion = pattern.excludedDates.find(
    (date) => !sessions.some((session) => session.date === date)
  );
  if (unknownExclusion) {
    return { ok: false, error: "An excluded date is not one of the generated sessions." };
  }
  const includedCount = sessions.filter((session) => !session.excluded).length;
  const maxOccurrences = input.maxOccurrences ?? RECURRING_PLATFORM_MAX_OCCURRENCES;
  if (includedCount < 1) return { ok: false, error: "Include at least one session." };
  if (includedCount > maxOccurrences) {
    return {
      ok: false,
      error: `This listing allows at most ${maxOccurrences} sessions in one request.`,
    };
  }
  const sessionPrice = Number((hours * input.hourlyRate).toFixed(2));
  const rentalSubtotal = Number((sessionPrice * includedCount).toFixed(2));
  return {
    ok: true,
    quote: {
      pattern,
      sessions,
      includedCount,
      hoursPerSession: hours,
      totalHours: Number((hours * includedCount).toFixed(2)),
      hourlyRate: input.hourlyRate,
      sessionPrice,
      rentalSubtotal,
      summary: describeRecurringPattern(pattern),
    },
  };
}

export function resolveRecurringHourlyRate(input: {
  flexibleRates: Array<{ period: string; amount: number }>;
  pricePerHour?: number | null;
  priceUnit?: string | null;
  priceAmount?: number | null;
}): { ok: true; amount: number } | { ok: false; error: string } {
  if (input.flexibleRates.length > 0) {
    const hour = input.flexibleRates.find((rate) => rate.period === "hour" && rate.amount > 0);
    if (!hour) {
      return {
        ok: false,
        error: "Recurring sessions use the hourly price. Enable Per hour and enter a price. Other booking prices are left unchanged.",
      };
    }
    return { ok: true, amount: hour.amount };
  }
  const legacy = Number(input.pricePerHour);
  if (legacy > 0) return { ok: true, amount: legacy };
  if (input.priceUnit === "hour" && Number(input.priceAmount) > 0) {
    return { ok: true, amount: Number(input.priceAmount) };
  }
  return {
    ok: false,
    error: "Recurring sessions need an hourly price. Add one without changing the listing's current booking period.",
  };
}
