import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { availabilityRuleFromRow, type AvailabilityRuleException } from "@/lib/availability-rules";
import { publicOccupiedIntervals } from "@/lib/public-availability";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: spaceId } = await params;
  if (!UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: "Choose a listing." }, { status: 400 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Availability could not be checked." }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const windowStart = new Date();
  windowStart.setUTCMonth(windowStart.getUTCMonth() - 1);
  const windowEnd = new Date();
  windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 24);

  const withOccurrences = await admin
    .from("bookings")
    .select("id, booking_unit, start_at, end_at, status, payment_status, reserves_via_occurrences")
    .eq("space_id", spaceId);
  const bookingResult = withOccurrences.error
    ? await admin
        .from("bookings")
        .select("id, booking_unit, start_at, end_at, status, payment_status")
        .eq("space_id", spaceId)
    : withOccurrences;
  if (bookingResult.error) {
    return NextResponse.json({ error: "Availability could not be checked." }, { status: 500 });
  }
  const bookings = bookingResult.data;
  const rows = (bookings || []) as Array<{
    id: string;
    booking_unit: string | null;
    start_at: string;
    end_at: string;
    status: string | null;
    payment_status: string | null;
    reserves_via_occurrences?: boolean | null;
  }>;
  const recurringIds = rows
    .filter((row) => row.booking_unit === "recurring_hour" || row.reserves_via_occurrences)
    .map((row) => row.id);
  let occurrences: Array<{
    id: string;
    booking_id: string;
    start_at: string;
    end_at: string;
    excluded?: boolean | null;
    cancelled_at?: string | null;
  }> = [];
  if (recurringIds.length > 0) {
    const { data } = await admin
      .from("booking_occurrences")
      .select("id, booking_id, start_at, end_at, excluded, cancelled_at")
      .in("booking_id", recurringIds);
    occurrences = (data || []) as typeof occurrences;
  }
  const { data: blocked } = await admin
    .from("blocked_dates")
    .select("start_at, end_at")
    .eq("space_id", spaceId);
  const { data: ruleRows, error: ruleError } = await admin
    .from("availability_rules")
    .select("id, space_id, reason, weekdays, whole_day, local_start, local_end, starts_on, ends_on")
    .eq("space_id", spaceId)
    .is("removed_at", null);
  if (ruleError) {
    // Older databases do not have recurring restrictions yet. Occupied bookings still apply.
  }
  const rules = ((ruleRows || []) as Array<Parameters<typeof availabilityRuleFromRow>[0]>)
    .map((row) => availabilityRuleFromRow({ ...row, reason: null }))
    .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));
  const { data: exceptionRows } = ruleError
    ? { data: [] }
    : await admin
    .from("availability_rule_exceptions")
    .select("id, rule_id, exception_date, action, local_start, local_end, whole_day")
    .eq("space_id", spaceId)
    .is("removed_at", null);
  const exceptions: AvailabilityRuleException[] = ((exceptionRows || []) as Array<{
    id: string;
    rule_id: string;
    exception_date: string;
    action: "open" | "override";
    local_start?: string | null;
    local_end?: string | null;
    whole_day?: boolean | null;
  }>).map((row) => ({
    id: row.id,
    ruleId: row.rule_id,
    date: String(row.exception_date).slice(0, 10),
    action: row.action,
    localStart: row.local_start ? String(row.local_start).slice(0, 5) : null,
    localEnd: row.local_end ? String(row.local_end).slice(0, 5) : null,
    wholeDay: Boolean(row.whole_day),
    reason: null,
  }));

  return NextResponse.json({
    intervals: publicOccupiedIntervals({
      bookings: rows,
      occurrences,
      blocked: (blocked || []) as Array<{ start_at: string; end_at: string }>,
      rules,
      exceptions,
      windowStart,
      windowEnd,
    }),
  });
}
