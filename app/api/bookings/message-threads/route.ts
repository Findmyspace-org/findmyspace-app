import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCommunicationAllowed } from "@/lib/booking-communication";
import { getDisplayName } from "@/lib/utils";

export async function GET(req: NextRequest) {
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

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: bookings, error: bookingsError } = await admin
      .from("bookings")
      .select(
        "id, space_id, renter_id, owner_id, status, payment_status, start_at, end_at, booking_unit, created_at"
      )
      .or(`renter_id.eq.${user.id},owner_id.eq.${user.id}`);

    if (bookingsError) {
      return NextResponse.json(
        { error: bookingsError.message || "Could not load bookings." },
        { status: 500 }
      );
    }

    const eligible = ((bookings || []) as any[]).filter((b) =>
      isCommunicationAllowed({
        status: b.status,
        payment_status: b.payment_status,
      })
    );

    if (eligible.length === 0) {
      return NextResponse.json({ threads: [] });
    }

    const bookingIds = eligible.map((b) => b.id as string);
    const spaceIds = [...new Set(eligible.map((b) => b.space_id as string).filter(Boolean))];

    const { data: spaces } = await (admin.from("spaces") as any)
      .select("id, title, city, suburb")
      .in("id", spaceIds);

    const spaceMap = new Map(
      ((spaces || []) as { id: string; title: string | null; city: string | null; suburb: string | null }[]).map(
        (s) => [s.id, s]
      )
    );

    // Cover thumbnail per space — lowest sort_order wins.
    const spaceCoverMap = new Map<string, string>();
    if (spaceIds.length) {
      const { data: imageRows } = await (admin.from("space_images") as any)
        .select("space_id, image_url, sort_order")
        .in("space_id", spaceIds)
        .order("sort_order", { ascending: true });
      for (const row of (imageRows || []) as {
        space_id: string;
        image_url: string;
      }[]) {
        if (!spaceCoverMap.has(row.space_id)) {
          spaceCoverMap.set(row.space_id, row.image_url);
        }
      }
    }

    const otherIds = eligible.map((b) =>
      b.renter_id === user.id ? b.owner_id : b.renter_id
    ) as string[];
    const uniqueOther = [...new Set(otherIds)];

    const { data: profiles } = await (admin.from("profiles") as any)
      .select("id, first_name, last_name, email")
      .in("id", uniqueOther);

    const profileMap = new Map(
      ((profiles || []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }[]).map((p) => [p.id, p])
    );

    const { data: allMessages } = await (admin.from("booking_messages") as any)
      .select("booking_id, message, created_at")
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: false });

    const latestByBooking = new Map<
      string,
      { preview: string; at: string }
    >();
    for (const m of (allMessages || []) as {
      booking_id: string;
      message: string;
      created_at: string;
    }[]) {
      if (!latestByBooking.has(m.booking_id)) {
        latestByBooking.set(m.booking_id, {
          preview: m.message,
          at: m.created_at,
        });
      }
    }

    const { data: unreadNotifs } = await (admin.from("notifications") as any)
      .select("related_entity_id")
      .eq("user_id", user.id)
      .eq("type", "booking_message")
      .eq("is_read", false)
      .eq("related_entity_type", "booking");

    const unreadByBooking = new Map<string, number>();
    for (const n of (unreadNotifs || []) as { related_entity_id: string }[]) {
      const bid = n.related_entity_id;
      unreadByBooking.set(bid, (unreadByBooking.get(bid) || 0) + 1);
    }

    const threads = eligible.map((b) => {
      const otherId = b.renter_id === user.id ? b.owner_id : b.renter_id;
      const space = spaceMap.get(b.space_id);
      const latest = latestByBooking.get(b.id);
      return {
        bookingId: b.id as string,
        spaceId: b.space_id as string,
        listingTitle: space?.title || "Listing",
        spaceCoverUrl: spaceCoverMap.get(b.space_id) || null,
        location: [space?.suburb, space?.city].filter(Boolean).join(", ") || null,
        otherPartyName: getDisplayName(profileMap.get(otherId) || undefined),
        viewerRole: b.renter_id === user.id ? "renter" : "owner",
        lastMessagePreview: latest?.preview || "",
        lastMessageAt: latest?.at || null,
        unreadCount: unreadByBooking.get(b.id) || 0,
        bookingUnit: b.booking_unit as string | null,
        startAt: b.start_at as string,
        endAt: b.end_at as string,
      };
    });

    threads.sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (bt !== at) return bt - at;
      const ca = (eligible.find((x) => x.id === a.bookingId)?.created_at as string) || "";
      const cb = (eligible.find((x) => x.id === b.bookingId)?.created_at as string) || "";
      return new Date(cb).getTime() - new Date(ca).getTime();
    });

    return NextResponse.json({ threads });
  } catch (error) {
    console.error("message-threads GET error:", error);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
