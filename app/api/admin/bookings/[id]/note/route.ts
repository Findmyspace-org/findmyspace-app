import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    let body: { note?: string; reason?: string };
    try {
      body = (await req.json()) as { note?: string; reason?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const note = (body.note || "").trim();
    const reason = (body.reason || "").trim();
    if (note.length < 3) {
      return NextResponse.json(
        { error: "Note must be at least 3 characters." },
        { status: 400 }
      );
    }
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

    const { data: bookingRow, error: bookingErr } = await (admin
      .from("bookings") as any)
      .select("id, renter_id, owner_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingErr || !bookingRow) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const booking = bookingRow as {
      id: string;
      renter_id: string;
      owner_id: string;
    };

    const messageText = `[Support] ${note}`;

    const { data: insertedRows, error: insertErr } = await (admin
      .from("booking_messages") as any)
      .insert({
        booking_id: booking.id,
        sender_id: auth.userId,
        recipient_id: booking.renter_id,
        message: messageText,
      })
      .select("id");

    const inserted = (insertedRows as { id: string }[] | null)?.[0];
    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: insertErr?.message || "Could not add note." },
        { status: 500 }
      );
    }

    await adminAudit({
      action: "booking_support_note",
      actorUserId: auth.userId,
      targetType: "booking",
      targetId: booking.id,
      reason,
      meta: { messageId: inserted.id, noteLength: note.length },
    });

    return NextResponse.json({ ok: true, messageId: inserted.id });
  } catch (e: unknown) {
    console.error("admin booking note POST:", e);
    return NextResponse.json(
      { error: "Could not add support note." },
      { status: 500 }
    );
  }
}
