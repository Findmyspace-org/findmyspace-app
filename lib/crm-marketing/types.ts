export type ClosePipelineLostFormPayload = {
  idempotencyKey: string;
  lostReason: string;
  outcomeCategory: string;
  detailNote?: string;
  marketingAudienceMode: string;
  selectedContactIds: string[];
  createFollowUpTask: boolean;
  taskTitle?: string;
  taskDueDate?: string;
  taskOwnerId?: string;
  taskContactId?: string;
};

export type MarketingContactPreview = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  marketingStatus: string | null;
  consentStatus: string | null;
  unsubscribeAt: string | null;
  suppressedAt: string | null;
  sendable: boolean;
  notSendable: boolean;
  eligibilityReason: string;
  locked: boolean;
};

export type CrmMarketingOverviewStats = {
  total: number;
  sendable: number;
  pendingConsent: number;
  unsubscribed: number;
  suppressed: number;
  invalidEmail: number;
  duplicateEmails: number;
  unknownLawfulBasis: number;
  generalUpdates: number;
  goLive: number;
  closedNotNow: number;
  signedUp: number;
  listed: number;
  recentlyAdded: number;
};

export type CrmMarketingContactRow = {
  id: string;
  crm_contact_id: string;
  crm_organisation_id: string | null;
  contact_name: string;
  organisation_name: string | null;
  organisation_type: string | null;
  role: string | null;
  email: string | null;
  pipeline_stage: string | null;
  status: string;
  consent_status: string;
  lawful_basis: string;
  lists: string[];
  created_from: string | null;
  created_at: string;
  unsubscribe_at: string | null;
  suppressed_at: string | null;
  sendable: boolean;
  eligibility_reason: string;
};

export type CrmMarketingListRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  list_type: string;
  is_system: boolean;
  active: boolean;
  total_members: number;
  sendable_members: number;
  pending_consent: number;
  suppressed_members: number;
  unsubscribed_members: number;
  invalid_email_members: number;
  updated_at: string;
  created_at?: string;
};

export type CrmMarketingContactDetail = CrmMarketingContactRow & {
  phone: string | null;
  consent_source: string | null;
  consent_recorded_at: string | null;
  consent_withdrawn_at: string | null;
  suppression_reason: string | null;
  list_ids: string[];
  audits: CrmMarketingAuditRow[];
  communications: CrmMarketingCommunicationRow[];
};

export type CrmMarketingAuditRow = {
  id: string;
  action: string;
  actor_id: string | null;
  marketing_list_id: string | null;
  previous_value: unknown;
  new_value: unknown;
  source: string | null;
  created_at: string;
};

export type CrmMarketingCommunicationRow = {
  id: string;
  type: string;
  summary: string | null;
  outcome: string | null;
  occurred_at: string;
};

export type RecipientPreviewResult = {
  totalMatching: number;
  eligibleRecipients: number;
  excludedRecipients: number;
  uniqueRecipientCount: number;
  duplicateEmailCount: number;
  exclusionCounts: Record<string, number>;
  eligible: Array<{
    marketingContactId: string;
    contactName: string;
    organisationName: string | null;
    email: string | null;
  }>;
  excluded: Array<{
    marketingContactId: string;
    contactName: string;
    email: string | null;
    reason: string;
  }>;
};

export type MarketingCampaignDraftInput = {
  name: string;
  subject?: string;
  previewText?: string;
  senderName?: string;
  replyTo?: string;
  listIds?: string[];
  filters?: Record<string, string | undefined>;
  bodyHtml?: string;
  bodyText?: string;
};
