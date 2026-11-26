import type { SupabaseClient } from "@supabase/supabase-js";
import { publicAvailabilityMessage } from "@/lib/availability/messages";
import { isFlexiblePeriod } from "@/lib/booking-periods";
import {
  quoteRecurringBooking,
  resolveRecurringHourlyRate,
  type RecurringPattern,
  type RecurringQuote,
} from "@/lib/recurring-bookings";

export type RecurringRequestInput = {
  frequency: string;
  weekdays?: number[];
  localStart: string;
  localEnd: string;
  startsOn: string;
  endsOn: string;
  excludedDates?: string[];
};

export async function resolveServerRecurringQuote(
  admin: SupabaseClient,
  spaceId: string,
  input: RecurringRequestInput
): Promise<{ quote: RecurringQuote; conflicts: string[] }> {
  const { data: space, error: spaceError } = await admin
    .from("spaces")
    .select(
      "recurring_bookings_enabled, recurring_max_occurrences, min_booking_hours, price_per_hour, price_unit, price_amount"
    )
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceError || !space) {
    throw new Error("Recurring bookings are not available for this listing yet.");
  }

  const row = space as {
    recurring_bookings_enabled?: boolean | null;
    recurring_max_occurrences?: number | null;
    min_booking_hours?: number | null;
    price_per_hour?: number | null;
    price_unit?: string | null;
    price_amount?: number | null;
  };
  if (!row.recurring_bookings_enabled) {
    throw new Error("This listing does not accept recurring bookings.");
  }

  const { data: rateRows, error: rateError } = await admin
    .from("space_booking_rates")
    .select("period, amount, enabled")
    .eq("space_id", spaceId)
    .eq("enabled", true);
  if (rateError && !/space_booking_rates/i.test(rateError.message || "")) {
    throw new Error("Could not load the hourly price.");
  }
  const flexibleRates = (rateRows ?? []).flatMap((rate) => {
    const period = String((rate as { period?: string }).period || "");
    const amount = Number((rate as { amount?: number }).amount);
    if (!isFlexiblePeriod(period) || !(amount > 0)) return [];
    return [{ period, amount }];
  });
  const hourly = resolveRecurringHourlyRate({
    flexibleRates,
    pricePerHour: row.price_per_hour,
    priceUnit: row.price_unit,
    priceAmount: row.price_amount,
  });
  if (!hourly.ok) throw new Error(hourly.error);

  const pattern: RecurringPattern = {
    frequency: input.frequency as RecurringPattern["frequency"],
    weekdays: input.weekdays ?? [],
    localStart: input.localStart,
    localEnd: input.localEnd,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    excludedDates: input.excludedDates ?? [],
  };
  const quoted = quoteRecurringBooking({
    pattern,
    hourlyRate: hourly.amount,
    minHours: row.min_booking_hours,
    maxOccurrences: row.recurring_max_occurrences,
  });
  if (!quoted.ok) throw new Error(quoted.error);

  const { data: conflicts, error: conflictError } = await admin.rpc("preview_recurring_conflicts", {
    p_space_id: spaceId,
    p_frequency: pattern.frequency,
    p_weekdays: pattern.frequency === "daily" ? [] : pattern.weekdays,
    p_local_start: pattern.localStart,
    p_local_end: pattern.localEnd,
    p_starts_on: pattern.startsOn,
    p_ends_on: pattern.endsOn,
    p_excluded: pattern.excludedDates,
  });
  if (conflictError) {
    throw new Error(publicAvailabilityMessage(conflictError.message || "Could not check availability."));
  }

  return {
    quote: quoted.quote,
    conflicts: ((conflicts ?? []) as Array<{ occurrence_date: string }>).map((row) =>
      String(row.occurrence_date).slice(0, 10)
    ),
  };
}
