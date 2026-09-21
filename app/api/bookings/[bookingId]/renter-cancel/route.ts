import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { applyRenterBookingCancel, RENTER_CANCEL_MESSAGE } from "@/lib/booking-renter-cancel";
import { notifyBookingEvent } from "@/lib/booking-event-notify";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
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
    const result = await applyRenterBookingCancel(auth.admin, {
      bookingId,
      renterId: auth.userId,
    });

    if (result.hostRecipientId) {
      try {
        await notifyBookingEvent({
          admin: auth.admin,
          bookingId: result.bookingId,
          eventType: "booking_message",
          senderId: auth.userId,
          recipientId: result.hostRecipientId,
          message: RENTER_CANCEL_MESSAGE,
        });
      } catch (err) {
        console.error("renter-cancel notification:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      bookingId: result.bookingId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not cancel booking.";
    const status =
      message === "Booking not found."
        ? 404
        : message === "You can only cancel your own booking."
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
