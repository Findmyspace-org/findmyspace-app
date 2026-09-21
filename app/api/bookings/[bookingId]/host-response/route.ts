import { NextRequest, NextResponse } from "next/server";
import { requireManagedBookingApi } from "@/lib/access/require-managed-api";
import { applyHostBookingResponse } from "@/lib/booking-host-response";
import { notifyBookingEvent } from "@/lib/booking-event-notify";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const auth = await requireManagedBookingApi(req, bookingId);
  if ("response" in auth) return auth.response;

  let body: { action?: string; message?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    const result = await applyHostBookingResponse(auth.admin, {
      bookingId: auth.bookingId,
      actorUserId: auth.userId,
      action,
      message: body.message ?? null,
    });

    const notify = async (id: string, eventType: "booking_approved_payment_needed" | "booking_declined") => {
      try {
        await notifyBookingEvent({
          admin: auth.admin,
          bookingId: id,
          eventType,
        });
      } catch (err) {
        console.error("host-response notification:", err);
      }
    };

    if (action === "approve") {
      await notify(auth.bookingId, "booking_approved_payment_needed");
      await Promise.all(
        result.competingDeclinedIds.map((id) => notify(id, "booking_declined"))
      );
    } else {
      await notify(auth.bookingId, "booking_declined");
    }

    return NextResponse.json({
      ok: true,
      booking: result.booking,
      competingDeclinedIds: result.competingDeclinedIds,
      ownerResponseBy: auth.userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update booking.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
