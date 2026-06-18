import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { formatPropertyAddress, parsePropertyInput } from "@/lib/admin-property";
import { hasAiKnowledgeContent } from "@/lib/space-ai-knowledge";
import {
  buildPropertySpaceRow,
  computePropertySpacesHealth,
  computePropertySpacesSummary,
  type PropertySpaceHealthInput,
} from "@/lib/property-space-ops";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid property id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: property, error } = await admin
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const row = property as Record<string, unknown>;
  let crmOrganisation: { id: string; name: string } | null = null;
  if (row.crm_organisation_id) {
    const { data: org } = await admin
      .from("crm_organisations")
      .select("id, name")
      .eq("id", row.crm_organisation_id as string)
      .maybeSingle();
    if (org) crmOrganisation = org as { id: string; name: string };
  }

  let ownerName: string | null = null;
  if (row.owner_id) {
    const { data: ownerProfile } = await admin
      .from("profiles")
      .select("first_name, last_name, full_name, email")
      .eq("id", row.owner_id as string)
      .maybeSingle();
    if (ownerProfile) {
      const profile = ownerProfile as {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
      };
      ownerName =
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        profile.full_name ||
        profile.email ||
        null;
    }
  }

  const { data: spaces, error: spacesErr } = await admin
    .from("spaces")
    .select(
      "id, title, status, public_listing_mode, space_type, booking_unit, price_amount, price_unit, deposit_required, deposit_amount, price_per_hour, price_per_day, price_per_month, latitude, longitude, city, suburb, created_at, submitted_for_review_at, property_id"
    )
    .eq("property_id", id)
    .order("title", { ascending: true });

  if (spacesErr) {
    return NextResponse.json({ error: spacesErr.message }, { status: 500 });
  }

  const spaceRows = (spaces as Record<string, unknown>[]) || [];
  const spaceIds = spaceRows.map((space) => space.id as string);
  const coverImages: Record<string, string> = {};
  const imageCounts: Record<string, number> = {};
  const aiInfoBySpace: Record<string, boolean> = {};

  if (spaceIds.length > 0) {
    const { data: images } = await admin
      .from("space_images")
      .select("space_id, image_url, sort_order")
      .in("space_id", spaceIds)
      .order("sort_order", { ascending: true });

    for (const image of (images as {
      space_id: string;
      image_url: string;
    }[]) || []) {
      imageCounts[image.space_id] = (imageCounts[image.space_id] || 0) + 1;
      if (!coverImages[image.space_id]) {
        coverImages[image.space_id] = image.image_url;
      }
    }

    const { data: aiDocs } = await admin
      .from("space_ai_documents")
      .select("space_id, extracted_text")
      .in("space_id", spaceIds);

    for (const doc of (aiDocs as { space_id: string; extracted_text: string }[]) || []) {
      if (hasAiKnowledgeContent(doc.extracted_text)) {
        aiInfoBySpace[doc.space_id] = true;
      }
    }
  }

  const healthInputs: PropertySpaceHealthInput[] = spaceRows.map((space) => {
    const spaceId = space.id as string;
    return {
      id: spaceId,
      status: space.status as string | null,
      public_listing_mode: space.public_listing_mode as string | null,
      booking_unit: space.booking_unit as string | null,
      price_amount: space.price_amount as number | null,
      price_unit: space.price_unit as string | null,
      deposit_required: space.deposit_required as boolean | null,
      deposit_amount: space.deposit_amount as number | null,
      price_per_hour: space.price_per_hour as number | null,
      price_per_day: space.price_per_day as number | null,
      price_per_month: space.price_per_month as number | null,
      latitude: space.latitude as number | null,
      longitude: space.longitude as number | null,
      city: space.city as string | null,
      suburb: space.suburb as string | null,
      image_count: imageCounts[spaceId] || 0,
      has_ai_information: Boolean(aiInfoBySpace[spaceId]),
    };
  });

  const mappedSpaces = spaceRows.map((space) => {
    const spaceId = space.id as string;
    return buildPropertySpaceRow(
      space as Parameters<typeof buildPropertySpaceRow>[0],
      id,
      coverImages[spaceId] || null,
      imageCounts[spaceId] || 0,
      Boolean(aiInfoBySpace[spaceId])
    );
  });

  const activeSpaces = mappedSpaces.filter((space) => !space.is_archived);
  const archivedSpaces = mappedSpaces.filter((space) => space.is_archived);

  let propertyImages: {
    id: string;
    image_url: string;
    sort_order: number;
    caption: string | null;
  }[] = [];

  const { data: galleryRows, error: galleryErr } = await admin
    .from("property_images")
    .select("id, image_url, sort_order, caption")
    .eq("property_id", id)
    .order("sort_order", { ascending: true });

  if (!galleryErr && galleryRows) {
    propertyImages = (galleryRows as typeof propertyImages) || [];
  }

  let ownerStatus = "No owner";
  let inviteStatus = "Not invited";
  if (row.owner_accepted_at) {
    ownerStatus = "Owner accepted";
    inviteStatus = "Accepted";
  } else if (row.owner_invited_at) {
    ownerStatus = "Invite sent";
    inviteStatus = "Invite sent";
  } else if (row.owner_email) {
    ownerStatus = "Email on file";
    inviteStatus = "Email on file";
  } else if (row.owner_id) {
    ownerStatus = "Owner linked";
    inviteStatus = "Owner linked";
  }

  return NextResponse.json({
    property: {
      ...row,
      formatted_address: formatPropertyAddress({
        address_line1: row.address_line1 as string | null,
        suburb: row.suburb as string | null,
        city: row.city as string | null,
        province: row.province as string | null,
      }),
      owner_status: ownerStatus,
      invite_status: inviteStatus,
      owner_name: ownerName,
      crm_organisation: crmOrganisation,
    },
    summary: computePropertySpacesSummary(
      spaceRows.map((space) => ({
        status: space.status as string | null,
        public_listing_mode: space.public_listing_mode as string | null,
      }))
    ),
    health: computePropertySpacesHealth(healthInputs),
    spaces: activeSpaces,
    archived_spaces: archivedSpaces,
    property_images: propertyImages,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid property id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parsePropertyInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  if (parsed.data.crm_organisation_id) {
    const { data: org } = await admin
      .from("crm_organisations")
      .select("id")
      .eq("id", parsed.data.crm_organisation_id)
      .maybeSingle();
    if (!org) {
      return NextResponse.json({ error: "CRM organisation not found." }, { status: 400 });
    }
  }

  const { data: updated, error } = await admin
    .from("properties")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  await adminAudit({
    action: "property_updated",
    actorUserId: auth.userId,
    targetType: "property",
    targetId: id,
    meta: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ property: updated });
}
