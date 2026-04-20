import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    const sp = req.nextUrl.searchParams;
    const limitRaw = parseInt(sp.get("limit") || "100", 10);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));
    const actionFilter = (sp.get("action") || "").trim();
    const targetTypeFilter = (sp.get("targetType") || "").trim();
    const adminUserIdFilter = (sp.get("adminUserId") || "").trim();
    const q = (sp.get("q") || "").trim();

    let query = (admin.from("admin_audit_log") as any)
      .select(
        "id, created_at, admin_user_id, action, target_type, target_id, reason, meta"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (actionFilter) {
      query = query.eq("action", actionFilter);
    }
    if (targetTypeFilter) {
      query = query.eq("target_type", targetTypeFilter);
    }
    if (adminUserIdFilter && UUID_RE.test(adminUserIdFilter)) {
      query = query.eq("admin_user_id", adminUserIdFilter);
    }
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      query = query.or(
        `target_id.ilike.${pattern},reason.ilike.${pattern},action.ilike.${pattern}`
      );
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const list = (rows || []) as {
      id: string;
      created_at: string;
      admin_user_id: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      reason: string | null;
      meta: unknown;
    }[];

    const adminIds = Array.from(new Set(list.map((r) => r.admin_user_id)));
    let profileMap = new Map<
      string,
      { email: string | null; first_name: string | null; last_name: string | null }
    >();

    if (adminIds.length > 0) {
      const { data: profs } = await (admin.from("profiles") as any)
        .select("id, email, first_name, last_name")
        .in("id", adminIds);

      for (const p of (profs || []) as {
        id: string;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
      }[]) {
        profileMap.set(p.id, {
          email: p.email,
          first_name: p.first_name,
          last_name: p.last_name,
        });
      }
    }

    const entries = list.map((r) => {
      const prof = profileMap.get(r.admin_user_id);
      const joined = `${prof?.first_name || ""} ${prof?.last_name || ""}`.trim();
      const adminLabel =
        joined || prof?.email || r.admin_user_id.slice(0, 8) + "…";
      return {
        ...r,
        adminEmail: prof?.email ?? null,
        adminLabel,
      };
    });

    return NextResponse.json({ entries });
  } catch (e: unknown) {
    console.error("admin activity GET:", e);
    return NextResponse.json(
      { error: "Could not load activity." },
      { status: 500 }
    );
  }
}
