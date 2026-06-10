import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPublicSiteUrlFromEnv } from "@/lib/site-url";
import { isPlatformAdminRole } from "@/lib/admin-roles";

type BookingRow = {
  id: string;
  space_id: string | null;
  renter_id: string;
  owner_id: string;
  booking_unit: string | null;
  status: string | null;
  payment_status: string | null;
  start_at: string | null;
  end_at: string | null;
  total_price: number | null;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
};

type MessageRow = {
  id: string;
  booking_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string;
};

function displayName(profile?: ProfileRow | null) {
  if (!profile) return "Unknown user";
  const joined = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return joined || profile.full_name || profile.email || "Unknown user";
}

async function authenticateAdmin(req: NextRequest) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { error: NextResponse.json({ error: "Server configuration error" }, { status: 500 }) };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: roleErr } = await (adminClient.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .single();

  if (roleErr || !profile || !isPlatformAdminRole(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { adminClient, userId: user.id };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const auth = await authenticateAdmin(req);
  if ("error" in auth) return auth.error;
  const { adminClient } = auth;
  const { bookingId } = await params;

  const { data: bookingData, error: bookingErr } = await adminClient
    .from("bookings")
    .select(
      "id, space_id, renter_id, owner_id, booking_unit, status, payment_status, start_at, end_at, total_price"
    )
    .eq("id", bookingId)
    .single();

  if (bookingErr || !bookingData) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const booking = bookingData as BookingRow;

  const [{ data: messageData }, { data: profileData }, { data: spaceData }, { data: imageData }] =
    await Promise.all([
      (adminClient.from("booking_messages") as any)
        .select("id, booking_id, sender_id, recipient_id, message, created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: true }),
      (adminClient.from("profiles") as any)
        .select("id, first_name, last_name, full_name, email, phone, role")
        .in("id", [booking.owner_id, booking.renter_id]),
      booking.space_id
        ? adminClient
            .from("spaces")
            .select("id, title, address_line_1, suburb, city")
            .eq("id", booking.space_id)
            .single()
        : Promise.resolve({ data: null }),
      booking.space_id
        ? adminClient
            .from("space_images")
            .select("image_url")
            .eq("space_id", booking.space_id)
            .order("sort_order", { ascending: true })
            .limit(1)
        : Promise.resolve({ data: [] }),
    ]);

  const profiles = (profileData || []) as ProfileRow[];
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const ownerProfile = profileMap.get(booking.owner_id) || null;
  const renterProfile = profileMap.get(booking.renter_id) || null;

  const messages = ((messageData || []) as MessageRow[]).map((msg) => {
    const senderProfile = profileMap.get(msg.sender_id) || null;
    const senderRole =
      msg.sender_id === booking.owner_id
        ? "Owner"
        : msg.sender_id === booking.renter_id
        ? "Renter"
        : senderProfile?.role === "admin"
        ? "Admin"
        : "User";

    return {
      id: msg.id,
      message: msg.message,
      createdAt: msg.created_at,
      senderId: msg.sender_id,
      senderName: displayName(senderProfile),
      senderRole,
    };
  });

  const space = (spaceData || null) as {
    id: string;
    title: string | null;
    address_line_1: string | null;
    suburb: string | null;
    city: string | null;
  } | null;

  return NextResponse.json({
    booking: {
      id: booking.id,
      status: booking.status || "pending",
      paymentStatus: booking.payment_status || "unpaid",
      bookingUnit: booking.booking_unit || null,
      startAt: booking.start_at,
      endAt: booking.end_at,
      totalPrice: booking.total_price,
      viewBookingUrl: "/dashboard/requests",
      viewListingUrl: booking.space_id ? `/spaces/${booking.space_id}` : null,
    },
    listing: {
      id: space?.id || booking.space_id,
      title: space?.title || "Untitled listing",
      location: [space?.address_line_1, space?.suburb, space?.city]
        .filter(Boolean)
        .join(", "),
      imageUrl:
        ((imageData || []) as { image_url: string | null }[])[0]?.image_url || null,
    },
    owner: {
      id: booking.owner_id,
      name: displayName(ownerProfile),
      email: ownerProfile?.email || null,
      phone: ownerProfile?.phone || null,
    },
    renter: {
      id: booking.renter_id,
      name: displayName(renterProfile),
      email: renterProfile?.email || null,
    },
    messages,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const auth = await authenticateAdmin(req);
  if ("error" in auth) return auth.error;
  const { adminClient, userId } = auth;
  const { bookingId } = await params;

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

  const { data: bookingData, error: bookingErr } = await adminClient
    .from("bookings")
    .select("id, renter_id, owner_id")
    .eq("id", bookingId)
    .single();

  if (bookingErr || !bookingData) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const booking = bookingData as { id: string; renter_id: string; owner_id: string };

  const { data: recentMessages } = await (adminClient.from("booking_messages") as any)
    .select("sender_id")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .limit(10);

  let recipientId = booking.renter_id;
  for (const msg of (recentMessages || []) as { sender_id: string }[]) {
    if (msg.sender_id !== userId) {
      recipientId = msg.sender_id;
      break;
    }
  }

  if (recipientId !== booking.renter_id && recipientId !== booking.owner_id) {
    recipientId = booking.renter_id;
  }

  const { data: inserted, error: insertErr } = await (adminClient.from("booking_messages") as any)
    .insert({
      booking_id: booking.id,
      sender_id: userId,
      recipient_id: recipientId,
      message: text,
    })
    .select("id, booking_id, sender_id, recipient_id, message, created_at")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message || "Could not send message." },
      { status: 500 }
    );
  }

  const { data: senderProfile } = await (adminClient.from("profiles") as any)
    .select("first_name, last_name, full_name, email, role")
    .eq("id", userId)
    .single();

  const sender = (senderProfile || null) as {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;

  const origin = getPublicSiteUrlFromEnv() ?? "";

  if (origin) {
    try {
      await fetch(`${origin}/api/notifications/booking-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          eventType: "booking_message",
          senderId: userId,
          recipientId,
          message: text,
        }),
      });
    } catch (e) {
      console.error("booking-event notification:", e);
    }
  }

  return NextResponse.json({
    message: {
      id: inserted.id,
      message: inserted.message,
      createdAt: inserted.created_at,
      senderId: inserted.sender_id,
      senderName:
        `${sender?.first_name || ""} ${sender?.last_name || ""}`.trim() ||
        sender?.full_name ||
        sender?.email ||
        "Admin",
      senderRole: sender?.role === "admin" ? "Admin" : "User",
    },
  });
}
