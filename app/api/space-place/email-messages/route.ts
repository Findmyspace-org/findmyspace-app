import { NextRequest, NextResponse } from "next/server";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";

export const runtime = "nodejs";

/**
 * List CRM emails with optional unlinked filter for the desktop Communication workspace.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  const unlinkedOnly = sp.get("unlinked") === "1" || sp.get("filter") === "unlinked";
  const q = (sp.get("q") || "").trim().toLowerCase();
  const from = sp.get("from") || undefined;
  const to = sp.get("to") || undefined;
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") || "50") || 50));
  const fromIdx = (page - 1) * pageSize;

  let query = auth.adminClient
    .from("crm_email_messages")
    .select(
      `id, subject, from_email, to_emails, cc_emails, bcc_emails, direction,
       sent_at, imported_at, organisation_id, contact_id, engagement_id,
       body_text, body_html, linked_at, linked_by,
       crm_contacts ( id, full_name, email ),
       crm_organisations ( id, name )`,
      { count: "exact" }
    )
    .order("sent_at", { ascending: false, nullsFirst: false });

  if (unlinkedOnly) {
    // Unlinked = no contact AND no organisation (org-only links leave unlinked list)
    query = query.is("contact_id", null).is("organisation_id", null);
  }
  if (from) query = query.gte("sent_at", from);
  if (to) query = query.lte("sent_at", to);

  const { data, error, count } = await query.range(fromIdx, fromIdx + pageSize - 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = (data || []) as Record<string, unknown>[];
  if (q) {
    rows = rows.filter((row) => {
      const hay = [
        row.subject,
        row.from_email,
        ...((row.to_emails as string[]) || []),
        ...((row.cc_emails as string[]) || []),
        row.body_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return NextResponse.json({
    ok: true,
    rows,
    total: q ? rows.length : count ?? rows.length,
    page,
    pageSize,
  });
}
