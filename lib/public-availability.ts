import {
  expandAvailabilityRule,
  type AvailabilityRule,
  type AvailabilityRuleException,
} from "@/lib/availability-rules";
import { johannesburgLocalToUtc, parseCivilDate } from "@/lib/booking-periods";

const RESERVING = new Set([
  "approved",
  "accepted_awaiting_payment",
  "awaiting_payment",
  "paid_confirmed",
  "confirmed",
  "completed",
]);

export type PublicInterval = {
  startAt: string;
  endAt: string;
  kind: "reserved" | "pending" | "blocked";
};

type BookingRow = {
  id: string;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  payment_status: string | null;
  reserves_via_occurrences?: boolean | null;
};

type OccurrenceRow = {
  id: string;
  booking_id: string;
  start_at: string;
  end_at: string;
  excluded?: boolean | null;
  cancelled_at?: string | null;
};

function kindFor(status: string | null, paymentStatus: string | null): "reserved" | "pending" | null {
  if (RESERVING.has(status || "") || paymentStatus === "paid" || paymentStatus === "awaiting_payment") {
    return "reserved";
  }
  if (status === "pending" || status === "pending_owner") return "pending";
  return null;
}

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function publicOccupiedIntervals(input: {
  bookings: BookingRow[];
  occurrences: OccurrenceRow[];
  blocked: Array<{ start_at: string; end_at: string }>;
  rules: AvailabilityRule[];
  exceptions: AvailabilityRuleException[];
  windowStart: Date;
  windowEnd: Date;
}): PublicInterval[] {
  const intervals: PublicInterval[] = [];
  const occurrencesByBooking = new Map<string, OccurrenceRow[]>();
  for (const occurrence of input.occurrences) {
    const list = occurrencesByBooking.get(occurrence.booking_id) || [];
    list.push(occurrence);
    occurrencesByBooking.set(occurrence.booking_id, list);
  }

  for (const booking of input.bookings) {
    const kind = kindFor(booking.status, booking.payment_status);
    if (!kind) continue;
    const recurring = booking.booking_unit === "recurring_hour" || booking.reserves_via_occurrences;
    if (recurring) {
      for (const occurrence of occurrencesByBooking.get(booking.id) || []) {
        if (occurrence.excluded || occurrence.cancelled_at) continue;
        intervals.push({ startAt: occurrence.start_at, endAt: occurrence.end_at, kind });
      }
      continue;
    }
    intervals.push({ startAt: booking.start_at, endAt: booking.end_at, kind });
  }

  for (const block of input.blocked) {
    intervals.push({ startAt: block.start_at, endAt: block.end_at, kind: "blocked" });
  }

  for (const rule of input.rules) {
    const exceptions = input.exceptions.filter((item) => item.ruleId === rule.id);
    for (const occurrence of expandAvailabilityRule(rule, input.windowStart, input.windowEnd)) {
      const day = dateKey(occurrence.start);
      const exception = exceptions.find((item) => item.date === day);
      if (exception?.action === "open") continue;
      let start = occurrence.start;
      let end = occurrence.end;
      if (exception?.action === "override" && exception.localStart && exception.localEnd) {
        const civil = parseCivilDate(day);
        const [startHour, startMinute] = exception.localStart.split(":").map(Number);
        const [endHour, endMinute] = exception.localEnd.split(":").map(Number);
        if (civil && Number.isFinite(startHour) && Number.isFinite(endHour)) {
          start = johannesburgLocalToUtc(civil, startHour, startMinute);
          end = johannesburgLocalToUtc(civil, endHour, endMinute);
        }
      }
      intervals.push({ startAt: start.toISOString(), endAt: end.toISOString(), kind: "blocked" });
    }
  }

  return intervals;
}
