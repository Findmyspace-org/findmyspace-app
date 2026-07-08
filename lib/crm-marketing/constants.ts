export const MARKETING_CONTACT_STATUSES = [
  "pending_consent",
  "eligible_customer",
  "subscribed",
  "unsubscribed",
  "suppressed",
  "invalid_email",
] as const;

export type MarketingContactStatus = (typeof MARKETING_CONTACT_STATUSES)[number];

export const MARKETING_CONSENT_STATUSES = [
  "unknown",
  "granted",
  "withdrawn",
  "not_required",
] as const;

export type MarketingConsentStatus = (typeof MARKETING_CONSENT_STATUSES)[number];

export const MARKETING_LAWFUL_BASES = [
  "consent",
  "existing_customer_similar_services",
  "none",
  "review_required",
] as const;

export type MarketingLawfulBasis = (typeof MARKETING_LAWFUL_BASES)[number];

export const CLOSED_LOST_OUTCOME_CATEGORIES = [
  "not_interested",
  "not_now",
  "no_response",
  "wrong_contact",
  "already_uses_another_service",
  "budget_or_procurement",
  "duplicate_organisation",
  "unsuitable_organisation",
  "other",
] as const;

export type ClosedLostOutcomeCategory = (typeof CLOSED_LOST_OUTCOME_CATEGORIES)[number];

export const CLOSED_LOST_OUTCOME_LABELS: Record<ClosedLostOutcomeCategory, string> = {
  not_interested: "Not interested",
  not_now: "Not now",
  no_response: "No response",
  wrong_contact: "Wrong contact",
  already_uses_another_service: "Already uses another service",
  budget_or_procurement: "Budget or procurement constraint",
  duplicate_organisation: "Duplicate organisation",
  unsuitable_organisation: "Unsuitable organisation",
  other: "Other",
};

export const MARKETING_AUDIENCE_MODES = [
  "general_updates",
  "launch_announcements",
  "store_only",
  "none",
] as const;

export type MarketingAudienceMode = (typeof MARKETING_AUDIENCE_MODES)[number];

export const MARKETING_AUDIENCE_MODE_LABELS: Record<MarketingAudienceMode, string> = {
  general_updates: "Add eligible contacts to general updates",
  launch_announcements: "Add eligible contacts to launch announcements",
  store_only: "Store contacts in marketing audience but do not send",
  none: "Do not add contacts to marketing audience",
};

export const SYSTEM_LIST_SLUGS = {
  generalUpdates: "general-updates",
  goLive: "go-live-announcements",
  closedNotNow: "closed-not-now",
  listed: "listed-organisations",
  signedUp: "signed-up-organisations",
  municipalities: "municipalities",
  schools: "schools",
  propertyOwners: "property-owners",
  venues: "venues",
} as const;

export const MARKETING_COMPLIANCE_NOTICE =
  "Contacts stored in the marketing audience are not automatically eligible to receive marketing. Campaign sending must re-check consent, customer status and suppression.";

export const SUPPRESSION_REASONS = [
  "hard_bounce",
  "complaint",
  "invalid_address",
  "legal_restriction",
  "internal_block",
  "duplicate_email",
  "other",
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const SUPPRESSION_REASON_LABELS: Record<SuppressionReason, string> = {
  hard_bounce: "Hard bounce",
  complaint: "Complaint",
  invalid_address: "Invalid address",
  legal_restriction: "Legal restriction",
  internal_block: "Internal block",
  duplicate_email: "Duplicate email",
  other: "Other",
};

export const MARKETING_AUDIT_ACTIONS = [
  "marketing_contact_created",
  "marketing_contact_updated",
  "consent_recorded",
  "consent_withdrawn",
  "unsubscribed",
  "suppressed",
  "suppression_removed",
  "added_to_list",
  "removed_from_list",
  "csv_export",
  "recipient_preview",
  "unsubscribe_link",
  "template_created",
  "template_edited",
  "template_duplicated",
  "template_archived",
  "default_template_changed",
  "campaign_created",
  "campaign_draft_saved",
  "template_selected",
  "audience_definition_changed",
  "campaign_content_edited",
  "campaign_test_email_sent",
] as const;

export type MarketingAuditAction = (typeof MARKETING_AUDIT_ACTIONS)[number];

export const CAMPAIGN_AUDIENCE_WARNING =
  "Recipient eligibility will be recalculated immediately before any future send.";
