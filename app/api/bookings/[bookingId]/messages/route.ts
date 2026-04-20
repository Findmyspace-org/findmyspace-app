import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCommunicationAllowed } from "@/lib/booking-communication";
import { getPublicSiteUrlFromEnv } from "@/lib/site-url";

const FORBIDDEN_MSG = "Messaging is only available after payment confirmation.";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, renter_id, owner_id, status, payment_status")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const row = booking as {
    id: string;
    renter_id: string;
    owner_id: string;
    status: string | null;
    payment_status: string | null;
  };

  const isRenter = row.renter_id === user.id;
  const isOwner = row.owner_id === user.id;
  if (!isRenter && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isCommunicationAllowed(row)) {
    return NextResponse.json({ error: FORBIDDEN_MSG }, { status: 403 });
  }

  const { data: messages, error: msgError } = await (admin.from("booking_messages") as any)
    .select("id, booking_id, sender_id, recipient_id, message, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  if (msgError) {
    return NextResponse.json(
      { error: msgError.message || "Could not load messages." },
      { status: 500 }
    );
  }

  const counterpartyId = isRenter ? row.owner_id : row.renter_id;
  const { data: cpProfile } = await (admin.from("profiles") as any)
    .select("email, phone")
    .eq("id", counterpartyId)
    .single();

  const cp = cpProfile as { email: string | null; phone: string | null } | null;

  const counterpartyContact = {
    email: cp?.email ?? null,
    phone: cp?.phone?.trim() ? cp.phone : null,
  };

  return NextResponse.json({
    messages: messages || [],
    counterpartyContact,
    viewerRole: isRenter ? "renter" : "owner",
    ownerContact: isRenter ? counterpartyContact : null,
    renterContact: isOwner ? counterpartyContact : null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.message || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, renter_id, owner_id, status, payment_status")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const row = booking as {
    id: string;
    renter_id: string;
    owner_id: string;
    status: string | null;
    payment_status: string | null;
  };

  const isRenter = row.renter_id === user.id;
  const isOwner = row.owner_id === user.id;
  if (!isRenter && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isCommunicationAllowed(row)) {
    return NextResponse.json({ error: FORBIDDEN_MSG }, { status: 403 });
  }

  const recipientId = isRenter ? row.owner_id : row.renter_id;

  const { data: inserted, error: insertError } = await (admin.from("booking_messages") as any)
    .insert({
      booking_id: bookingId,
      sender_id: user.id,
      recipient_id: recipientId,
      message: text,
    })
    .select("id, booking_id, sender_id, recipient_id, message, created_at")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message || "Could not send message." },
      { status: 500 }
    );
  }

  const origin = getPublicSiteUrlFromEnv() ?? "";

  if (origin) {
    try {
      await fetch(`${origin}/api/notifications/booking-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          eventType: "booking_message",
          senderId: user.id,
          recipientId,
          message: text,
        }),
      });
    } catch (e) {
      console.error("booking-event notification:", e);
    }
  }

  return NextResponse.json({ message: inserted });
}
