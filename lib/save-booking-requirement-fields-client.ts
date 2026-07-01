import { validateNoContactInfoInRequirementDefinition } from "@/lib/contact-info-guard";
import {
  fieldTypeNeedsOptions,
  type SpaceBookingRequirementFieldDraft,
} from "@/lib/space-booking-requirement-fields";

export async function saveSpaceBookingRequirementFields(
  spaceId: string,
  accessToken: string,
  drafts: SpaceBookingRequirementFieldDraft[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const activeDrafts = drafts.filter((field) => field.active !== false && field.label.trim());

  for (const field of activeDrafts) {
    if (
      fieldTypeNeedsOptions(field.field_type) &&
      (!field.options || field.options.filter((opt) => opt.trim()).length === 0)
    ) {
      return { ok: false, error: `"${field.label}" needs at least one option.` };
    }

    const contactCheck = validateNoContactInfoInRequirementDefinition({
      label: field.label.trim(),
      help_text: field.help_text,
      field_type: field.field_type,
      options: fieldTypeNeedsOptions(field.field_type)
        ? (field.options || []).map((opt) => opt.trim()).filter(Boolean)
        : field.options,
    });
    if (!contactCheck.ok) {
      return { ok: false, error: contactCheck.error };
    }
  }

  const res = await fetch(`/api/spaces/${spaceId}/booking-requirement-fields`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: activeDrafts.map((field, index) => ({
        label: field.label.trim(),
        help_text: field.help_text?.trim() || null,
        field_type: field.field_type,
        required: field.required,
        options: fieldTypeNeedsOptions(field.field_type)
          ? (field.options || []).map((opt) => opt.trim()).filter(Boolean)
          : null,
        sort_order: index,
        active: true,
      })),
    }),
  });

  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    return { ok: false, error: json?.error || "Could not save booking requirements." };
  }

  return { ok: true };
}
