import { NextRequest, NextResponse } from "next/server";
import { requireManagedListingApi } from "@/lib/access/require-managed-api";
import { parseFlexibleRateDraft } from "@/lib/flexible-booking";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.admin
    .from("space_booking_rates")
    .select("period, amount, enabled")
    .eq("space_id", id)
    .order("period");

  if (error) {
    const missing =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /space_booking_rates/i.test(error.message || "");
    if (missing) {
      return NextResponse.json({ useFlexibleRates: false, rates: [] });
    }
    return NextResponse.json({ error: "Could not load booking options." }, { status: 400 });
  }

  const rates = (data ?? []).filter((row) => row.enabled);
  return NextResponse.json({
    useFlexibleRates: rates.length > 0,
    rates,
  });
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  let body: { useFlexibleRates?: boolean; rates?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid booking options." }, { status: 400 });
  }

  const useFlexibleRates = Boolean(body.useFlexibleRates);
  let rates: { period: string; amount: number }[] = [];
  if (useFlexibleRates) {
    const parsed = parseFlexibleRateDraft(body.rates);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    rates = parsed.rates;
  }

  const { data, error } = await auth.admin.rpc("replace_space_booking_rates", {
    p_space_id: id,
    p_rates: rates,
  });

  if (error) {
    const message = error.message || "Could not save booking options.";
    const status = /not authorized/i.test(message) ? 403 : 400;
    return NextResponse.json(
      { error: message.replace(/^.*ERROR:\s*/, "") },
      { status }
    );
  }

  return NextResponse.json(data ?? { useFlexibleRates, rates });
}
