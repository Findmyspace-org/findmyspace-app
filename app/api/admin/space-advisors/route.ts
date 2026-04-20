import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import { normalizeAdvisorCode } from "@/lib/advisor-code";
import {
  advisorRangeFromQuery,
  computeAdvisorMetricsForIds,
  type AdvisorMetrics,
} from "@/lib/space-advisor-metrics";

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function csvEscapeCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type AdvisorRowOut = Record<string, unknown> & AdvisorMetrics;

function leaderboardPool(
  rows: AdvisorRowOut[],
  statusFilter: string
): AdvisorRowOut[] {
  if (statusFilter === "inactive") {
    return rows.filter((r) => r.status === "inactive");
  }
  if (statusFilter === "active") {
    return rows.filter((r) => r.status === "active");
  }
  return rows.filter((r) => r.status === "active");
}

function buildLeaderboard(
  rows: AdvisorRowOut[],
  statusFilter: string,
  sort: "listings" | "active"
) {
  const pool = leaderboardPool(rows, statusFilter);
  const key =
    sort === "active" ? "active_listings_count" : "listings_created_count";
  const sorted = [...pool].sort((a, b) => {
    const av = a[key] as number;
    const bv = b[key] as number;
    return bv - av;
  });
  return sorted.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    id: r.id,
    display_name: r.display_name,
    advisor_code: r.advisor_code,
    listings_created_count: r.listings_created_count,
    active_listings_count: r.active_listings_count,
  }));
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

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const admin = serviceAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Missing server configuration." },
        { status: 500 }
      );
    }

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const statusFilter = (req.nextUrl.searchParams.get("status") || "all").trim();
    const range = advisorRangeFromQuery(req.nextUrl.searchParams.get("range"));
    const format = (req.nextUrl.searchParams.get("format") || "").trim();
    const leaderboardSortRaw = (
      req.nextUrl.searchParams.get("leaderboard_sort") || "listings"
    ).trim();
    const leaderboardSort: "listings" | "active" =
      leaderboardSortRaw === "active" ? "active" : "listings";

    let query = (admin.from("space_advisors") as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter === "active" || statusFilter === "inactive") {
      query = query.eq("status", statusFilter);
    }

    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      query = query.or(
        `display_name.ilike.${pattern},advisor_code.ilike.${pattern},full_name.ilike.${pattern}`
      );
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows || []) as Record<string, unknown>[];
    const advisorIds = list.map((row) => String(row.id));

    let metrics: Record<string, AdvisorMetrics>;
    try {
      metrics = await computeAdvisorMetricsForIds(admin, advisorIds, range);
    } catch (me: unknown) {
      const msg = me instanceof Error ? me.message : "Metrics query failed.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const withCounts: AdvisorRowOut[] = list.map((row) => {
      const id = String(row.id);
      const m = metrics[id];
      return {
        ...row,
        linked_users_count: m.linked_users_count,
        listings_created_count: m.listings_created_count,
        active_listings_count: m.active_listings_count,
        verified_listings_count: m.verified_listings_count,
        listings_with_bookings_count: m.listings_with_bookings_count,
        total_bookings_count: m.total_bookings_count,
      };
    });

    if (format === "csv") {
      const header = [
        "advisor_code",
        "display_name",
        "status",
        "linked_users_count",
        "listings_created_count",
        "active_listings_count",
        "verified_listings_count",
        "listings_with_bookings_count",
        "total_bookings_count",
      ];
      const lines = [
        header.join(","),
        ...withCounts.map((r) =>
          [
            csvEscapeCell(String(r.advisor_code ?? "")),
            csvEscapeCell(String(r.display_name ?? "")),
            csvEscapeCell(String(r.status ?? "")),
            csvEscapeCell(r.linked_users_count),
            csvEscapeCell(r.listings_created_count),
            csvEscapeCell(r.active_listings_count),
            csvEscapeCell(r.verified_listings_count),
            csvEscapeCell(r.listings_with_bookings_count),
            csvEscapeCell(r.total_bookings_count),
          ].join(",")
        ),
      ];
      const body = lines.join("\r\n");
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="space-advisors-${range}.csv"`,
        },
      });
    }

    const leaderboard = buildLeaderboard(
      withCounts,
      statusFilter,
      leaderboardSort
    );

    return NextResponse.json({
      range,
      leaderboard_sort: leaderboardSort,
      leaderboard,
      advisors: withCounts,
    });
  } catch (e: unknown) {
    console.error("admin space-advisors GET:", e);
    return NextResponse.json(
      { error: "Could not load Space Advisors." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

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

    const full_name = String(body.full_name || "").trim();
    const display_name = String(body.display_name || "").trim();
    const codeRaw = String(body.advisor_code || "").trim();
    const advisor_code = normalizeAdvisorCode(codeRaw);
    const email = String(body.email || "").trim() || null;
    const phone = String(body.phone || "").trim() || null;
    const notes = String(body.notes || "").trim() || null;
    const status =
      body.status === "inactive" ? "inactive" : "active";

    if (!full_name || !display_name || !advisor_code) {
      return NextResponse.json(
        { error: "full_name, display_name, and advisor_code are required." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: inserted, error } = await (admin.from("space_advisors") as any)
      .insert({
        full_name,
        display_name,
        advisor_code,
        email,
        phone,
        notes,
        status,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: (inserted as { id: string }).id });
  } catch (e: unknown) {
    console.error("admin space-advisors POST:", e);
    return NextResponse.json(
      { error: "Could not create Space Advisor." },
      { status: 500 }
    );
  }
}
