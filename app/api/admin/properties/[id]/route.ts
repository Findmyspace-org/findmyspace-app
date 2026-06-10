import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { formatPropertyAddress, parsePropertyInput } from "@/lib/admin-property";
import { adminListingStatusLabel } from "@/lib/admin-listing-status-display";

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

  const { data: spaces, error: spacesErr } = await admin
    .from("spaces")
    .select("id, title, status, space_type, city, suburb, created_at")
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
    created_at: string;
  }[]).map((space) => ({
    ...space,
    status_label: adminListingStatusLabel(space.status),
    admin_edit_url: `/admin/unclaimed-listings/${space.id}/edit`,
  }));

  let ownerStatus = "No owner";
  if (row.owner_accepted_at) ownerStatus = "Owner accepted";
  else if (row.owner_invited_at) ownerStatus = "Invite sent";
  else if (row.owner_email) ownerStatus = "Email on file";

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
      crm_organisation: crmOrganisation,
    },
    spaces: spaceRows,
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
