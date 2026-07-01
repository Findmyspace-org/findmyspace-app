export const DEFAULT_PROPERTY_TERMS_ACCEPTANCE_LABEL =
  "I have read and agree to the terms and conditions for this property.";

export type PropertyBookingTerms = {
  property_id?: string | null;
  terms_title: string | null;
  terms_text: string | null;
  terms_document_url: string | null;
  require_terms_acceptance: boolean;
  terms_acceptance_label: string;
  terms_updated_at: string | null;
};

export type PropertyTermsInput = {
  terms_title?: string | null;
  terms_text?: string | null;
  terms_document_url?: string | null;
  require_terms_acceptance?: boolean;
  terms_acceptance_label?: string | null;
};

export type BookingTermsAcceptanceSnapshot = {
  terms_accepted: boolean | null;
  terms_accepted_at: string | null;
  accepted_terms_updated_at: string | null;
  accepted_terms_title: string | null;
  accepted_terms_label: string | null;
};

const MAX_TITLE = 200;
const MAX_LABEL = 500;
const MAX_TEXT = 100_000;

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function propertyHasConfiguredTerms(
  terms: Pick<
    PropertyBookingTerms,
    "terms_title" | "terms_text" | "terms_document_url"
  > | null | undefined
): boolean {
  if (!terms) return false;
  // Renters need readable terms: body text and/or a document (title alone is not enough).
  return Boolean(
    (terms.terms_text && terms.terms_text.trim()) ||
      (terms.terms_document_url && terms.terms_document_url.trim())
  );
}

export function propertyRequiresTermsAcceptance(
  terms: Pick<
    PropertyBookingTerms,
    "require_terms_acceptance" | "terms_title" | "terms_text" | "terms_document_url"
  > | null | undefined
): boolean {
  if (!terms?.require_terms_acceptance) return false;
  return propertyHasConfiguredTerms(terms);
}

export function parsePropertyTermsInput(
  body: Record<string, unknown>
): { ok: true; data: PropertyTermsInput } | { ok: false; error: string } {
  const data: PropertyTermsInput = {};

  if ("terms_title" in body) {
    const v = trimOrNull(body.terms_title);
    if (v && v.length > MAX_TITLE) {
      return { ok: false, error: "Terms title is too long." };
    }
    data.terms_title = v;
  }

  if ("terms_text" in body) {
    const v = trimOrNull(body.terms_text);
    if (v && v.length > MAX_TEXT) {
      return { ok: false, error: "Terms text is too long." };
    }
    data.terms_text = v;
  }

  if ("terms_document_url" in body) {
    data.terms_document_url = trimOrNull(body.terms_document_url);
  }

  if ("require_terms_acceptance" in body) {
    data.require_terms_acceptance = Boolean(body.require_terms_acceptance);
  }

  if ("terms_acceptance_label" in body) {
    const v = trimOrNull(body.terms_acceptance_label);
    if (v && v.length > MAX_LABEL) {
      return { ok: false, error: "Acceptance label is too long." };
    }
    data.terms_acceptance_label = v ?? DEFAULT_PROPERTY_TERMS_ACCEPTANCE_LABEL;
  }

  return { ok: true, data };
}

export function normalizePropertyTermsRow(
  row: Record<string, unknown> | null | undefined
): PropertyBookingTerms | null {
  if (!row) return null;
  return {
    property_id: (row.property_id as string | null) ?? (row.id as string | null) ?? null,
    terms_title: (row.terms_title as string | null) ?? null,
    terms_text: (row.terms_text as string | null) ?? null,
    terms_document_url: (row.terms_document_url as string | null) ?? null,
    require_terms_acceptance: Boolean(row.require_terms_acceptance),
    terms_acceptance_label:
      (row.terms_acceptance_label as string | null)?.trim() ||
      DEFAULT_PROPERTY_TERMS_ACCEPTANCE_LABEL,
    terms_updated_at: (row.terms_updated_at as string | null) ?? null,
  };
}

export function buildBookingTermsAcceptancePayload(
  terms: PropertyBookingTerms,
  accepted: boolean
): BookingTermsAcceptanceSnapshot {
  return {
    terms_accepted: accepted,
    terms_accepted_at: accepted ? new Date().toISOString() : null,
    accepted_terms_updated_at: terms.terms_updated_at,
    accepted_terms_title: terms.terms_title,
    accepted_terms_label: terms.terms_acceptance_label,
  };
}

export function bookingTermsAcceptanceFromRow(
  row: Record<string, unknown> | null | undefined
): BookingTermsAcceptanceSnapshot | null {
  if (!row) return null;
  if (
    row.terms_accepted == null &&
    !row.terms_accepted_at &&
    !row.accepted_terms_title &&
    !row.accepted_terms_label
  ) {
    return null;
  }
  return {
    terms_accepted: row.terms_accepted == null ? null : Boolean(row.terms_accepted),
    terms_accepted_at: (row.terms_accepted_at as string | null) ?? null,
    accepted_terms_updated_at: (row.accepted_terms_updated_at as string | null) ?? null,
    accepted_terms_title: (row.accepted_terms_title as string | null) ?? null,
    accepted_terms_label: (row.accepted_terms_label as string | null) ?? null,
  };
}
