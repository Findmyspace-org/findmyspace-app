import { NextRequest, NextResponse } from "next/server";
import {
  listManagedSpaceIdsForHostingContext,
  resolveRequestHostingContext,
} from "@/lib/access/hosting-context";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const requestedOrganisationId = req.nextUrl.searchParams.get(
    ORGANISATION_QUERY_PARAM
  );
  const { summary, context } = await resolveRequestHostingContext(
    auth.admin,
    auth.userId,
    requestedOrganisationId
  );
  const spaceIds = await listManagedSpaceIdsForHostingContext(
    auth.admin,
    auth.userId,
    context,
    { isGlobalAdmin: summary.isGlobalAdmin }
  );
  if (spaceIds.length === 0) {
    return NextResponse.json({ spaces: [] });
  }

  const { data, error } = await auth.admin
    .from("spaces")
    .select(
      "id, title, description, city, suburb, address_line_1, space_type, booking_unit, price_amount, price_unit, price_per_hour, price_per_day, price_per_month, min_group_size, max_group_size, status, public_listing_mode, created_at, ownership_proof_status, deposit_type, deposit_months, monthly_payment_day, property_id, owner_id"
    )
    .in("id", spaceIds)
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const spaces = (data || []) as Array<{
    id: string;
    property_id: string | null;
    owner_id: string | null;
    status: string | null;
  }>;
  const visible = spaces.filter((space) => (space.status || "pending") !== "deleted");
  const propertyIds = [
    ...new Set(
      visible
        .map((space) => space.property_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const visibleIds = visible.map((space) => space.id);

  const propertyNameById = new Map<string, string>();
  const organisationIdByProperty = new Map<string, string | null>();
  if (propertyIds.length > 0) {
    const { data: properties } = await auth.admin
      .from("properties")
      .select("id, name, organisation_id")
      .in("id", propertyIds);
    for (const row of (properties || []) as Array<{
      id: string;
      name: string;
      organisation_id: string | null;
    }>) {
      propertyNameById.set(row.id, row.name);
      organisationIdByProperty.set(row.id, row.organisation_id);
    }
  }

  const coverBySpace = new Map<string, string>();
  if (visibleIds.length > 0) {
    const { data: images } = await auth.admin
      .from("space_images")
      .select("space_id, image_url, sort_order")
      .in("space_id", visibleIds)
      .order("sort_order", { ascending: true });
    for (const image of (images || []) as Array<{
      space_id: string;
      image_url: string;
    }>) {
      if (!coverBySpace.has(image.space_id)) {
        coverBySpace.set(image.space_id, image.image_url);
      }
    }
  }

  return NextResponse.json({
    spaces: visible.map((space) => ({
      ...space,
      property_name: space.property_id
        ? propertyNameById.get(space.property_id) || null
        : null,
      organisation_id: space.property_id
        ? organisationIdByProperty.get(space.property_id) || null
        : null,
      cover_image_url: coverBySpace.get(space.id) || null,
    })),
  });
}
