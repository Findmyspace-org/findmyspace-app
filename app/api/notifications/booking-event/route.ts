import { NextResponse } from "next/server";

/**
 * Public HTTP booking-event surface is closed.
 * Trusted callers must use `notifyBookingEvent` from `@/lib/booking-event-notify`.
 * Do not authenticate this route with CRON_SECRET or a browser-exposed secret.
 */
export async function POST() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
