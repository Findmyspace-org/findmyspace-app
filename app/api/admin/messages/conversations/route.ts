import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  created_at: string | null;
};

type SpaceRow = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
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

  if (roleErr || !profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { adminClient, userId: user.id };
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if ("error" in auth) return auth.error;

  const { adminClient, userId } = auth;
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const statusFilter = (searchParams.get("status") || "all").trim().toLowerCase();
  const unreadOnly = (searchParams.get("unread") || "") === "1";

  const { data: bookingData, error: bookingErr } = await adminClient
    .from("bookings")
    .select(
      "id, space_id, renter_id, owner_id, booking_unit, status, payment_status, start_at, end_at, total_price, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (bookingErr) {
    return NextResponse.json({ error: bookingErr.message }, { status: 500 });
  }

  const bookings = (bookingData || []) as BookingRow[];
  if (bookings.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const bookingIds = bookings.map((b) => b.id);
  const spaceIds = Array.from(new Set(bookings.map((b) => b.space_id).filter(Boolean))) as string[];
  const participantIds = Array.from(
    new Set(bookings.flatMap((b) => [b.owner_id, b.renter_id]).filter(Boolean))
  );

  const [{ data: spaceData }, { data: profileData }, { data: messageData }] = await Promise.all([
    spaceIds.length
      ? adminClient
          .from("spaces")
          .select("id, title, city, suburb")
          .in("id", spaceIds)
      : Promise.resolve({ data: [] as any[] }),
    participantIds.length
      ? (adminClient.from("profiles") as any)
          .select("id, first_name, last_name, full_name, email, role")
          .in("id", participantIds)
      : Promise.resolve({ data: [] as any[] }),
    bookingIds.length
      ? (adminClient.from("booking_messages") as any)
          .select("id, booking_id, sender_id, recipient_id, message, created_at")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const spaceMap = new Map<string, SpaceRow>();
  for (const row of (spaceData || []) as SpaceRow[]) {
    spaceMap.set(row.id, row);
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const row of (profileData || []) as ProfileRow[]) {
    profileMap.set(row.id, row);
  }

  const latestMessageByBooking = new Map<string, MessageRow>();
  const messageCountByBooking = new Map<string, number>();
  for (const row of (messageData || []) as MessageRow[]) {
    if (!latestMessageByBooking.has(row.booking_id)) {
      latestMessageByBooking.set(row.booking_id, row);
    }
    messageCountByBooking.set(
      row.booking_id,
      (messageCountByBooking.get(row.booking_id) || 0) + 1
    );
  }

  const conversations = bookings
    .map((booking) => {
      const listing = booking.space_id ? spaceMap.get(booking.space_id) : null;
      const owner = profileMap.get(booking.owner_id);
      const renter = profileMap.get(booking.renter_id);
      const latest = latestMessageByBooking.get(booking.id) || null;
      const unread = Boolean(latest && latest.sender_id !== userId);
      const searchable = [
        listing?.title,
        displayName(owner),
        displayName(renter),
        latest?.message,
        booking.status,
        booking.payment_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return {
        bookingId: booking.id,
        listingId: booking.space_id,
        listingName: listing?.title || "Untitled listing",
        ownerName: displayName(owner),
        renterName: displayName(renter),
        bookingStatus: booking.status || "pending",
        paymentStatus: booking.payment_status || "unpaid",
        bookingUnit: booking.booking_unit || null,
        startAt: booking.start_at,
        endAt: booking.end_at,
        totalPrice: booking.total_price,
        latestMessage: latest?.message || "No messages yet",
        latestTimestamp: latest?.created_at || booking.created_at,
        unread,
        messageCount: messageCountByBooking.get(booking.id) || 0,
        location: [listing?.suburb, listing?.city].filter(Boolean).join(", "),
        searchable,
      };
    })
    .filter((row) => row.messageCount > 0 || Boolean(q))
    .filter((row) => (statusFilter === "all" ? true : row.bookingStatus === statusFilter))
    .filter((row) => (unreadOnly ? row.unread : true))
    .filter((row) => (q ? row.searchable.includes(q) : true))
    .sort((a, b) => {
      const at = a.latestTimestamp ? new Date(a.latestTimestamp).getTime() : 0;
      const bt = b.latestTimestamp ? new Date(b.latestTimestamp).getTime() : 0;
      return bt - at;
    });

  return NextResponse.json({ conversations });
}
