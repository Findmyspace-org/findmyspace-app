import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  createServiceAdminClient,
  fetchAdminCreatedListing,
  fetchAdminUnclaimedSpace,
  parseUnclaimedSpaceInput,
  syncSpaceAttributes,
} from "@/lib/admin-unclaimed-space";
import {
  fetchSpaceCrmLinkSummary,
  validateSpaceCrmLink,
} from "@/lib/space-crm-link";

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
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const result = await fetchAdminCreatedListing(admin, id, {
    allowOwnerClaimed: true,
  });
  if (result.error || !result.space) {
    return NextResponse.json({ error: result.error || "Not found." }, { status: 404 });
  }
  const space = result.space;

  const [{ data: images }, { data: attributes }, { count: enquiryCount }, { count: claimInterestCount }] =
    await Promise.all([
      admin
        .from("space_images")
        .select("id, image_url, file_path, sort_order")
        .eq("space_id", id)
        .order("sort_order", { ascending: true }),
      admin
        .from("space_attributes")
        .select("attribute_key, attribute_value")
        .eq("space_id", id),
      admin
        .from("listing_enquiries")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", id),
      admin
        .from("listing_claim_interests")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", id),
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
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const existing = await fetchAdminCreatedListing(admin, id, {
    allowOwnerClaimed: true,
  });
  if (existing.error || !existing.space) {
    return NextResponse.json({ error: existing.error || "Not found." }, { status: 404 });
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
    owner_id: null,
    created_by_admin: true,
  };

  const d = parsed.data;
  if (d.title !== undefined) patch.title = d.title?.trim() || "Untitled listing";
  if (d.description !== undefined) patch.description = d.description;
  if (d.space_type !== undefined) patch.space_type = d.space_type;
  if (d.booking_unit !== undefined) patch.booking_unit = d.booking_unit ?? "day";
  if (d.city !== undefined) patch.city = d.city;
  if (d.suburb !== undefined) patch.suburb = d.suburb;
  if (d.province !== undefined) patch.province = d.province;
  if (d.postal_code !== undefined) patch.postal_code = d.postal_code;
  if (d.country !== undefined) patch.country = d.country ?? "South Africa";
  if (d.latitude !== undefined) patch.latitude = d.latitude;
  if (d.longitude !== undefined) patch.longitude = d.longitude;
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

  if ("property_id" in body) {
    const raw = body.property_id;
    if (raw === null) {
      patch.property_id = null;
    } else if (typeof raw === "string" && UUID_RE.test(raw.trim())) {
      const { data: property } = await admin
        .from("properties")
        .select("id")
        .eq("id", raw.trim())
        .maybeSingle();
      if (!property) {
        return NextResponse.json({ error: "Property not found." }, { status: 400 });
      }
      patch.property_id = raw.trim();
    } else if (raw !== undefined) {
      return NextResponse.json({ error: "Invalid property_id." }, { status: 400 });
    }
  }

  const { error: updateErr } = await admin.from("spaces").update(patch).eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const attrErr = await syncSpaceAttributes(admin, id, d.attributes);
  if (attrErr) {
    return NextResponse.json({ error: attrErr }, { status: 500 });
  }

  await adminAudit({
    action: "unclaimed_listing_updated",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
    meta: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true });
}
