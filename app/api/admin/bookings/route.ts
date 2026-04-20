import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";

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

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
};

type SpaceRow = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
};

function displayName(profile?: ProfileRow | null) {
  if (!profile) return "Unknown user";
  const joined = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return joined || profile.full_name || profile.email || "Unknown user";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

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

    const statusFilter = (req.nextUrl.searchParams.get("status") || "all").trim();
    const paymentFilter = (
      req.nextUrl.searchParams.get("payment_status") || "all"
    ).trim();
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();

    let bookingQuery = (admin.from("bookings") as any)
      .select(
        "id, space_id, renter_id, owner_id, booking_unit, status, payment_status, start_at, end_at, total_price, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (statusFilter && statusFilter !== "all") {
      bookingQuery = bookingQuery.eq("status", statusFilter);
    }
    if (paymentFilter && paymentFilter !== "all") {
      bookingQuery = bookingQuery.eq("payment_status", paymentFilter);
    }

    const { data: bookingData, error: bookingErr } = await bookingQuery;

    if (bookingErr) {
      return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    }

    const bookings = (bookingData || []) as BookingRow[];
    if (bookings.length === 0) {
      return NextResponse.json({ bookings: [] });
    }

    const spaceIds = Array.from(
      new Set(bookings.map((b) => b.space_id).filter(Boolean))
    ) as string[];
    const participantIds = Array.from(
      new Set(bookings.flatMap((b) => [b.owner_id, b.renter_id]).filter(Boolean))
    );

    const [{ data: spaceData }, { data: profileData }] = await Promise.all([
      spaceIds.length
        ? (admin.from("spaces") as any)
            .select("id, title, city, suburb")
            .in("id", spaceIds)
        : Promise.resolve({ data: [] as SpaceRow[] }),
      participantIds.length
        ? (admin.from("profiles") as any)
            .select("id, first_name, last_name, full_name, email")
            .in("id", participantIds)
        : Promise.resolve({ data: [] as ProfileRow[] }),
    ]);

    const spaceMap = new Map<string, SpaceRow>();
    for (const row of (spaceData || []) as SpaceRow[]) {
      spaceMap.set(row.id, row);
    }

    const profileMap = new Map<string, ProfileRow>();
    for (const row of (profileData || []) as ProfileRow[]) {
      profileMap.set(row.id, row);
    }

    const enriched = bookings.map((booking) => {
      const listing = booking.space_id
        ? spaceMap.get(booking.space_id)
        : null;
      const owner = profileMap.get(booking.owner_id);
      const renter = profileMap.get(booking.renter_id);
      const searchable = [
        booking.id,
        listing?.title,
        listing?.city,
        listing?.suburb,
        displayName(owner),
        displayName(renter),
        owner?.email,
        renter?.email,
        booking.status,
        booking.payment_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return {
        id: booking.id,
        spaceId: booking.space_id,
        listingTitle: listing?.title || "Untitled listing",
        location: [listing?.suburb, listing?.city].filter(Boolean).join(", "),
        renterId: booking.renter_id,
        renterName: displayName(renter),
        renterEmail: renter?.email ?? null,
        ownerId: booking.owner_id,
        ownerName: displayName(owner),
        ownerEmail: owner?.email ?? null,
        bookingUnit: booking.booking_unit,
        status: booking.status || "pending",
        paymentStatus: booking.payment_status || "unpaid",
        startAt: booking.start_at,
        endAt: booking.end_at,
        totalPrice: booking.total_price,
        createdAt: booking.created_at,
        searchable,
      };
    });

    const rows = enriched
      .filter((row) => (q ? row.searchable.includes(q) : true))
      .map(({ searchable: _s, ...rest }) => rest);

    return NextResponse.json({ bookings: rows });
  } catch (e: unknown) {
    console.error("admin bookings GET:", e);
    return NextResponse.json(
      { error: "Could not load bookings." },
      { status: 500 }
    );
  }
}
