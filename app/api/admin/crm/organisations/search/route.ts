import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (id && UUID_RE.test(id)) {
    const { data: row, error } = await admin
      .from("crm_organisations")
      .select("id, name, website, address, pipeline_stage")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ organisations: row ? [row] : [] });
  }

  if (q.length < 2) {
    return NextResponse.json({ organisations: [] });
  }

  const pattern = `%${q.replace(/%/g, "\\%")}%`;
  const { data, error } = await admin
    .from("crm_organisations")
    .select("id, name, website, address, pipeline_stage")
    .or(`name.ilike.${pattern},website.ilike.${pattern}`)
    .order("name")
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ organisations: data || [] });
}
