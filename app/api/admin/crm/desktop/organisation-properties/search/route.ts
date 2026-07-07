import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { adminListingStatusLabel } from "@/lib/admin-listing-status-display";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit") || "25"), 1),
    50
  );

  let query = auth.adminClient
    .from("properties")
    .select(
      "id, name, city, suburb, address_line1, owner_id, owner_email, owner_accepted_at, crm_organisation_id, created_at"
    )
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(limit);

  if (q) {
    const escaped = q.replace(/[%_,]/g, "");
    query = query.or(
      [
        `name.ilike.%${escaped}%`,
        `city.ilike.%${escaped}%`,
        `suburb.ilike.%${escaped}%`,
        `address_line1.ilike.%${escaped}%`,
        `owner_email.ilike.%${escaped}%`,
      ].join(",")
    );
  }

  const { data: properties, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (properties || []) as {
    id: string;
    name: string;
    city: string | null;
    suburb: string | null;
    address_line1: string | null;
    owner_id: string | null;
    owner_email: string | null;
    owner_accepted_at: string | null;
    crm_organisation_id: string | null;
    created_at: string;
  }[];

  const propertyIds = rows.map((row) => row.id);
  const orgIds = [
    ...new Set(
      rows
        .map((row) => row.crm_organisation_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const ownerIds = [
    ...new Set(
      rows.map((row) => row.owner_id).filter((id): id is string => Boolean(id))
    ),
  ];

  const [spaceCounts, orgNames, ownerNames] = await Promise.all([
    propertyIds.length
      ? auth.adminClient
          .from("spaces")
          .select("id, property_id, status, title")
          .in("property_id", propertyIds)
          .neq("status", "deleted")
      : Promise.resolve({ data: [], error: null }),
    orgIds.length
      ? auth.adminClient.from("crm_organisations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? auth.adminClient.from("profiles").select("id, full_name").in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const spaceCountByProperty = new Map<string, number>();
  const listingStatusByProperty = new Map<string, string>();
  for (const space of (spaceCounts.data || []) as {
    property_id: string;
    status: string | null;
  }[]) {
    spaceCountByProperty.set(
      space.property_id,
      (spaceCountByProperty.get(space.property_id) || 0) + 1
    );
    if (!listingStatusByProperty.has(space.property_id) && space.status) {
      listingStatusByProperty.set(
        space.property_id,
        adminListingStatusLabel(space.status)
      );
    }
  }

  const orgNameById = new Map(
    ((orgNames.data || []) as { id: string; name: string }[]).map((org) => [
      org.id,
      org.name,
    ])
  );
  const ownerNameById = new Map(
    ((ownerNames.data || []) as { id: string; full_name: string | null }[]).map(
      (profile) => [profile.id, profile.full_name]
    )
  );

  const filteredRows = rows;

  return NextResponse.json({
    properties: filteredRows.map((row) => ({
      id: row.id,
      name: row.name,
      address: [row.address_line1, row.suburb, row.city]
        .filter(Boolean)
        .join(", "),
      city: row.city,
      suburb: row.suburb,
      owner_name:
        (row.owner_id ? ownerNameById.get(row.owner_id) : null) ||
        row.owner_email ||
        "No owner",
      owner_status: row.owner_accepted_at
        ? "Owner accepted"
        : row.owner_email
          ? "Invited"
          : "No owner",
      space_count: spaceCountByProperty.get(row.id) || 0,
      listing_status: listingStatusByProperty.get(row.id) || "No listings",
      crm_organisation_id: row.crm_organisation_id,
      crm_organisation_name: row.crm_organisation_id
        ? orgNameById.get(row.crm_organisation_id) || null
        : null,
      is_linked: Boolean(row.crm_organisation_id),
      admin_url: `/admin/properties/${row.id}`,
    })),
  });
}
