import { NextRequest, NextResponse } from "next/server";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";
import { normalizeEmailAddress } from "@/lib/space-place/crm-email";
import { suggestContactsForEmail } from "@/lib/space-place/crm-email-rematch";

export const runtime = "nodejs";

/** Quote an ilike pattern for PostgREST .or() filters (handles @ . etc). */
function quoteIlike(pattern: string): string {
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Lightweight contact / organisation search for email linking.
 * Uses requireCrmEmailManagerApi (admin + office_manager), not desktop-admin-only gate.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") || "contacts").trim();
  const q = (sp.get("q") || "").trim();
  const emailId = (sp.get("emailId") || "").trim();
  const limit = Math.min(30, Math.max(1, Number(sp.get("limit") || "20") || 20));

  if (type === "suggestions" && emailId) {
    const result = await suggestContactsForEmail(auth.adminClient, emailId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      recipients: result.recipients,
      suggestions: result.suggestions,
    });
  }

  if (q.length < 2) {
    return NextResponse.json({
      ok: true,
      rows: [],
      total: 0,
      hint: "Start typing a name or email (at least 2 characters).",
    });
  }

  const pattern = `%${q}%`;

  if (type === "organisations") {
    const { data, error, count } = await auth.adminClient
      .from("crm_organisations")
      .select("id, name, type, pipeline_stage", { count: "exact" })
      .neq("status", "archived")
      .or(
        `name.ilike.${quoteIlike(pattern)},type.ilike.${quoteIlike(pattern)},address.ilike.${quoteIlike(pattern)}`
      )
      .order("name")
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      rows: (data || []).map((o) => ({
        id: (o as { id: string }).id,
        name: (o as { name: string }).name,
        type: (o as { type: string | null }).type,
        pipeline_stage: (o as { pipeline_stage: string }).pipeline_stage,
      })),
      total: count ?? (data || []).length,
    });
  }

  const { data, error, count } = await auth.adminClient
    .from("crm_contacts")
    .select(
      `id, full_name, email, role, organisation_id,
       crm_organisations ( id, name )`,
      { count: "exact" }
    )
    .or(
      [
        `full_name.ilike.${quoteIlike(pattern)}`,
        `first_name.ilike.${quoteIlike(pattern)}`,
        `last_name.ilike.${quoteIlike(pattern)}`,
        `email.ilike.${quoteIlike(pattern)}`,
        `phone.ilike.${quoteIlike(pattern)}`,
        `role.ilike.${quoteIlike(pattern)}`,
      ].join(",")
    )
    .order("full_name")
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const needle = normalizeEmailAddress(q);
  type ContactSearchRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    organisation_id: string;
    crm_organisations?:
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
  };

  const rows = ((data || []) as unknown as ContactSearchRow[]).map((c) => {
    const org = Array.isArray(c.crm_organisations)
      ? c.crm_organisations[0]
      : c.crm_organisations;
    return {
      id: c.id,
      full_name: c.full_name || "Unnamed contact",
      email: c.email,
      role: c.role,
      organisation_id: c.organisation_id,
      organisation_name: org?.name || "Organisation",
    };
  });

  rows.sort((a, b) => {
    const aExact = needle && normalizeEmailAddress(a.email) === needle ? 0 : 1;
    const bExact = needle && normalizeEmailAddress(b.email) === needle ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.full_name.localeCompare(b.full_name);
  });

  return NextResponse.json({
    ok: true,
    rows,
    total: count ?? rows.length,
  });
}
