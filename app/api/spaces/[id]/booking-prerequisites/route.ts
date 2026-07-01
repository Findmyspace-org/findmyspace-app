import { NextRequest, NextResponse } from "next/server";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  normalizePropertyTermsRow,
  propertyRequiresTermsAcceptance,
} from "@/lib/property-booking-terms";
import {
  normalizeSpaceBookingFieldRow,
  sortBookingFields,
} from "@/lib/space-booking-requirement-fields";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: spaceId } = await params;
  if (!UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: "Invalid space id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: space, error: spaceErr } = await admin
    .from("spaces")
    .select("id, status, property_id")
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceErr || !space) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const spaceRow = space as {
    id: string;
    status: string | null;
    property_id: string | null;
  };

  if (!["active", "unclaimed"].includes(spaceRow.status || "")) {
    return NextResponse.json({ error: "Space is not available for booking." }, { status: 404 });
  }

  let propertyTerms = null;
  if (spaceRow.property_id) {
    const { data: property } = await admin
      .from("properties")
      .select(
        "id, terms_title, terms_text, terms_document_url, require_terms_acceptance, terms_acceptance_label, terms_updated_at"
      )
      .eq("id", spaceRow.property_id)
      .maybeSingle();

    if (property) {
      propertyTerms = normalizePropertyTermsRow(property as Record<string, unknown>);
      if (propertyTerms) {
        propertyTerms.property_id = spaceRow.property_id;
      }
    }
  }

  const { data: fieldRows, error: fieldsErr } = await admin
    .from("space_booking_requirement_fields")
    .select(
      "id, space_id, label, help_text, field_type, required, options, sort_order, active"
    )
    .eq("space_id", spaceId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (fieldsErr) {
    return NextResponse.json({ error: fieldsErr.message }, { status: 500 });
  }

  const fields = sortBookingFields(
    ((fieldRows || []) as Record<string, unknown>[]).map(normalizeSpaceBookingFieldRow)
  );

  return NextResponse.json({
    property_terms: propertyTerms,
    require_property_terms: propertyRequiresTermsAcceptance(propertyTerms),
    fields,
  });
}
