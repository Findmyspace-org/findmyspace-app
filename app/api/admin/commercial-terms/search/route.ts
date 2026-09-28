import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  decorateCommercialSearchHits,
  searchCommercialScopes,
} from "@/lib/commercial-terms-server";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const kindRaw = req.nextUrl.searchParams.get("kind") || "all";
  const query = req.nextUrl.searchParams.get("q") || "";
  if (
    kindRaw !== "all" &&
    kindRaw !== "organisation" &&
    kindRaw !== "property" &&
    kindRaw !== "space"
  ) {
    return NextResponse.json(
      { error: "kind must be all, organisation, property, or space." },
      { status: 400 }
    );
  }

  try {
    const hits = await searchCommercialScopes(admin, { kind: kindRaw, query });
    const items = await decorateCommercialSearchHits(admin, hits);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not search.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
