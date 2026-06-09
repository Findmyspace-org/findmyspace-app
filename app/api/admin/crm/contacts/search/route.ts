import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { contactDisplayName } from "@/lib/space-crm-link";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const organisationId = (req.nextUrl.searchParams.get("organisationId") || "").trim();

  if (!organisationId) {
    return NextResponse.json(
      { error: "organisationId is required." },
      { status: 400 }
    );
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let query = admin
    .from("crm_contacts")
    .select("id, organisation_id, full_name, first_name, last_name, email, phone, role")
    .eq("organisation_id", organisationId)
    .order("full_name")
    .limit(20);

  if (q.length >= 1) {
    const pattern = `%${q.replace(/%/g, "\\%")}%`;
    query = query.or(
      `full_name.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const contacts = ((data || []) as {
    id: string;
    organisation_id: string;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  }[]).map((row) => ({
    ...row,
    display_name: contactDisplayName(row),
  }));

  return NextResponse.json({ contacts });
}
