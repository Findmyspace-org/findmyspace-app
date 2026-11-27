import { NextRequest, NextResponse } from "next/server";
import { assertBookingRequirementAccess } from "@/lib/booking-requirement-access";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { describeRecurringPattern, type RecurringFrequency } from "@/lib/recurring-bookings";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const { bookingId } = await params;
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
  }

  try {
    await assertBookingRequirementAccess(auth.admin, auth.userId, bookingId);
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: series, error } = await auth.admin
    .from("booking_series")
    .select(
      "frequency, weekdays, local_start, local_end, starts_on, ends_on, excluded_dates, session_count, hours_per_session, hourly_rate"
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error || !series) {
    return NextResponse.json({ series: null, sessions: [] });
  }

  const { data: sessions } = await auth.admin
    .from("booking_occurrences")
    .select("id, occurrence_date, start_at, end_at, excluded, cancelled_at")
    .eq("booking_id", bookingId)
    .order("occurrence_date", { ascending: true });

  const row = series as {
    frequency: RecurringFrequency;
    weekdays: number[];
    local_start: string;
    local_end: string;
    starts_on: string;
    ends_on: string;
    excluded_dates: string[] | null;
    session_count: number;
    hours_per_session: number;
    hourly_rate: number;
  };
  const localStart = String(row.local_start).slice(0, 5);
  const localEnd = String(row.local_end).slice(0, 5);

  return NextResponse.json({
    series: {
      summary: describeRecurringPattern({
        frequency: row.frequency,
        weekdays: row.weekdays ?? [],
        localStart,
        localEnd,
        startsOn: String(row.starts_on).slice(0, 10),
        endsOn: String(row.ends_on).slice(0, 10),
      }),
      sessionCount: row.session_count,
      hoursPerSession: Number(row.hours_per_session),
      hourlyRate: Number(row.hourly_rate),
      excludedDates: (row.excluded_dates ?? []).map((date) => String(date).slice(0, 10)),
    },
    sessions: (sessions ?? []).map((session) => {
      const item = session as {
        id: string;
        occurrence_date: string;
        start_at: string;
        end_at: string;
        excluded: boolean;
        cancelled_at?: string | null;
      };
      return {
        id: item.id,
        date: String(item.occurrence_date).slice(0, 10),
        startAt: item.start_at,
        endAt: item.end_at,
        excluded: item.excluded,
        cancelled: Boolean(item.cancelled_at),
      };
    }),
  });
}
