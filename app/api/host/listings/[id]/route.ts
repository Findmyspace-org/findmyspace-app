import { NextRequest, NextResponse } from "next/server";
import { requireManagedListingApi } from "@/lib/access/require-managed-api";
import {
  upsertListingBookingIntelTables,
  type ListingBookingRequirements,
} from "@/lib/booking-intelligence";

const SPACE_SELECT =
  "id, owner_id, title, description, city, suburb, street_address, province, postal_code, country, address_line_1, latitude, longitude, space_type, booking_unit, price_amount, price_unit, deposit_required, deposit_amount, price_per_hour, price_per_day, price_per_month, min_booking_hours, min_booking_days, min_booking_months, min_group_size, max_group_size, status, ownership_proof_status, deposit_type, deposit_months, monthly_payment_day, public_listing_mode, created_at, property_id";

const SPACE_UPDATE_KEYS = [
  "title",
  "description",
  "city",
  "suburb",
  "street_address",
  "province",
  "postal_code",
  "country",
  "address_line_1",
  "latitude",
  "longitude",
  "space_type",
  "booking_unit",
  "price_amount",
  "price_unit",
  "price_per_hour",
  "price_per_day",
  "price_per_month",
  "min_booking_hours",
  "min_booking_days",
  "min_booking_months",
  "deposit_type",
  "deposit_months",
  "monthly_payment_day",
  "deposit_required",
  "deposit_amount",
  "min_group_size",
  "max_group_size",
  "ownership_proof_status",
] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  const { data: space, error } = await auth.admin
    .from("spaces")
    .select(SPACE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !space) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const [{ data: attributes }, { data: images }, { data: questionnaire }, { data: requirements }] =
    await Promise.all([
      auth.admin
        .from("space_attributes")
        .select("attribute_key, attribute_value")
        .eq("space_id", id),
      auth.admin
        .from("space_images")
        .select("id, image_url, file_path, sort_order")
        .eq("space_id", id)
        .order("sort_order", { ascending: true }),
      auth.admin
        .from("listing_questionnaires")
        .select("data, category")
        .eq("space_id", id)
        .maybeSingle(),
      auth.admin
        .from("listing_booking_requirements")
        .select("*")
        .eq("space_id", id)
        .maybeSingle(),
    ]);

  return NextResponse.json({
    space,
    attributes: attributes || [],
    images: images || [],
    questionnaire: questionnaire || null,
    requirements: requirements || null,
    access: {
      canEditSpace: auth.access.canEditSpace,
      isSpaceManager: auth.access.isSpaceManager,
      isOrganisationAdmin: auth.access.isOrganisationAdmin,
      isPropertyManager: auth.access.isPropertyManager,
      isLegacySpaceOwner: auth.access.isLegacySpaceOwner,
      isGlobalAdmin: auth.access.isGlobalAdmin,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (body.userId || body.owner_id || body.spaceId || body.organisationId) {
    return NextResponse.json(
      { error: "Listing updates do not accept client identity fields." },
      { status: 400 }
    );
  }

  const spacePatch: Record<string, unknown> = {};
  for (const key of SPACE_UPDATE_KEYS) {
    if (key in body) spacePatch[key] = body[key];
  }

  if (typeof body.status === "string") {
    if (body.status !== "active" && body.status !== "paused" && body.status !== "deleted") {
      return NextResponse.json({ error: "Invalid listing status." }, { status: 400 });
    }
    spacePatch.status = body.status;
  }

  if (Object.keys(spacePatch).length > 0) {
    const { error: updateError } = await auth.admin
      .from("spaces")
      .update(spacePatch)
      .eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  if (Array.isArray(body.attributes)) {
    const { error: deleteError } = await auth.admin
      .from("space_attributes")
      .delete()
      .eq("space_id", id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    const rows = (body.attributes as Array<{
      attribute_key?: string;
      attribute_value?: string;
    }>)
      .filter((row) => row.attribute_key && row.attribute_value)
      .map((row) => ({
        space_id: id,
        attribute_key: row.attribute_key,
        attribute_value: row.attribute_value,
      }));
    if (rows.length > 0) {
      const { error: insertError } = await auth.admin
        .from("space_attributes")
        .insert(rows);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
  }

  if (body.questionnaireData && typeof body.questionnaireData === "object") {
    const intel = await upsertListingBookingIntelTables(auth.admin as never, {
      spaceId: id,
      spaceType: typeof body.space_type === "string" ? body.space_type : null,
      questionnaireData: body.questionnaireData as Record<string, unknown>,
      requirements:
        body.requirements === undefined
          ? null
          : (body.requirements as ListingBookingRequirements),
    });
    if (intel.questionnaireError || intel.requirementsError) {
      return NextResponse.json(
        {
          error:
            intel.questionnaireError ||
            intel.requirementsError ||
            "Could not save booking details.",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, spaceId: id });
}
