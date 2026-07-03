import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  applyUnclaimedSpaceUpdatePatch,
  createServiceAdminClient,
  fetchAdminEditableSpace,
  parseUnclaimedSpaceInput,
  syncSpaceAttributes,
} from "@/lib/admin-unclaimed-space";
import {
  fetchSpaceCrmLinkSummary,
  validateSpaceCrmLink,
} from "@/lib/space-crm-link";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadManagePayload(admin: ReturnType<typeof createServiceAdminClient>, spaceId: string) {
  if (!admin) {
    return { error: "Server configuration error.", status: 500 as const };
  }

  const result = await fetchAdminEditableSpace(admin, spaceId);
  if (result.error || !result.space) {
    return { error: result.error || "Not found.", status: 404 as const };
  }

  const space = result.space;

  const [
    { data: images },
    { data: attributes },
    { count: enquiryCount },
    { count: claimInterestCount },
    { data: property },
  ] = await Promise.all([
    admin
      .from("space_images")
      .select("id, image_url, file_path, sort_order")
      .eq("space_id", spaceId)
      .order("sort_order", { ascending: true }),
    admin
      .from("space_attributes")
      .select("attribute_key, attribute_value")
      .eq("space_id", spaceId),
    admin
      .from("listing_enquiries")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", spaceId),
    admin
      .from("listing_claim_interests")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", spaceId),
    (space as { property_id?: string | null }).property_id
      ? admin
          .from("properties")
          .select("id, name")
          .eq("id", (space as { property_id: string }).property_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const grouped: Record<string, string[]> = {};
  for (const row of (attributes as { attribute_key: string; attribute_value: string }[]) ||
    []) {
    if (!grouped[row.attribute_key]) grouped[row.attribute_key] = [];
    grouped[row.attribute_key].push(row.attribute_value);
  }

  return {
    space,
    readOnly: result.readOnly ?? false,
    images: images || [],
    attributes: grouped,
    enquiry_count: enquiryCount ?? 0,
    claim_interest_count: claimInterestCount ?? 0,
    property: property
      ? { id: (property as { id: string }).id, name: (property as { name: string }).name }
      : null,
    crm_link: await fetchSpaceCrmLinkSummary(
      admin,
      space as { crm_organisation_id?: string | null; crm_contact_id?: string | null }
    ),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid space id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  const payload = await loadManagePayload(admin, id);
  if ("error" in payload && "status" in payload) {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }

  return NextResponse.json(payload);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id: spaceId } = await params;
  if (!UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: "Invalid space id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const existing = await fetchAdminEditableSpace(admin, spaceId);
  if (existing.error || !existing.space) {
    return NextResponse.json({ error: existing.error || "Not found." }, { status: 404 });
  }

  if (existing.readOnly) {
    return NextResponse.json(
      { error: "This space cannot be edited." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseUnclaimedSpaceInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const crmValidated = await validateSpaceCrmLink(admin, {
    crm_organisation_id: parsed.data.crm_organisation_id,
    crm_contact_id: parsed.data.crm_contact_id,
  });
  if (!crmValidated.ok) {
    return NextResponse.json({ error: crmValidated.error }, { status: 400 });
  }

  const propertyId = (existing.space as { property_id?: string | null }).property_id;
  const patch: Record<string, unknown> = {};
  applyUnclaimedSpaceUpdatePatch(patch, parsed.data, propertyId ? { propertyId } : undefined);

  if (body.status === "draft") {
    patch.status = "draft";
  }

  const { error: updateErr } = await admin.from("spaces").update(patch).eq("id", spaceId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const attrErr = await syncSpaceAttributes(admin, spaceId, parsed.data.attributes);
  if (attrErr) {
    return NextResponse.json({ error: attrErr }, { status: 500 });
  }

  await adminAudit({
    action: "admin_space_manage_updated",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: spaceId,
    meta: { propertyId, fields: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true });
}
