import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  resolveServerRecurringQuote,
  type RecurringRequestInput,
} from "@/lib/recurring-booking-server";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let body: { spaceId?: string; recurring?: RecurringRequestInput };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid recurring booking." }, { status: 400 });
  }
  if (!body.spaceId || !UUID_RE.test(body.spaceId) || !body.recurring) {
    return NextResponse.json({ error: "Choose a listing and a recurring schedule." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const { quote, conflicts } = await resolveServerRecurringQuote(admin, body.spaceId, body.recurring);
    return NextResponse.json({
      summary: quote.summary,
      firstSession: quote.sessions.find((session) => !session.excluded)?.date ?? null,
      lastSession: [...quote.sessions].reverse().find((session) => !session.excluded)?.date ?? null,
      includedCount: quote.includedCount,
      hoursPerSession: quote.hoursPerSession,
      totalHours: quote.totalHours,
      hourlyRate: quote.hourlyRate,
      sessionPrice: quote.sessionPrice,
      rentalSubtotal: quote.rentalSubtotal,
      sessions: quote.sessions.map((session) => ({
        date: session.date,
        excluded: session.excluded,
      })),
      conflicts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not price this recurring booking.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
