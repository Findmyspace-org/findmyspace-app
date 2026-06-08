import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const [
    { count: draftScoutListings },
    { count: publishedUnclaimed },
    { count: claimInterests },
    { count: enquiries },
    { count: claimedListings },
    { count: activeListings },
  ] = await Promise.all([
    admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .eq("created_by_admin", true)
      .eq("status", "draft"),
    admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .eq("created_by_admin", true)
      .eq("status", "unclaimed"),
    admin.from("listing_claim_interests").select("id", { count: "exact", head: true }),
    admin.from("listing_enquiries").select("id", { count: "exact", head: true }),
    admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .eq("created_by_admin", true)
      .eq("status", "owner_claimed"),
    admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .eq("created_by_admin", true)
      .eq("status", "active"),
  ]);

  return NextResponse.json({
    draftScoutListings: draftScoutListings ?? 0,
    publishedUnclaimed: publishedUnclaimed ?? 0,
    claimInterests: claimInterests ?? 0,
    enquiries: enquiries ?? 0,
    claimedListings: claimedListings ?? 0,
    activeListings: activeListings ?? 0,
  });
}
