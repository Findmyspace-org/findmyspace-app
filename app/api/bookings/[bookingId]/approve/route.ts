import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import {
  approveBookingWithOptionalDiscount,
  BookingApproveError,
} from "@/lib/booking-approve-server";
import { getCanonicalPublicSiteUrl, getPublicSiteUrlFromEnv } from "@/lib/site-url";

export const runtime = "nodejs";

async function notifyBookingEvent(
  bookingId: string,
  eventType: string
): Promise<void> {
  const appBaseUrl = getPublicSiteUrlFromEnv() || getCanonicalPublicSiteUrl();
  if (!appBaseUrl) return;
  try {
    const res = await fetch(`${appBaseUrl}/api/notifications/booking-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, eventType }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Booking approve notification failed:", {
        bookingId,
        eventType,
        status: res.status,
        body,
      });
    }
  } catch (error) {
    console.error("Booking approve notification error:", { bookingId, eventType, error });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const { bookingId } = await params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await approveBookingWithOptionalDiscount(
      auth.admin,
      auth.userId,
      bookingId,
      body
    );

    const renterEvent = result.complimentary
      ? "booking_approved_complimentary"
      : "booking_approved_payment_needed";
    await notifyBookingEvent(result.bookingId, renterEvent);

    await Promise.all(
      result.declinedCompetingIds.map((id) => notifyBookingEvent(id, "booking_declined"))
    );

    return NextResponse.json({
      ok: true,
      bookingId: result.bookingId,
      status: result.status,
      paymentStatus: result.paymentStatus,
      complimentary: result.complimentary,
      originalAmount: result.originalAmount,
      discountAmount: result.discountAmount,
      finalAmount: result.finalAmount,
      discountType: result.discountType,
      declinedCompetingIds: result.declinedCompetingIds,
    });
  } catch (err) {
    if (err instanceof BookingApproveError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Could not approve booking.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
