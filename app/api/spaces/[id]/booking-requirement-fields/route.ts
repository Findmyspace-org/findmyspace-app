import { NextRequest, NextResponse } from "next/server";
import {
  OWNER_DEFINITION_BLOCK_MESSAGE,
  validateNoContactInfoInRequirementDefinition,
} from "@/lib/contact-info-guard";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { assertSpaceListingManageAccess } from "@/lib/space-listing-access";
import {
  fieldTypeNeedsOptions,
  type SpaceBookingFieldType,
} from "@/lib/space-booking-requirement-fields";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FieldPayload = {
  id?: string;
  label: string;
  help_text?: string | null;
  field_type: SpaceBookingFieldType;
  required: boolean;
  options?: string[] | null;
  sort_order: number;
  active: boolean;
};

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const { id: spaceId } = await params;
  if (!UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: "Invalid space id." }, { status: 400 });
  }

  try {
    await assertSpaceListingManageAccess(auth.admin, auth.userId, spaceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden.";
    const status = message === "Space not found." ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  let body: { fields?: FieldPayload[] };
  try {
    body = (await req.json()) as { fields?: FieldPayload[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const fields = body.fields;
  if (!Array.isArray(fields)) {
    return NextResponse.json({ error: "Missing fields array." }, { status: 400 });
  }

  for (const field of fields.filter((item) => item.active)) {
    if (!field.label?.trim()) {
      return NextResponse.json({ error: "Each question needs a label." }, { status: 400 });
    }
    if (
      fieldTypeNeedsOptions(field.field_type) &&
      (!field.options || field.options.filter((opt) => opt.trim()).length === 0)
    ) {
      return NextResponse.json(
        { error: `"${field.label}" needs at least one option.` },
        { status: 400 }
      );
    }

    const contactCheck = validateNoContactInfoInRequirementDefinition({
      label: field.label.trim(),
      help_text: field.help_text?.trim() || null,
      field_type: field.field_type,
      options: field.options?.map((opt) => opt.trim()).filter(Boolean) || null,
    });
    if (!contactCheck.ok) {
      return NextResponse.json({ error: contactCheck.error }, { status: 400 });
    }
  }

  try {
    for (const field of fields) {
      const payload = {
        space_id: spaceId,
        label: field.label.trim(),
        help_text: field.help_text?.trim() || null,
        field_type: field.field_type,
        required: field.required,
        options: fieldTypeNeedsOptions(field.field_type)
          ? (field.options || []).map((opt) => opt.trim()).filter(Boolean)
          : null,
        sort_order: field.sort_order,
        active: field.active,
      };

      if (field.id) {
        const { error } = await auth.admin
          .from("space_booking_requirement_fields")
          .update(payload)
          .eq("id", field.id)
          .eq("space_id", spaceId);
        if (error) throw error;
      } else if (field.active) {
        const { error } = await auth.admin
          .from("space_booking_requirement_fields")
          .insert(payload);
        if (error) throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save booking requirements.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: OWNER_DEFINITION_BLOCK_MESSAGE, hint: "Use PUT to save fields." },
    { status: 405 }
  );
}
