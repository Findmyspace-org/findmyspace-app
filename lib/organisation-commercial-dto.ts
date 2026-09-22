import type { OrganisationPayoutReadiness } from "@/lib/access/organisation-payout-readiness";

export const ORGANISATION_TYPES = [
  "school",
  "municipality",
  "company",
  "npo",
  "church",
  "sports_club",
  "other",
] as const;

export type OrganisationType = (typeof ORGANISATION_TYPES)[number];

export const DOCUMENT_KINDS = [
  "registration",
  "authority_letter",
  "mandate",
  "municipal",
  "school",
  "npo",
  "other",
] as const;

export type OrganisationDocumentKind = (typeof DOCUMENT_KINDS)[number];

export const BANK_ACCOUNT_TYPES = [
  "cheque",
  "savings",
  "transmission",
  "other",
] as const;

export type OrganisationBankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export type OrganisationCommercialProfileDto = {
  organisation_id: string;
  legal_name: string;
  trading_name: string | null;
  organisation_type: OrganisationType | null;
  registration_number: string | null;
  vat_number: string | null;
  address_line1: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  authorised_representative_name: string | null;
  authorised_representative_title: string | null;
  verification_status: "pending" | "verified" | "rejected";
  verification_method: "document_review" | "admin_assisted" | null;
  verification_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
};

export type OrganisationVerificationDocumentDto = {
  id: string;
  organisation_id: string;
  document_kind: OrganisationDocumentKind;
  label: string | null;
  content_type: string | null;
  byte_size: number | null;
  uploaded_at: string;
  signed_url: string | null;
};

export type MaskedOrganisationBankDto = {
  id: string;
  organisation_id: string;
  version_number: number;
  is_current: boolean;
  account_holder_name: string;
  bank_name: string;
  account_type: OrganisationBankAccountType;
  branch_code: string;
  account_number_last4: string;
  account_number_display: string;
  proof_of_bank_submitted: boolean;
  status: "pending" | "verified" | "rejected";
  review_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

export type AdminOrganisationBankDto = MaskedOrganisationBankDto & {
  account_number: string;
  proof_of_bank_path: string;
  proof_signed_url: string | null;
};

export type OrganisationCommercialBundle = {
  organisation: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
  };
  commercial: OrganisationCommercialProfileDto | null;
  documents: OrganisationVerificationDocumentDto[];
  bank: MaskedOrganisationBankDto | null;
  payout_readiness: OrganisationPayoutReadiness;
};

export function maskAccountDisplay(last4: string | null | undefined): string {
  const digits = (last4 || "").replace(/\D/g, "").slice(-4);
  if (digits.length !== 4) return "••••";
  return `•••• ${digits}`;
}

export function toMaskedBankDto(row: {
  id: string;
  organisation_id: string;
  version_number: number;
  is_current: boolean;
  account_holder_name: string;
  bank_name: string;
  account_type: string;
  branch_code: string;
  account_number_last4: string;
  proof_of_bank_path?: string | null;
  status: string;
  review_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}): MaskedOrganisationBankDto {
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    version_number: row.version_number,
    is_current: row.is_current,
    account_holder_name: row.account_holder_name,
    bank_name: row.bank_name,
    account_type: row.account_type as OrganisationBankAccountType,
    branch_code: row.branch_code,
    account_number_last4: row.account_number_last4,
    account_number_display: maskAccountDisplay(row.account_number_last4),
    proof_of_bank_submitted: Boolean(row.proof_of_bank_path?.trim()),
    status: row.status as MaskedOrganisationBankDto["status"],
    review_notes: row.review_notes,
    rejection_reason: row.rejection_reason,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
  };
}
