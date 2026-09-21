import { NextRequest, NextResponse } from "next/server";
import { formatPropertyAddress } from "@/lib/admin-property";
import { listManagedPropertyIds } from "@/lib/access/list-managed-properties";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { isArchivedProperty } from "@/lib/property-archive";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const propertyIds = await listManagedPropertyIds(auth.admin, auth.userId);
  if (propertyIds.length === 0) {
    return NextResponse.json({ properties: [] });
  }

  const { data, error } = await auth.admin
    .from("properties")
    .select(
      "id, name, city, suburb, address_line1, province, owner_accepted_at, created_at, archived_at"
    )
    .in("id", propertyIds)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (
    (data || []) as Array<{
      id: string;
      name: string;
      city: string | null;
      suburb: string | null;
      address_line1: string | null;
      province: string | null;
      owner_accepted_at: string | null;
      created_at: string | null;
      archived_at?: string | null;
    }>
  ).filter((row) => !isArchivedProperty(row));

  const visibleIds = rows.map((row) => row.id);
  const spaceCountByProperty = new Map<string, number>();
  if (visibleIds.length > 0) {
    const { data: spaces } = await auth.admin
      .from("spaces")
      .select("property_id")
      .in("property_id", visibleIds)
      .neq("status", "deleted");
    for (const space of (spaces as { property_id: string }[]) || []) {
      spaceCountByProperty.set(
        space.property_id,
        (spaceCountByProperty.get(space.property_id) || 0) + 1
      );
    }
  }

  return NextResponse.json({
    properties: rows.map((row) => ({
      id: row.id,
      name: row.name,
      formatted_address: formatPropertyAddress({
        address_line1: row.address_line1,
        suburb: row.suburb,
        city: row.city,
        province: row.province,
      }),
      space_count: spaceCountByProperty.get(row.id) || 0,
      owner_accepted_at: row.owner_accepted_at,
      created_at: row.created_at,
    })),
  });
}
