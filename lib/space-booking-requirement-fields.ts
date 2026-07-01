import {
  validateNoContactInfoInRequirementAnswers,
} from "@/lib/contact-info-guard";

export const SPACE_BOOKING_FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "yes_no",
  "dropdown",
  "multi_select",
  "file_upload",
] as const;

export type SpaceBookingFieldType = (typeof SPACE_BOOKING_FIELD_TYPES)[number];

export type SpaceBookingRequirementField = {
  id: string;
  space_id: string;
  label: string;
  help_text: string | null;
  field_type: SpaceBookingFieldType;
  required: boolean;
  options: string[] | null;
  sort_order: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SpaceBookingRequirementFieldDraft = Omit<
  SpaceBookingRequirementField,
  "space_id" | "created_at" | "updated_at"
> & {
  space_id?: string;
  _localKey?: string;
  /** Set when created from a common template — used for duplicate detection before save. */
  _templateId?: string;
};

export type BookingRequirementResponseRow = {
  id: string;
  booking_id: string;
  space_id: string;
  field_id: string | null;
  field_label_snapshot: string;
  field_type_snapshot: SpaceBookingFieldType | string;
  value: unknown;
  file_url: string | null;
  file_path?: string | null;
  signed_file_url?: string | null;
  created_at?: string;
};

export type CustomFieldAnswerValue =
  | string
  | number
  | boolean
  | string[]
  | { file_name: string }
  | null;

export const SPACE_BOOKING_FIELD_TYPE_LABELS: Record<SpaceBookingFieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  yes_no: "Yes / No",
  dropdown: "Dropdown",
  multi_select: "Multi-select",
  file_upload: "Document upload",
};

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseFieldOptions(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    const items = raw
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return items.length > 0 ? items : null;
  }
  if (typeof raw === "object" && raw !== null && "items" in raw) {
    return parseFieldOptions((raw as { items: unknown }).items);
  }
  return null;
}

export function normalizeSpaceBookingFieldRow(
  row: Record<string, unknown>
): SpaceBookingRequirementField {
  const fieldType = String(row.field_type || "short_text") as SpaceBookingFieldType;
  return {
    id: String(row.id),
    space_id: String(row.space_id),
    label: String(row.label || "").trim(),
    help_text: trimOrNull(row.help_text),
    field_type: SPACE_BOOKING_FIELD_TYPES.includes(fieldType)
      ? fieldType
      : "short_text",
    required: Boolean(row.required),
    options: parseFieldOptions(row.options),
    sort_order: Number(row.sort_order ?? 0),
    active: row.active !== false,
  };
}

export function fieldTypeNeedsOptions(fieldType: SpaceBookingFieldType): boolean {
  return fieldType === "dropdown" || fieldType === "multi_select";
}

export function createEmptyFieldDraft(
  sortOrder: number,
  fieldType: SpaceBookingFieldType = "short_text"
): SpaceBookingRequirementFieldDraft {
  return {
    id: "",
    _localKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    help_text: null,
    field_type: fieldType,
    required: false,
    options: fieldTypeNeedsOptions(fieldType) ? [""] : null,
    sort_order: sortOrder,
    active: true,
  };
}

export function validateCustomFieldAnswers(
  fields: SpaceBookingRequirementField[],
  answers: Record<string, CustomFieldAnswerValue>,
  files: Record<string, File | null>
): string | null {
  for (const field of fields.filter((f) => f.active)) {
    if (!field.required) continue;
    if (field.field_type === "file_upload") {
      if (!files[field.id]) {
        return `Please upload a document for "${field.label}".`;
      }
      continue;
    }
    const value = answers[field.id];
    if (field.field_type === "multi_select") {
      if (!Array.isArray(value) || value.length === 0) {
        return `Please complete "${field.label}".`;
      }
      continue;
    }
    if (field.field_type === "yes_no") {
      if (typeof value !== "boolean") {
        return `Please answer "${field.label}".`;
      }
      continue;
    }
    if (field.field_type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `Please enter a number for "${field.label}".`;
      }
      continue;
    }
    if (value === null || value === undefined || String(value).trim() === "") {
      return `Please complete "${field.label}".`;
    }
  }

  const contactCheck = validateNoContactInfoInRequirementAnswers(fields, answers, files);
  if (!contactCheck.ok) return contactCheck.error;

  return null;
}

/** Server-side validation including option membership checks. */
export function validateCustomFieldAnswersServer(
  fields: SpaceBookingRequirementField[],
  answers: Record<string, CustomFieldAnswerValue>,
  uploadedFieldIds: Set<string>,
  filesByFieldId: Map<string, File> = new Map()
): string | null {
  for (const field of fields.filter((f) => f.active)) {
    if (field.field_type === "file_upload") {
      if (field.required && !uploadedFieldIds.has(field.id)) {
        return `Please upload a document for "${field.label}".`;
      }
      continue;
    }

    if (!field.required) continue;

    const value = answers[field.id];

    if (field.field_type === "multi_select") {
      if (!Array.isArray(value) || value.length === 0) {
        return `Please complete "${field.label}".`;
      }
      const options = new Set(field.options || []);
      for (const item of value) {
        if (typeof item !== "string" || !options.has(item)) {
          return `Invalid selection for "${field.label}".`;
        }
      }
      continue;
    }

    if (field.field_type === "dropdown") {
      if (typeof value !== "string" || !value.trim()) {
        return `Please complete "${field.label}".`;
      }
      const options = new Set(field.options || []);
      if (!options.has(value)) {
        return `Invalid selection for "${field.label}".`;
      }
      continue;
    }

    if (field.field_type === "yes_no") {
      if (typeof value !== "boolean") {
        return `Please answer "${field.label}".`;
      }
      continue;
    }

    if (field.field_type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `Please enter a number for "${field.label}".`;
      }
      continue;
    }

    if (value === null || value === undefined || String(value).trim() === "") {
      return `Please complete "${field.label}".`;
    }
  }

  const files: Record<string, File | null> = {};
  for (const field of fields) {
    files[field.id] = filesByFieldId.get(field.id) ?? null;
  }
  const contactCheck = validateNoContactInfoInRequirementAnswers(fields, answers, files);
  if (!contactCheck.ok) return contactCheck.error;

  return null;
}

export function formatCustomFieldDisplayValue(
  fieldType: string,
  value: unknown
): string {
  if (value === null || value === undefined) return "—";
  if (fieldType === "yes_no") {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (value === "true") return "Yes";
    if (value === "false") return "No";
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function sortBookingFields<T extends { sort_order: number; label: string }>(
  fields: T[]
): T[] {
  return [...fields].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label.localeCompare(b.label);
  });
}
