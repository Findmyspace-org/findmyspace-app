import {
  addCalendarDays,
  BOOKING_TIME_ZONE,
  formatCivilDate,
  johannesburgLocalToUtc,
  parseCivilDate,
  type CivilDate,
} from "@/lib/booking-periods";

/** Monday is 1 and Sunday is 7, matching PostgreSQL ISODOW. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type AvailabilityRule = {
  id: string;
  spaceId: string;
  reason: string | null;
  weekdays: Weekday[];
  wholeDay: boolean;
  localStart: string | null;
  localEnd: string | null;
  startsOn: string;
  endsOn: string | null;
};

export type AvailabilityRuleDraft = {
  reason: string;
  weekdays: number[];
  wholeDay: boolean;
  localStart: string;
  localEnd: string;
  startsOn: string;
  endsOn: string;
  noEnd: boolean;
};

export function emptyAvailabilityRuleDraft(startsOn = ""): AvailabilityRuleDraft {
  return {
    reason: "",
    weekdays: [1, 2, 3, 4, 5],
    wholeDay: false,
    localStart: "08:00",
    localEnd: "15:00",
    startsOn,
    endsOn: "",
    noEnd: true,
  };
}

export function weekdaysPreset(kind: "weekdays" | "weekends" | "every-day"): Weekday[] {
  if (kind === "weekdays") return [1, 2, 3, 4, 5];
  if (kind === "weekends") return [6, 7];
  return [1, 2, 3, 4, 5, 6, 7];
}

function isWeekday(value: number): value is Weekday {
  return WEEKDAYS.includes(value as Weekday);
}

function sortedUniqueWeekdays(values: number[]): Weekday[] | null {
  const unique = [...new Set(values)].filter(isWeekday).sort((a, b) => a - b);
  if (unique.length === 0 || unique.length !== values.length) return null;
  return unique;
}

function parseClock(value: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function parseAvailabilityRuleDraft(
  draft: AvailabilityRuleDraft,
  spaceId: string,
  id = ""
): { ok: true; rule: AvailabilityRule } | { ok: false; error: string } {
  const weekdays = sortedUniqueWeekdays(draft.weekdays);
  if (!weekdays) return { ok: false, error: "Choose at least one day of the week." };
  const startsOn = parseCivilDate(draft.startsOn);
  if (!startsOn) return { ok: false, error: "Choose the date the restriction starts." };
  let endsOn: string | null = null;
  if (!draft.noEnd) {
    const end = parseCivilDate(draft.endsOn);
    if (!end) return { ok: false, error: "Choose the last date, or leave the restriction open." };
    if (formatCivilDate(end) < formatCivilDate(startsOn)) {
      return { ok: false, error: "The end date must be on or after the start date." };
    }
    endsOn = formatCivilDate(end);
  }
  let localStart: string | null = null;
  let localEnd: string | null = null;
  if (!draft.wholeDay) {
    const start = parseClock(draft.localStart);
    const end = parseClock(draft.localEnd);
    if (!start || !end || draft.localStart >= draft.localEnd) {
      return { ok: false, error: "The end time must be after the start time on the same day." };
    }
    localStart = draft.localStart;
    localEnd = draft.localEnd;
  }
  const reason = draft.reason.trim();
  if (reason.length > 500) return { ok: false, error: "Keep the reason under 500 characters." };
  return {
    ok: true,
    rule: {
      id,
      spaceId,
      reason: reason || null,
      weekdays,
      wholeDay: draft.wholeDay,
      localStart,
      localEnd,
      startsOn: formatCivilDate(startsOn),
      endsOn,
    },
  };
}

function weekdayPhrase(weekdays: Weekday[]): string {
  const names = weekdays.map((day) => WEEKDAY_NAMES[day - 1]);
  if (weekdays.join() === "1,2,3,4,5") return "Monday to Friday";
  if (weekdays.join() === "6,7") return "Saturday and Sunday";
  if (weekdays.length === 7) return "day";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function longDate(value: string): string {
  const date = parseCivilDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

export function describeAvailabilityRule(rule: Pick<
  AvailabilityRule,
  "weekdays" | "wholeDay" | "localStart" | "localEnd" | "startsOn" | "endsOn"
>): string {
  const days = weekdayPhrase(rule.weekdays);
  const every = rule.weekdays.length === 7 ? "Every day" : `Every ${days}`;
  const times = rule.wholeDay ? "all day" : `${rule.localStart}–${rule.localEnd}`;
  const ending = rule.endsOn ? `, until ${longDate(rule.endsOn)}` : ", with no end date";
  return `${every}, ${times}, starting ${longDate(rule.startsOn)}${ending}.`;
}

export function johannesburgCivilDate(instant: Date): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function johannesburgMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

function isoWeekday(date: CivilDate): Weekday {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const day = utc.getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

function occurrenceOn(rule: AvailabilityRule, day: CivilDate): { start: Date; end: Date } | null {
  if (!rule.weekdays.includes(isoWeekday(day))) return null;
  if (rule.startsOn > formatCivilDate(day)) return null;
  if (rule.endsOn && rule.endsOn < formatCivilDate(day)) return null;
  if (rule.wholeDay) {
    return {
      start: johannesburgLocalToUtc(day, 0, 0),
      end: johannesburgLocalToUtc(addCalendarDays(day, 1), 0, 0),
    };
  }
  const start = parseClock(rule.localStart || "");
  const end = parseClock(rule.localEnd || "");
  if (!start || !end) return null;
  return {
    start: johannesburgLocalToUtc(day, start.hour, start.minute),
    end: johannesburgLocalToUtc(day, end.hour, end.minute),
  };
}

function comparisonSpan(start: Date, end: Date, rule: AvailabilityRule): { first: CivilDate; last: CivilDate } | null {
  if (end <= start) return null;
  const firstQuery = johannesburgCivilDate(start);
  const endDate = johannesburgCivilDate(end);
  const endsAtMidnight = johannesburgMinutes(end) === 0;
  const lastQuery = endsAtMidnight ? addCalendarDays(endDate, -1) : endDate;
  const firstRule = parseCivilDate(rule.startsOn);
  const lastRule = rule.endsOn ? parseCivilDate(rule.endsOn) : null;
  if (!firstRule) return null;
  let first = formatCivilDate(firstQuery) > formatCivilDate(firstRule) ? firstQuery : firstRule;
  let last = lastQuery;
  if (lastRule && formatCivilDate(lastRule) < formatCivilDate(last)) last = lastRule;
  if (formatCivilDate(last) < formatCivilDate(first)) return null;
  return { first, last };
}

export function ruleOverlapsInterval(
  rule: AvailabilityRule,
  start: Date,
  end: Date
): { overlaps: boolean; occurrenceStart: Date | null; occurrenceEnd: Date | null } {
  const span = comparisonSpan(start, end, rule);
  if (!span) return { overlaps: false, occurrenceStart: null, occurrenceEnd: null };
  let day = span.first;
  const last = formatCivilDate(span.last);
  let guard = 0;
  while (formatCivilDate(day) <= last) {
    const occurrence = occurrenceOn(rule, day);
    if (occurrence && occurrence.start < end && occurrence.end > start) {
      return {
        overlaps: true,
        occurrenceStart: occurrence.start,
        occurrenceEnd: occurrence.end,
      };
    }
    day = addCalendarDays(day, 1);
    guard += 1;
    if (guard > 40000) break;
  }
  return { overlaps: false, occurrenceStart: null, occurrenceEnd: null };
}

export function expandAvailabilityRule(
  rule: AvailabilityRule,
  windowStart: Date,
  windowEnd: Date
): Array<{ start: Date; end: Date }> {
  const span = comparisonSpan(windowStart, windowEnd, rule);
  if (!span) return [];
  const occurrences: Array<{ start: Date; end: Date }> = [];
  let day = span.first;
  const last = formatCivilDate(span.last);
  let guard = 0;
  while (formatCivilDate(day) <= last) {
    const occurrence = occurrenceOn(rule, day);
    if (occurrence && occurrence.start < windowEnd && occurrence.end > windowStart) {
      occurrences.push(occurrence);
    }
    day = addCalendarDays(day, 1);
    guard += 1;
    if (guard > 40000) break;
  }
  return occurrences;
}

export function availabilityRuleFromRow(row: {
  id?: string;
  space_id?: string;
  reason?: string | null;
  weekdays?: number[] | null;
  whole_day?: boolean;
  local_start?: string | null;
  local_end?: string | null;
  starts_on?: string;
  ends_on?: string | null;
}): AvailabilityRule | null {
  const weekdays = sortedUniqueWeekdays(row.weekdays || []);
  const startsOn = typeof row.starts_on === "string" ? row.starts_on.slice(0, 10) : "";
  if (!row.id || !row.space_id || !weekdays || !parseCivilDate(startsOn)) return null;
  const endsOn = row.ends_on ? String(row.ends_on).slice(0, 10) : null;
  return {
    id: row.id,
    spaceId: row.space_id,
    reason: row.reason?.trim() || null,
    weekdays,
    wholeDay: Boolean(row.whole_day),
    localStart: row.whole_day ? null : String(row.local_start || "").slice(0, 5),
    localEnd: row.whole_day ? null : String(row.local_end || "").slice(0, 5),
    startsOn,
    endsOn,
  };
}
