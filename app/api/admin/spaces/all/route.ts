import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  adminSpaceEditHref,
  adminSpacePublicViewHref,
} from "@/lib/admin-space-visibility";
import { isValidUuid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status")?.trim() || "";
  const search = searchParams.get("search")?.trim().toLowerCase() || "";

  let query = admin
    .from("spaces")
    .select(
      "id, title, city, suburb, address_line_1, status, public_listing_mode, created_at, submitted_for_review_at, owner_id, property_id, created_by_admin, space_type, min_group_size, max_group_size"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (statusFilter === "deleted") {
    query = query.eq("status", "deleted");
  } else if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  } else {
    query = query.neq("status", "deleted");
  }

  const { data: spaces, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (spaces as Record<string, unknown>[]) || [];
  const ids = rows.map((s) => s.id as string);
  const ownerIds = [
    ...new Set(
      rows
        .map((s) => s.owner_id as string | null)
        .filter((id): id is string => isValidUuid(id))
    ),
  ];
  const propertyIds = [
    ...new Set(rows.map((s) => s.property_id as string | null).filter(Boolean)),
  ] as string[];

  const enquiryCounts: Record<string, number> = {};
  const coverImages: Record<string, string> = {};
  const owners: Record<
    string,
    { name: string | null; email: string | null }
  > = {};
  const properties: Record<string, { id: string; name: string }> = {};

  if (ids.length > 0) {
    const [{ data: enquiries }, { data: images }] = await Promise.all([
      admin.from("listing_enquiries").select("listing_id").in("listing_id", ids),
      admin
        .from("space_images")
        .select("space_id, image_url, sort_order")
        .in("space_id", ids)
        .order("sort_order", { ascending: true }),
    ]);

    for (const row of (enquiries as { listing_id: string }[]) || []) {
      enquiryCounts[row.listing_id] = (enquiryCounts[row.listing_id] || 0) + 1;
    }

    for (const row of (images as {
      space_id: string;
      image_url: string;
    }[]) || []) {
      if (!coverImages[row.space_id]) {
        coverImages[row.space_id] = row.image_url;
      }
    }
  }

  if (ownerIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name, full_name, email")
      .in("id", ownerIds);

    for (const row of (profiles as {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      full_name?: string | null;
      email?: string | null;
    }[]) || []) {
      const name =
        `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
        row.full_name ||
        null;
      owners[row.id] = { name, email: row.email || null };
    }
  }

  if (propertyIds.length > 0) {
    const { data: propertyRows } = await admin
      .from("properties")
      .select("id, name")
      .in("id", propertyIds);

    for (const row of (propertyRows as { id: string; name: string }[]) || []) {
      properties[row.id] = { id: row.id, name: row.name };
    }
  }

  let result = rows.map((space) => {
    const id = space.id as string;
    const ownerId = space.owner_id as string | null;
    const propertyId = space.property_id as string | null;
    const status = space.status as string | null;
    const publicListingMode = space.public_listing_mode as string | null;
    const property = propertyId ? properties[propertyId] : null;
    const owner = ownerId ? owners[ownerId] : null;

    const updatedAt =
      (space.submitted_for_review_at as string | null) ||
      (space.created_at as string | null);

    return {
      id,
      title: (space.title as string | null) || "Untitled space",
      city: space.city as string | null,
      suburb: space.suburb as string | null,
      address_line_1: space.address_line_1 as string | null,
      status,
      public_listing_mode: publicListingMode,
      space_type: space.space_type as string | null,
      min_group_size: space.min_group_size as number | null | undefined,
      max_group_size: space.max_group_size as number | null | undefined,
      created_at: space.created_at as string | null,
      updated_at: updatedAt,
      property_id: propertyId,
      property_name: property?.name || null,
      property_href: propertyId ? `/admin/properties/${propertyId}` : null,
      owner_id: ownerId,
      owner_name: owner?.name || null,
      owner_email: owner?.email || null,
      created_by_admin: Boolean(space.created_by_admin),
      enquiry_count: enquiryCounts[id] || 0,
      cover_image_url: coverImages[id] || null,
      edit_href: adminSpaceEditHref({
        id,
        status,
        property_id: propertyId,
      }),
      view_href: adminSpacePublicViewHref({
        id,
        status,
        public_listing_mode: publicListingMode,
      }),
    };
  });

  if (search) {
    result = result.filter((row) => {
      const haystack = [
        row.title,
        row.city,
        row.suburb,
        row.address_line_1,
        row.property_name,
        row.owner_name,
        row.owner_email,
        row.public_listing_mode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  return NextResponse.json({ spaces: result });
}
