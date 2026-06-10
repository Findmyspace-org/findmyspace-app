import { NextRequest, NextResponse } from "next/server";
import { requireOwnerPropertyApi } from "@/lib/require-owner-property-api";
import { formatPropertyAddress } from "@/lib/admin-property";
import { getOwnerListingStatusLabel } from "@/lib/listing-lifecycle";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwnerPropertyApi(req, id);
  if ("response" in auth) return auth.response;

  const { data: property, error } = await auth.admin
    .from("properties")
    .select("id, name, description, address_line1, suburb, city, province, postal_code, country, owner_accepted_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const row = property as Record<string, unknown>;

  const { data: spaces, error: spacesErr } = await auth.admin
    .from("spaces")
    .select("id, title, status, space_type, city, suburb")
    .eq("property_id", id)
    .order("title", { ascending: true });

  if (spacesErr) {
    return NextResponse.json({ error: spacesErr.message }, { status: 500 });
  }

  const spaceRows = ((spaces || []) as {
    id: string;
    title: string | null;
    status: string | null;
    space_type: string | null;
    city: string | null;
    suburb: string | null;
  }[]).map((space) => ({
    ...space,
    status_label: getOwnerListingStatusLabel(space.status),
  }));

  return NextResponse.json({
    property: {
      ...row,
      formatted_address: formatPropertyAddress({
        address_line1: row.address_line1 as string | null,
        suburb: row.suburb as string | null,
        city: row.city as string | null,
        province: row.province as string | null,
      }),
    },
    spaces: spaceRows,
  });
}
