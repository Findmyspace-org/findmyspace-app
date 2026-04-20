import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { getPublicSiteUrlFromEnv } from "@/lib/site-url";
import { normalizePaymentStatus } from "@/lib/finance-status";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mirrors `canCancelBooking` on the renter My Bookings page. */
const ALLOWED_CANCEL_STATUSES = new Set(["pending_owner", "accepted_awaiting_payment"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id: rawId } = await params;
    const bookingId = (rawId || "").trim();
    if (!UUID_RE.test(bookingId)) {
      return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
    }

    let body: { reason?: string };
    try {
      body = (await req.json()) as { reason?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const reason = (body.reason || "").trim();
    if (reason.length < 3) {
      return NextResponse.json(
        { error: "Reason must be at least 3 characters." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing server configuration." },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: bookingRow, error: fetchErr } = await (admin
      .from("bookings") as any)
      .select("id, renter_id, owner_id, status, payment_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchErr || !bookingRow) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const booking = bookingRow as {
      id: string;
      renter_id: string;
      owner_id: string;
      status: string | null;
      payment_status: string | null;
    };

    const st = (booking.status || "").trim();
    if (!ALLOWED_CANCEL_STATUSES.has(st)) {
      return NextResponse.json(
        {
          error:
            "Support cancellation is only allowed for bookings pending host approval or awaiting payment.",
        },
        { status: 400 }
      );
    }

    const ps = normalizePaymentStatus(booking.payment_status).toLowerCase();
    if (ps === "paid" || ps === "paid_confirmed") {
      return NextResponse.json(
        { error: "Cannot cancel a booking that is already paid." },
        { status: 400 }
      );
    }

    const cancelMessage = `[Support] This booking was cancelled by support. Reason: ${reason}`;

    const { data: updatedRows, error: updateErr } = await (admin
      .from("bookings") as any)
      .update({
        status: "declined",
        payment_status: "unpaid",
      })
      .eq("id", booking.id)
      .select("id");

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updatedRows?.length) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    await (admin.from("booking_messages") as any).insert({
      booking_id: booking.id,
      sender_id: auth.userId,
      recipient_id: booking.owner_id,
      message: cancelMessage,
    });

    const origin = getPublicSiteUrlFromEnv() ?? "";
    if (origin) {
      try {
        await fetch(`${origin}/api/notifications/booking-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: booking.id,
            eventType: "booking_message",
            senderId: auth.userId,
            recipientId: booking.owner_id,
            message: cancelMessage,
          }),
        });
      } catch (e) {
        console.error("booking-event notification (admin cancel):", e);
      }
    }

    await adminAudit({
      action: "booking_cancel_support",
      actorUserId: auth.userId,
      targetType: "booking",
      targetId: booking.id,
      reason,
      meta: { priorStatus: booking.status, priorPaymentStatus: booking.payment_status },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("admin booking cancel-support POST:", e);
    return NextResponse.json(
      { error: "Could not cancel booking." },
      { status: 500 }
    );
  }
}
