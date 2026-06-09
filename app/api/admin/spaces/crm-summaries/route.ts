import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { fetchSpaceCrmLinkSummary } from "@/lib/space-crm-link";

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  let body: { space_ids?: string[] } = {};
  try {
    body = ((await req.json()) as typeof body) || {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ids = Array.from(
    new Set((body.space_ids || []).filter((id) => typeof id === "string" && id.trim()))
  );
  if (ids.length === 0) {
    return NextResponse.json({ summaries: {} });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("spaces")
    .select("id, crm_organisation_id, crm_contact_id")
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summaries: Record<string, Awaited<ReturnType<typeof fetchSpaceCrmLinkSummary>>> =
    {};

  for (const row of (data as {
    id: string;
    crm_organisation_id?: string | null;
    crm_contact_id?: string | null;
  }[]) || []) {
    if (!row.crm_organisation_id && !row.crm_contact_id) continue;
    summaries[row.id] = await fetchSpaceCrmLinkSummary(admin, row);
  }

  return NextResponse.json({ summaries });
}
