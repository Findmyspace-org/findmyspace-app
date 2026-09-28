import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { searchCommercialScopes } from "@/lib/commercial-terms-server";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const kind = req.nextUrl.searchParams.get("kind");
  const query = req.nextUrl.searchParams.get("q") || "";
  if (
    kind !== "organisation" &&
    kind !== "property" &&
    kind !== "space"
  ) {
    return NextResponse.json(
      { error: "kind must be organisation, property, or space." },
      { status: 400 }
    );
  }

  try {
    const items = await searchCommercialScopes(admin, { kind, query });
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not search.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
