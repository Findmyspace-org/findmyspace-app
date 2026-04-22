import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { markMessageNotificationsReadForBooking } from "@/lib/notification-lifecycle";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { bookingId } = (await req.json()) as { bookingId?: string };
    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, renter_id, owner_id")
      .eq("id", bookingId)
      .maybeSingle();

    const row = booking as { id: string; renter_id: string; owner_id: string } | null;
    if (bookingError || !row) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (row.renter_id !== user.id && row.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await markMessageNotificationsReadForBooking(admin, {
      userId: user.id,
      bookingId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("read-for-booking error:", error);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
