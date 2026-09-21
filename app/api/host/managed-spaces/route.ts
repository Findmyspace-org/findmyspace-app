import { NextRequest, NextResponse } from "next/server";
import { listManagedSpaceIds } from "@/lib/access/list-managed-spaces";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const spaceIds = await listManagedSpaceIds(auth.admin, auth.userId);
  if (spaceIds.length === 0) {
    return NextResponse.json({ spaces: [] });
  }

  const { data, error } = await auth.admin
    .from("spaces")
    .select("id, title, city, suburb, status, booking_unit, public_listing_mode, owner_id")
    .in("id", spaceIds)
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ spaces: data || [] });
}
