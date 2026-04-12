import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { markBookingChargesPaid } from "@/lib/invoice-payments";

/**
 * After the renter client marks a booking paid (e.g. mock pay), sync booking_charges
 * using service role. PayFast ITN uses markBookingChargesPaid directly.
 */
export async function POST(req: NextRequest) {
  try {
    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
    } = process.env;

    if (
      !NEXT_PUBLIC_SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return NextResponse.json(
        { error: "Missing server configuration." },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        auth: { persistSession: false },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const bookingId =
      typeof body.bookingId === "string" ? body.bookingId.trim() : "";
    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId." }, { status: 400 });
    }

    const admin = createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data: rows, error: fetchError } = await (admin.from("bookings") as any)
      .select(
        "id, renter_id, status, payment_status, paid_at, payment_reference"
      )
      .eq("id", bookingId)
      .limit(1);

    if (fetchError || !rows?.length) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const booking = rows[0] as {
      renter_id: string;
      status: string | null;
      payment_status: string | null;
      paid_at: string | null;
      payment_reference: string | null;
    };

    if (booking.renter_id !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (
      booking.status !== "paid_confirmed" ||
      booking.payment_status !== "paid" ||
      !booking.paid_at
    ) {
      return NextResponse.json(
        { error: "Booking is not in a paid state yet." },
        { status: 400 }
      );
    }

    const { error: markError } = await markBookingChargesPaid(
      admin,
      bookingId,
      booking.paid_at,
      booking.payment_reference ?? null
    );

    if (markError) {
      console.error("sync-paid markBookingChargesPaid:", markError);
      return NextResponse.json(
        { error: markError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("sync-paid error:", e);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
