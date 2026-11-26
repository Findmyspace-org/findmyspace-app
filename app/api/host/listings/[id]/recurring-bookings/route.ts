import { NextRequest, NextResponse } from "next/server";
import { requireManagedListingApi } from "@/lib/access/require-managed-api";
import { isFlexiblePeriod } from "@/lib/booking-periods";
import { resolveRecurringHourlyRate } from "@/lib/recurring-bookings";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.admin
    .from("spaces")
    .select("recurring_bookings_enabled, recurring_max_occurrences")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ enabled: false, maxOccurrences: null, available: false });
  }
  const row = data as {
    recurring_bookings_enabled?: boolean | null;
    recurring_max_occurrences?: number | null;
  };
  return NextResponse.json({
    enabled: Boolean(row.recurring_bookings_enabled),
    maxOccurrences: row.recurring_max_occurrences ?? null,
    available: true,
  });
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  let body: { enabled?: boolean; maxOccurrences?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid recurring booking settings." }, { status: 400 });
  }

  const enabled = Boolean(body.enabled);
  const maxOccurrences = body.maxOccurrences == null ? null : Number(body.maxOccurrences);
  if (maxOccurrences != null && (!Number.isInteger(maxOccurrences) || maxOccurrences < 1 || maxOccurrences > 750)) {
    return NextResponse.json(
      { error: "The session limit must be a whole number from 1 to 750." },
      { status: 400 }
    );
  }

  if (enabled) {
    const { data: space } = await auth.admin
      .from("spaces")
      .select("price_per_hour, price_unit, price_amount")
      .eq("id", id)
      .maybeSingle();
    const { data: rates } = await auth.admin
      .from("space_booking_rates")
      .select("period, amount, enabled")
      .eq("space_id", id)
      .eq("enabled", true);
    const flexibleRates = (rates ?? []).flatMap((rate) => {
      const period = String((rate as { period?: string }).period || "");
      const amount = Number((rate as { amount?: number }).amount);
      if (!isFlexiblePeriod(period) || !(amount > 0)) return [];
      return [{ period, amount }];
    });
    const spaceRow = space as {
      price_per_hour?: number | null;
      price_unit?: string | null;
      price_amount?: number | null;
    } | null;
    const hourly = resolveRecurringHourlyRate({
      flexibleRates,
      pricePerHour: spaceRow?.price_per_hour,
      priceUnit: spaceRow?.price_unit,
      priceAmount: spaceRow?.price_amount,
    });
    if (!hourly.ok) {
      return NextResponse.json({ error: hourly.error }, { status: 400 });
    }
  }

  const { error } = await auth.admin
    .from("spaces")
    .update({
      recurring_bookings_enabled: enabled,
      recurring_max_occurrences: maxOccurrences,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Recurring bookings could not be saved for this listing yet." },
      { status: 400 }
    );
  }

  return NextResponse.json({ enabled, maxOccurrences });
}
