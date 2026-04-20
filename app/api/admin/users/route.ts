import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
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

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const pattern = q ? `%${escapeIlike(q)}%` : null;

    let profileQuery = (admin.from("profiles") as any)
      .select(
        "id, role, first_name, last_name, full_name, email, phone, created_at, is_host, owner_verification_status, bank_verification_status"
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    if (pattern) {
      profileQuery = profileQuery.or(
        `email.ilike.${pattern},phone.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},full_name.ilike.${pattern}`
      );
    }

    const { data: profileRows, error: profileError } = await profileQuery;

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const [{ data: spaceRows }, { data: bookingRows }] = await Promise.all([
      (admin.from("spaces") as any).select("owner_id"),
      (admin.from("bookings") as any).select("renter_id, owner_id"),
    ]);

    const listingCountByOwner = new Map<string, number>();
    for (const row of (spaceRows || []) as { owner_id?: string | null }[]) {
      const oid = row.owner_id;
      if (!oid) continue;
      listingCountByOwner.set(oid, (listingCountByOwner.get(oid) || 0) + 1);
    }

    const renterBookingCount = new Map<string, number>();
    const ownerBookingCount = new Map<string, number>();
    for (const row of (bookingRows || []) as {
      renter_id?: string | null;
      owner_id?: string | null;
    }[]) {
      if (row.renter_id) {
        renterBookingCount.set(
          row.renter_id,
          (renterBookingCount.get(row.renter_id) || 0) + 1
        );
      }
      if (row.owner_id) {
        ownerBookingCount.set(
          row.owner_id,
          (ownerBookingCount.get(row.owner_id) || 0) + 1
        );
      }
    }

    const users = ((profileRows || []) as Record<string, unknown>[]).map(
      (p) => {
        const id = String(p.id ?? "");
        return {
          ...p,
          listingCount: listingCountByOwner.get(id) || 0,
          bookingCountAsRenter: renterBookingCount.get(id) || 0,
          bookingCountAsOwner: ownerBookingCount.get(id) || 0,
        };
      }
    );

    return NextResponse.json({ users });
  } catch (e: unknown) {
    console.error("admin users GET:", e);
    return NextResponse.json(
      { error: "Could not load users." },
      { status: 500 }
    );
  }
}
