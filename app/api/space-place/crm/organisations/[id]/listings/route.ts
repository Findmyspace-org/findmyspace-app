import { NextRequest, NextResponse } from "next/server";
import { requireCrmApi } from "@/lib/require-crm-api";
import { adminListingStatusLabel } from "@/lib/admin-listing-status-display";
import { adminCanonicalSpaceEditHref } from "@/lib/admin-listing-routing";

const LISTING_STATUSES = [
  "draft",
  "unclaimed",
  "owner_claimed",
  "pending_verification",
  "needs_changes",
  "approved",
  "pending",
  "active",
  "paused",
  "rejected",
] as const;

function formatAddress(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ") || "Location TBC";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth.response;

  const { id: organisationId } = await params;
  const { adminClient } = auth;

  const { data: org, error: orgErr } = await adminClient
    .from("crm_organisations")
    .select("id, name")
    .eq("id", organisationId)
    .maybeSingle();

  if (orgErr || !org) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  }

  const { data: properties, error: propertiesErr } = await adminClient
    .from("properties")
    .select(
      "id, name, city, suburb, address_line1, owner_id, owner_email, owner_accepted_at, created_at, archived_at"
    )
    .eq("crm_organisation_id", organisationId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (propertiesErr) {
    return NextResponse.json({ error: propertiesErr.message }, { status: 500 });
  }

  const propertyRows = (properties || []) as {
    id: string;
    name: string;
    city: string | null;
    suburb: string | null;
    address_line1: string | null;
    owner_id: string | null;
    owner_email: string | null;
    owner_accepted_at: string | null;
    created_at: string;
  }[];

  const propertyIds = propertyRows.map((row) => row.id);
  const ownerIds = [
    ...new Set(
      propertyRows
        .map((row) => row.owner_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [{ data: directSpaces, error: directErr }, { data: propertySpaces }] =
    await Promise.all([
      adminClient
        .from("spaces")
        .select(
          "id, title, status, city, suburb, space_type, created_at, crm_organisation_id, crm_contact_id, property_id, is_bookable"
        )
        .eq("crm_organisation_id", organisationId)
        .in("status", [...LISTING_STATUSES])
        .order("created_at", { ascending: false }),
      propertyIds.length
        ? adminClient
            .from("spaces")
            .select(
              "id, title, status, city, suburb, space_type, created_at, crm_organisation_id, crm_contact_id, property_id, is_bookable"
            )
            .in("property_id", propertyIds)
            .in("status", [...LISTING_STATUSES])
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (directErr) {
    return NextResponse.json({ error: directErr.message }, { status: 500 });
  }

  const ownerNameById = new Map<string, string | null>();
  if (ownerIds.length) {
    const { data: owners } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);
    for (const owner of (owners || []) as {
      id: string;
      full_name: string | null;
    }[]) {
      ownerNameById.set(owner.id, owner.full_name);
    }
  }

  const propertyNameById = new Map(
    propertyRows.map((row) => [row.id, row.name])
  );

  const spaceCountByProperty = new Map<string, number>();
  for (const space of (propertySpaces || []) as { property_id: string | null }[]) {
    if (!space.property_id) continue;
    spaceCountByProperty.set(
      space.property_id,
      (spaceCountByProperty.get(space.property_id) || 0) + 1
    );
  }

  const propertyPayload = propertyRows.map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    suburb: row.suburb,
    address: formatAddress([row.address_line1, row.suburb, row.city]),
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
    admin_url: `/admin/properties/${row.id}`,
  }));

  const listingMap = new Map<string, Record<string, unknown>>();
  const allSpaces = [
    ...((directSpaces || []) as Record<string, unknown>[]),
    ...((propertySpaces || []) as Record<string, unknown>[]),
  ];

  for (const row of allSpaces) {
    const id = row.id as string;
    if (listingMap.has(id)) continue;
    const propertyId = row.property_id as string | null;
    listingMap.set(id, {
      id,
      title: row.title as string | null,
      status: row.status as string | null,
      city: row.city as string | null,
      suburb: row.suburb as string | null,
      space_type: row.space_type as string | null,
      created_at: row.created_at as string,
      property_id: propertyId,
      property_name: propertyId ? propertyNameById.get(propertyId) || null : null,
      is_bookable: row.is_bookable as boolean | null,
      status_label: adminListingStatusLabel(row.status as string | null),
      admin_edit_url: propertyId
        ? `/admin/properties/${propertyId}/spaces/${id}/edit`
        : adminCanonicalSpaceEditHref(id, {
            returnTo: "/admin/unclaimed-listings",
          }),
      public_url:
        row.status === "unclaimed" || row.status === "active"
          ? `/spaces/${id}`
          : null,
      linked_via:
        row.crm_organisation_id === organisationId
          ? row.crm_contact_id
            ? "contact"
            : propertyId
              ? "property"
              : "organisation"
          : "property",
    });
  }

  const listings = [...listingMap.values()];

  return NextResponse.json({
    organisation: org,
    listings,
    properties: propertyPayload,
    counts: {
      linkedPropertyCount: propertyPayload.length,
      linkedSpaceCount: listings.length,
      hasLinkedProperties: propertyPayload.length > 0,
      hasLinkedSpaces: listings.length > 0,
    },
  });
}
