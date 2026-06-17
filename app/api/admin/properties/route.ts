import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { buildPropertyRow, parsePropertyInput } from "@/lib/admin-property";
export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: properties, error } = await admin
    .from("properties")
    .select(
      "id, name, city, suburb, owner_id, owner_email, owner_invited_at, owner_accepted_at, crm_organisation_id, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (properties as Record<string, unknown>[]) || [];
  const orgIds = [
    ...new Set(
      rows
        .map((r) => r.crm_organisation_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await admin
      .from("crm_organisations")
      .select("id, name")
      .in("id", orgIds);
    for (const org of (orgs as { id: string; name: string }[]) || []) {
      orgNameById.set(org.id, org.name);
    }
  }

  const propertyIds = rows.map((r) => r.id as string);
  const spaceCountByProperty = new Map<string, number>();
  const spacesByProperty = new Map<string, string[]>();
  const coverImageByProperty = new Map<string, string>();

  if (propertyIds.length > 0) {
    const [{ data: spaces }, { data: propertyImages }] = await Promise.all([
      admin.from("spaces").select("id, property_id").in("property_id", propertyIds),
      admin
        .from("property_images")
        .select("property_id, image_url, sort_order")
        .in("property_id", propertyIds)
        .order("sort_order", { ascending: true }),
    ]);

    for (const space of (spaces as { id: string; property_id: string }[]) || []) {
      spaceCountByProperty.set(
        space.property_id,
        (spaceCountByProperty.get(space.property_id) || 0) + 1
      );
      const list = spacesByProperty.get(space.property_id) || [];
      list.push(space.id);
      spacesByProperty.set(space.property_id, list);
    }

    for (const row of (propertyImages as {
      property_id: string;
      image_url: string;
    }[]) || []) {
      if (!coverImageByProperty.has(row.property_id)) {
        coverImageByProperty.set(row.property_id, row.image_url);
      }
    }

    // TODO: add a dedicated properties.cover_image_url once property galleries are
    // always populated; until then fall back to the first linked space image.
    const missingPropertyIds = propertyIds.filter((id) => !coverImageByProperty.has(id));
    const fallbackSpaceIds = missingPropertyIds.flatMap(
      (id) => spacesByProperty.get(id) || []
    );

    if (fallbackSpaceIds.length > 0) {
      const { data: spaceImages } = await admin
        .from("space_images")
        .select("space_id, image_url, sort_order")
        .in("space_id", fallbackSpaceIds)
        .order("sort_order", { ascending: true });

      const imageBySpace = new Map<string, string>();
      for (const row of (spaceImages as { space_id: string; image_url: string }[]) || []) {
        if (!imageBySpace.has(row.space_id)) {
          imageBySpace.set(row.space_id, row.image_url);
        }
      }

      for (const propertyId of missingPropertyIds) {
        for (const spaceId of spacesByProperty.get(propertyId) || []) {
          const url = imageBySpace.get(spaceId);
          if (url) {
            coverImageByProperty.set(propertyId, url);
            break;
          }
        }
      }
    }
  }

  const list = rows.map((row) => {
    const ownerAccepted = Boolean(row.owner_accepted_at);
    const ownerInvited = Boolean(row.owner_invited_at);
    let ownerStatus = "No owner";
    if (ownerAccepted) ownerStatus = "Owner accepted";
    else if (ownerInvited) ownerStatus = "Invite sent";
    else if (row.owner_email) ownerStatus = "Email on file";

    return {
      ...row,
      space_count: spaceCountByProperty.get(row.id as string) || 0,
      cover_image_url: coverImageByProperty.get(row.id as string) || null,
      crm_organisation_name: row.crm_organisation_id
        ? orgNameById.get(row.crm_organisation_id as string) || null
        : null,
      owner_status: ownerStatus,
    };
  });

  return NextResponse.json({ properties: list });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parsePropertyInput(body, { requireName: true });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
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

  const row = buildPropertyRow(parsed.data, auth.userId);
  const { data: inserted, error } = await admin
    .from("properties")
    .insert(row)
    .select("*")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message || "Could not create property." },
      { status: 500 }
    );
  }

  await adminAudit({
    action: "property_created",
    actorUserId: auth.userId,
    targetType: "property",
    targetId: (inserted as { id: string }).id,
    meta: { name: (inserted as { name: string }).name },
  });

  return NextResponse.json({ property: inserted });
}
