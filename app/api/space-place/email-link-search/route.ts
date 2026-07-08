import { NextRequest, NextResponse } from "next/server";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";

export const runtime = "nodejs";

/** Quote an ilike pattern for PostgREST .or() filters (handles @ . etc). */
function quoteIlike(pattern: string): string {
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Lightweight contact / organisation search for manual email linking.
 * Flat results only — no ambiguous nested embeds.
 *
 * Contacts ↔ organisations have two FKs (organisation_id and
 * primary_contact_id), so embeds must name
 * `crm_contacts_organisation_id_fkey` explicitly.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") || "contacts").trim();
  const q = (sp.get("q") || "").trim();
  const limit = Math.min(30, Math.max(1, Number(sp.get("limit") || "20") || 20));

  if (q.length < 2) {
    return NextResponse.json({
      ok: true,
      rows: [],
      total: 0,
      hint: "Type at least 2 characters to search.",
    });
  }

  const pattern = `%${q}%`;

  if (type === "organisations") {
    const { data, error, count } = await auth.adminClient
      .from("crm_organisations")
      .select("id, name, type", { count: "exact" })
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
      rows: ((data || []) as { id: string; name: string; type: string | null }[]).map(
        (o) => ({
          id: o.id,
          name: o.name,
          type: o.type,
        })
      ),
      total: count ?? (data || []).length,
    });
  }

  // Load contacts without ambiguous embed, then resolve org names in a second query.
  const { data, error, count } = await auth.adminClient
    .from("crm_contacts")
    .select("id, full_name, email, role, organisation_id", { count: "exact" })
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

  const contacts = (data || []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    organisation_id: string;
  }[];

  const orgIds = [...new Set(contacts.map((c) => c.organisation_id).filter(Boolean))];
  const orgNameById = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs, error: orgErr } = await auth.adminClient
      .from("crm_organisations")
      .select("id, name")
      .in("id", orgIds);
    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 });
    }
    for (const o of (orgs || []) as { id: string; name: string }[]) {
      orgNameById.set(o.id, o.name);
    }
  }

  const rows = contacts.map((c) => ({
    id: c.id,
    name: c.full_name || "Unnamed contact",
    full_name: c.full_name || "Unnamed contact",
    email: c.email,
    role: c.role,
    organisation_id: c.organisation_id,
    organisation_name: orgNameById.get(c.organisation_id) || "Organisation",
  }));

  return NextResponse.json({
    ok: true,
    rows,
    total: count ?? rows.length,
  });
}
