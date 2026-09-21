import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  resolveAccessForProperty,
  resolveAccessForSpace,
} from "@/lib/access/resolve-access";
import type { ResolvedAccess } from "@/lib/access/roles";

export type ManagedAuthOk = {
  userId: string;
  admin: SupabaseClient;
  access: ResolvedAccess;
};

export type ManagedAuthFail = { response: NextResponse };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticateManagedRequest(
  req: NextRequest
): Promise<
  | { userId: string; admin: SupabaseClient }
  | ManagedAuthFail
> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return {
      response: NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      ),
    };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
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
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return { userId: user.id, admin };
}

/**
 * Server gate for listing mutations using the organisation access resolver.
 * Not wired into existing owner routes yet; owner helpers remain production paths.
 */
export async function requireManagedListingApi(
  req: NextRequest,
  spaceId: string
): Promise<ManagedAuthOk | ManagedAuthFail> {
  if (!UUID_RE.test(spaceId)) {
    return {
      response: NextResponse.json({ error: "Invalid listing id." }, { status: 400 }),
    };
  }

  const auth = await authenticateManagedRequest(req);
  if ("response" in auth) return auth;

  const access = await resolveAccessForSpace(auth.admin, auth.userId, spaceId);
  if (!access) {
    return {
      response: NextResponse.json({ error: "Listing not found." }, { status: 404 }),
    };
  }
  if (!access.canEditSpace) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { userId: auth.userId, admin: auth.admin, access };
}

/**
 * Server gate for property-scoped mutations using the organisation access resolver.
 * Space Managers of a single space do not receive property-wide access.
 * Not wired into existing owner routes yet.
 */
export async function requireManagedPropertyApi(
  req: NextRequest,
  propertyId: string
): Promise<ManagedAuthOk | ManagedAuthFail> {
  if (!UUID_RE.test(propertyId)) {
    return {
      response: NextResponse.json(
        { error: "Invalid property id." },
        { status: 400 }
      ),
    };
  }

  const auth = await authenticateManagedRequest(req);
  if ("response" in auth) return auth;

  const access = await resolveAccessForProperty(
    auth.admin,
    auth.userId,
    propertyId
  );
  if (!access) {
    return {
      response: NextResponse.json({ error: "Property not found." }, { status: 404 }),
    };
  }
  if (!access.canEditSpace) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { userId: auth.userId, admin: auth.admin, access };
}

export type ManagedBookingAuthOk = ManagedAuthOk & {
  bookingId: string;
  spaceId: string;
};

/**
 * Host-side booking mutation gate. userId comes from the verified session.
 * Renters cannot use this path even if they also have a grant.
 */
export async function requireManagedBookingApi(
  req: NextRequest,
  bookingId: string
): Promise<ManagedBookingAuthOk | ManagedAuthFail> {
  if (!UUID_RE.test(bookingId)) {
    return {
      response: NextResponse.json({ error: "Invalid booking id." }, { status: 400 }),
    };
  }

  const auth = await authenticateManagedRequest(req);
  if ("response" in auth) return auth;

  const { data: booking, error } = await auth.admin
    .from("bookings")
    .select("id, space_id, renter_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) {
    return {
      response: NextResponse.json({ error: "Booking not found." }, { status: 404 }),
    };
  }

  const row = booking as { id: string; space_id: string; renter_id: string };
  if (row.renter_id === auth.userId) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  const access = await resolveAccessForSpace(
    auth.admin,
    auth.userId,
    row.space_id
  );
  if (!access || !access.canManageBooking) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return {
    userId: auth.userId,
    admin: auth.admin,
    access,
    bookingId: row.id,
    spaceId: row.space_id,
  };
}
