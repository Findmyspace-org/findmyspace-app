import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  createServiceAdminClient,
  fetchAdminPropertySpace,
  parseUnclaimedSpaceInput,
  syncSpaceAttributes,
} from "@/lib/admin-unclaimed-space";
import { parseSpacePricingInput } from "@/lib/space-pricing";
import {
  fetchSpaceCrmLinkSummary,
  validateSpaceCrmLink,
} from "@/lib/space-crm-link";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; spaceId: string }> }
) {
  const auth = await requireAdminApi(_req);
  if ("response" in auth) return auth.response;

  const { id: propertyId, spaceId } = await params;
  if (!UUID_RE.test(propertyId) || !UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: "Invalid property or space id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const result = await fetchAdminPropertySpace(admin, propertyId, spaceId);
  if (result.error || !result.space) {
    return NextResponse.json({ error: result.error || "Not found." }, { status: 404 });
  }

  const space = result.space;

  const [{ data: images }, { data: attributes }, { count: enquiryCount }, { count: claimInterestCount }] =
    await Promise.all([
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
    ]);

  const grouped: Record<string, string[]> = {};
  for (const row of (attributes as { attribute_key: string; attribute_value: string }[]) ||
    []) {
    if (!grouped[row.attribute_key]) grouped[row.attribute_key] = [];
    grouped[row.attribute_key].push(row.attribute_value);
  }

  return NextResponse.json({
    space,
    readOnly: result.readOnly ?? false,
    images: images || [],
    attributes: grouped,
    enquiry_count: enquiryCount ?? 0,
    claim_interest_count: claimInterestCount ?? 0,
    crm_link: await fetchSpaceCrmLinkSummary(
      admin,
      space as { crm_organisation_id?: string | null; crm_contact_id?: string | null }
    ),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; spaceId: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id: propertyId, spaceId } = await params;
  if (!UUID_RE.test(propertyId) || !UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: "Invalid property or space id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const existing = await fetchAdminPropertySpace(admin, propertyId, spaceId);
  if (existing.error || !existing.space) {
    return NextResponse.json({ error: existing.error || "Not found." }, { status: 404 });
  }

  if (existing.readOnly) {
    return NextResponse.json(
      { error: "This space is read-only and cannot be edited here." },
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

  const patch: Record<string, unknown> = {
    property_id: propertyId,
  };

  const d = parsed.data;
  if (d.title !== undefined) patch.title = d.title?.trim() || "Untitled listing";
  if (d.description !== undefined) patch.description = d.description;
  if (d.space_type !== undefined) patch.space_type = d.space_type;
  if (d.booking_unit !== undefined) patch.booking_unit = d.booking_unit ?? "day";
  if (d.price_amount !== undefined) patch.price_amount = d.price_amount;
  if (d.price_unit !== undefined) patch.price_unit = d.price_unit;
  if (d.deposit_required !== undefined) patch.deposit_required = d.deposit_required;
  if (d.deposit_amount !== undefined) patch.deposit_amount = d.deposit_amount;
  if (d.price_unit !== undefined || d.price_amount !== undefined) {
    const pricingParsed = parseSpacePricingInput({
      price_amount: d.price_amount,
      price_unit: d.price_unit,
      deposit_required: d.deposit_required ?? false,
      deposit_amount: d.deposit_amount ?? null,
    });
    if (pricingParsed.ok && pricingParsed.data) {
      patch.booking_unit = pricingParsed.data.booking_unit;
      patch.price_per_hour = pricingParsed.data.price_per_hour;
      patch.price_per_day = pricingParsed.data.price_per_day;
      patch.price_per_month = pricingParsed.data.price_per_month;
    }
  }
  if (d.city !== undefined) patch.city = d.city;
  if (d.suburb !== undefined) patch.suburb = d.suburb;
  if (d.province !== undefined) patch.province = d.province;
  if (d.postal_code !== undefined) patch.postal_code = d.postal_code;
  if (d.country !== undefined) patch.country = d.country ?? "South Africa";
  if (d.latitude !== undefined) patch.latitude = d.latitude;
  if (d.longitude !== undefined) patch.longitude = d.longitude;
  if (d.min_group_size !== undefined) patch.min_group_size = d.min_group_size;
  if (d.max_group_size !== undefined) patch.max_group_size = d.max_group_size;
  if (d.crm_organisation_id !== undefined) {
    patch.crm_organisation_id = d.crm_organisation_id;
  }
  if (d.crm_contact_id !== undefined) patch.crm_contact_id = d.crm_contact_id;

  const street = d.street_address ?? d.address_line_1;
  if (street !== undefined || d.address_line_1 !== undefined) {
    patch.street_address = street ?? null;
    patch.address_line_1 = street ?? null;
  }

  if (body.status === "draft") {
    patch.status = "draft";
  }

  const { error: updateErr } = await admin.from("spaces").update(patch).eq("id", spaceId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const attrErr = await syncSpaceAttributes(admin, spaceId, d.attributes);
  if (attrErr) {
    return NextResponse.json({ error: attrErr }, { status: 500 });
  }

  await adminAudit({
    action: "property_space_updated",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: spaceId,
    meta: { propertyId, fields: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true });
}
