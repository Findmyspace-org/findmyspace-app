import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import { normalizeAdvisorCode } from "@/lib/advisor-code";
import {
  advisorRangeFromQuery,
  computeAdvisorMetricsForIds,
  type AdvisorRange,
} from "@/lib/space-advisor-metrics";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id: rawId } = await params;
    const id = (rawId || "").trim();
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const admin = serviceAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Missing server configuration." },
        { status: 500 }
      );
    }

    const { data: advisor, error: advErr } = await (admin
      .from("space_advisors") as any)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (advErr) {
      return NextResponse.json({ error: advErr.message }, { status: 500 });
    }
    if (!advisor) {
      return NextResponse.json({ error: "Advisor not found." }, { status: 404 });
    }

    const range = advisorRangeFromQuery(req.nextUrl.searchParams.get("range"));
    let stats: {
      range: AdvisorRange;
      linked_users_count: number;
      listings_created_count: number;
      active_listings_count: number;
      verified_listings_count: number;
      listings_with_bookings_count: number;
      total_bookings_count: number;
    };
    try {
      const metricsMap = await computeAdvisorMetricsForIds(admin, [id], range);
      const m = metricsMap[id];
      stats = {
        range,
        linked_users_count: m.linked_users_count,
        listings_created_count: m.listings_created_count,
        active_listings_count: m.active_listings_count,
        verified_listings_count: m.verified_listings_count,
        listings_with_bookings_count: m.listings_with_bookings_count,
        total_bookings_count: m.total_bookings_count,
      };
    } catch (me: unknown) {
      const msg = me instanceof Error ? me.message : "Metrics query failed.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { data: userRows, error: usersErr } = await (admin.from("profiles") as any)
      .select(
        "id, first_name, last_name, full_name, email, phone, created_at, advisor_source, advisor_assigned_at"
      )
      .eq("advisor_id", id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    const { data: listingRows, error: listingsErr } = await (admin.from("spaces") as any)
      .select(
        "id, title, city, suburb, address_line_1, status, verification_status, advisor_source, created_at"
      )
      .eq("advisor_id", id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (listingsErr) {
      return NextResponse.json({ error: listingsErr.message }, { status: 500 });
    }

    return NextResponse.json({
      advisor,
      stats,
      users: userRows ?? [],
      listings: listingRows ?? [],
    });
  } catch (e: unknown) {
    console.error("admin space-advisors GET [id]:", e);
    return NextResponse.json(
      { error: "Could not load advisor detail." },
      { status: 500 }
    );
  }
}

function serviceAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id: rawId } = await params;
    const id = (rawId || "").trim();
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const admin = serviceAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Missing server configuration." },
        { status: 500 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if ("full_name" in body) {
      const v = String(body.full_name || "").trim();
      if (!v) {
        return NextResponse.json({ error: "full_name cannot be empty." }, { status: 400 });
      }
      patch.full_name = v;
    }
    if ("display_name" in body) {
      const v = String(body.display_name || "").trim();
      if (!v) {
        return NextResponse.json({ error: "display_name cannot be empty." }, { status: 400 });
      }
      patch.display_name = v;
    }
    if ("advisor_code" in body) {
      const c = normalizeAdvisorCode(String(body.advisor_code || ""));
      if (!c) {
        return NextResponse.json({ error: "Invalid advisor_code." }, { status: 400 });
      }
      patch.advisor_code = c;
    }
    if ("email" in body) {
      patch.email = String(body.email || "").trim() || null;
    }
    if ("phone" in body) {
      patch.phone = String(body.phone || "").trim() || null;
    }
    if ("notes" in body) {
      patch.notes = String(body.notes || "").trim() || null;
    }
    if ("status" in body) {
      patch.status = body.status === "inactive" ? "inactive" : "active";
    }

    if (Object.keys(patch).length <= 1) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { error } = await (admin.from("space_advisors") as any)
      .update(patch)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("admin space-advisors PATCH:", e);
    return NextResponse.json(
      { error: "Could not update Space Advisor." },
      { status: 500 }
    );
  }
}
