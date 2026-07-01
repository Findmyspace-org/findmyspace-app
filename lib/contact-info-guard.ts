import type {
  CustomFieldAnswerValue,
  SpaceBookingFieldType,
  SpaceBookingRequirementField,
} from "@/lib/space-booking-requirement-fields";

/**
 * TODO(follow-up): Review booking requirement definitions/responses created before this
 * guard — legacy fields may still request or contain contact details.
 */

export const OWNER_DEFINITION_BLOCK_MESSAGE =
  "Contact details may not be requested here. FindMySpace only releases renter contact details at the approved stage of the booking process.";

/** Shorter copy for inline field validation in booking requirement editors. */
export const INLINE_DEFINITION_BLOCK_MESSAGE =
  "Contact details may not be requested here.";

export const RENTER_ANSWER_BLOCK_MESSAGE =
  "Please do not include contact details here. Your contact information will be shared through FindMySpace at the correct booking stage.";

export const FILE_UPLOAD_RENTER_HELPER_TEXT =
  "Do not upload documents containing unnecessary personal contact details unless specifically required for legal or compliance purposes.";

export type RequirementDefinitionFieldErrors = {
  label?: string;
  help_text?: string;
  options?: Record<number, string>;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export type RequirementDefinitionInput = {
  label: string;
  help_text?: string | null;
  field_type: SpaceBookingFieldType | string;
  options?: string[] | null;
};

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

const WHATSAPP_RE = /\b(whatsapp|wa\.me)\b/i;

/** South African cell: +27/0 + 6/7/8 + 8 digits (optional separators). */
const SA_CELL_RE =
  /(?:\+27[\s\-]?|0)(?:6|7|8)[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{3,4}\b/;

/** SA landline area codes with 9 trailing digits. */
const SA_LANDLINE_RE =
  /\b0(?:1[0-9]|2[1-8]|3[1-6]|4[0-9]|5[0-9])[\s\-]?\d{3}[\s\-]?\d{4}\b/;

const DEFINITION_PHRASE_PATTERNS: RegExp[] = [
  /\b(e-?mail|epos|e-pos(?:adres)?)\b/i,
  /\bmail\s+address\b/i,
  /\b(phone|cell\s*phone|cellphone|mobile|telephone|tel)\b/i,
  /\b(selfoon(?:nommer)?|telefoon(?:nommer)?|kontaknommer)\b/i,
  /\b(contact\s*(number|details|person\s*details)|kontak\s*besonderhede|kontakbesonderhede)\b/i,
  /\bwhatsapp\b/i,
  /\b(home\s+address|physical\s+address|residential\s+address|woonadres)\b/i,
  /\b(postal\s+address|postal\s+adres)\b/i,
  /\byour\s+address\b/i,
  /\b(id\s*number|identity\s*number|identiteitsnommer|paspoortnommer|passport\s*number)\b/i,
];

const CONTACT_DOCUMENT_PATTERNS: RegExp[] = [
  /\bcontact\s*list\b/i,
  /\battendee\s*contact\b/i,
  /\bguest\s*list\b.*\bcontact\b/i,
  /\bupload\b.*\bcontact\b/i,
  /\bcontact\b.*\b(numbers?|details?)\b/i,
  /\bkontak\s*lys\b/i,
  /\bdeelnemer\s*kontak\b/i,
];

const COMPLIANCE_DOCUMENT_ALLOWLIST: RegExp[] = [
  /\bpermit\b/i,
  /\bhealth\s*(and\s*)?safety\b/i,
  /\bpublic\s*liability\b/i,
  /\binsurance\b/i,
  /\bevent\s*plan\b/i,
  /\bpolice\s*approval\b/i,
  /\bmunicipal\s*approval\b/i,
  /\bcompliance\b/i,
  /\blicen[cs]e\b/i,
  /\bcertificate\b/i,
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function collectDefinitionText(field: RequirementDefinitionInput): string {
  const parts = [
    field.label,
    field.help_text || "",
    ...(field.options || []),
  ];
  return normalizeText(parts.filter(Boolean).join(" "));
}

function isComplianceDocumentRequest(text: string): boolean {
  return matchesAnyPattern(text, COMPLIANCE_DOCUMENT_ALLOWLIST);
}

function isContactDocumentRequest(text: string): boolean {
  if (isComplianceDocumentRequest(text)) return false;
  return matchesAnyPattern(text, CONTACT_DOCUMENT_PATTERNS);
}

function containsObviousIdReference(text: string): boolean {
  if (/\b(id|identity|identiteits|paspoort|passport)\s*(number|no\.?|nommer)?\s*:?\s*[A-Z0-9]{6,}/i.test(text)) {
    return true;
  }
  if (/\b\d{13}\b/.test(text) && /\b(id|identity|identiteits|rsa|sa\s*id)\b/i.test(text)) {
    return true;
  }
  return false;
}

export function containsContactInfo(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  if (EMAIL_RE.test(normalized)) return true;
  if (WHATSAPP_RE.test(normalized)) return true;
  if (SA_CELL_RE.test(normalized)) return true;
  if (SA_LANDLINE_RE.test(normalized)) return true;
  if (containsObviousIdReference(normalized)) return true;

  return false;
}

export function containsContactInfoPhrase(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return matchesAnyPattern(normalized, DEFINITION_PHRASE_PATTERNS);
}

function definitionSliceHasContactInfo(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return containsContactInfoPhrase(text) || containsContactInfo(text);
}

function definitionSliceHasContactDocumentRequest(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return isContactDocumentRequest(normalizeText(text));
}

function requirementDefinitionValidationFails(field: RequirementDefinitionInput): boolean {
  const combined = collectDefinitionText(field);

  if (containsContactInfoPhrase(combined) || containsContactInfo(combined)) {
    return true;
  }

  if (field.field_type === "file_upload" && isContactDocumentRequest(combined)) {
    return true;
  }

  return false;
}

export function hasRequirementDefinitionFieldErrors(
  errors: RequirementDefinitionFieldErrors
): boolean {
  return Boolean(
    errors.label ||
      errors.help_text ||
      (errors.options && Object.keys(errors.options).length > 0)
  );
}

export function getRequirementDefinitionFieldErrors(
  field: RequirementDefinitionInput
): RequirementDefinitionFieldErrors {
  if (!requirementDefinitionValidationFails(field)) {
    return {};
  }

  const errors: RequirementDefinitionFieldErrors = {};
  const combined = collectDefinitionText(field);
  const msg = INLINE_DEFINITION_BLOCK_MESSAGE;

  if (definitionSliceHasContactInfo(field.label)) {
    errors.label = msg;
  }
  if (definitionSliceHasContactInfo(field.help_text)) {
    errors.help_text = msg;
  }

  field.options?.forEach((option, index) => {
    if (definitionSliceHasContactInfo(option)) {
      errors.options = { ...errors.options, [index]: msg };
    }
  });

  if (field.field_type === "file_upload" && isContactDocumentRequest(combined)) {
    if (definitionSliceHasContactDocumentRequest(field.label) && !errors.label) {
      errors.label = msg;
    }
    if (definitionSliceHasContactDocumentRequest(field.help_text) && !errors.help_text) {
      errors.help_text = msg;
    }
    field.options?.forEach((option, index) => {
      if (definitionSliceHasContactDocumentRequest(option) && !errors.options?.[index]) {
        errors.options = { ...errors.options, [index]: msg };
      }
    });
  }

  if (!hasRequirementDefinitionFieldErrors(errors)) {
    if (field.label?.trim()) errors.label = msg;
    if (field.help_text?.trim()) errors.help_text = msg;
    field.options?.forEach((option, index) => {
      if (option.trim()) {
        errors.options = { ...errors.options, [index]: msg };
      }
    });
  }

  if (!hasRequirementDefinitionFieldErrors(errors) && field.label?.trim()) {
    errors.label = msg;
  }

  return errors;
}

export function validateNoContactInfoInRequirementDefinition(
  field: RequirementDefinitionInput
): ValidationResult {
  if (requirementDefinitionValidationFails(field)) {
    return { ok: false, error: OWNER_DEFINITION_BLOCK_MESSAGE };
  }

  return { ok: true };
}

function answerTextValue(value: CustomFieldAnswerValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return null;
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object" && value !== null && "file_name" in value) {
    return String((value as { file_name: string }).file_name || "");
  }
  return null;
}

export function validateNoContactInfoInRequirementAnswer(
  fieldType: SpaceBookingFieldType | string,
  value: CustomFieldAnswerValue,
  fileName?: string | null
): ValidationResult {
  if (fieldType === "number" || fieldType === "yes_no") {
    return { ok: true };
  }

  const textParts: string[] = [];
  const answerText = answerTextValue(value);
  if (answerText) textParts.push(answerText);
  if (fileName) textParts.push(fileName);

  if (fieldType === "multi_select" && Array.isArray(value)) {
    textParts.push(value.join(" "));
  }

  const combined = normalizeText(textParts.join(" "));
  if (!combined) return { ok: true };

  if (containsContactInfo(combined)) {
    return { ok: false, error: RENTER_ANSWER_BLOCK_MESSAGE };
  }

  return { ok: true };
}

export function validateNoContactInfoInRequirementAnswers(
  fields: SpaceBookingRequirementField[],
  answers: Record<string, CustomFieldAnswerValue>,
  files: Record<string, File | null | undefined> = {}
): ValidationResult {
  for (const field of fields.filter((item) => item.active)) {
    if (field.field_type === "file_upload") {
      const file = files[field.id];
      const check = validateNoContactInfoInRequirementAnswer(
        field.field_type,
        answers[field.id] ?? null,
        file?.name ?? null
      );
      if (!check.ok) return check;
      continue;
    }

    const value = answers[field.id];
    const empty =
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);

    if (empty) continue;

    const check = validateNoContactInfoInRequirementAnswer(field.field_type, value);
    if (!check.ok) return check;
  }

  return { ok: true };
}

export function redactContactInfoInText(text: string): string {
  let out = text;
  out = out.replace(EMAIL_RE, "[contact detail hidden]");
  out = out.replace(SA_CELL_RE, "[contact detail hidden]");
  out = out.replace(SA_LANDLINE_RE, "[contact detail hidden]");
  out = out.replace(WHATSAPP_RE, "[contact detail hidden]");
  if (containsObviousIdReference(out)) {
    out = out.replace(/\b\d{13}\b/g, "[contact detail hidden]");
  }
  return out;
}

export function sanitizeRequirementResponseValue(
  fieldType: string,
  value: unknown,
  allowContactDetails: boolean
): unknown {
  if (allowContactDetails) return value;
  if (value === null || value === undefined) return value;

  if (fieldType === "file_upload" && typeof value === "object" && value !== null) {
    const fileName = (value as { file_name?: string }).file_name;
    if (fileName && containsContactInfo(fileName)) {
      return { ...(value as Record<string, unknown>), file_name: "[document hidden until payment]" };
    }
    return value;
  }

  if (fieldType === "number" || fieldType === "yes_no") return value;

  if (typeof value === "string") {
    return containsContactInfo(value) ? redactContactInfoInText(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" && containsContactInfo(item)
        ? redactContactInfoInText(item)
        : item
    );
  }

  return value;
}
