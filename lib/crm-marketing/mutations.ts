import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MarketingConsentStatus,
  MarketingContactStatus,
  MarketingLawfulBasis,
  SuppressionReason,
} from "./constants";
import { writeMarketingAudit } from "./audits";
import {
  evaluateMarketingEligibility,
  normaliseMarketingEmail,
} from "./eligibility";

type MarketingContactRecord = {
  id: string;
  crm_contact_id: string;
  crm_organisation_id: string | null;
  email: string | null;
  email_normalised: string | null;
  status: string;
  consent_status: string;
  lawful_basis: string;
  consent_source: string | null;
  consent_recorded_at: string | null;
  consent_withdrawn_at: string | null;
  unsubscribe_at: string | null;
  suppressed_at: string | null;
  suppression_reason: string | null;
  created_from: string | null;
};

async function loadMarketingContact(
  adminClient: SupabaseClient,
  marketingContactId: string
): Promise<MarketingContactRecord> {
  const { data, error } = await adminClient
    .from("crm_marketing_contacts")
    .select("*")
    .eq("id", marketingContactId)
    .single();
  if (error || !data) throw new Error("Marketing contact not found.");
  return data as MarketingContactRecord;
}

function isTerminalProtected(row: MarketingContactRecord): boolean {
  return Boolean(
    row.unsubscribe_at ||
      row.suppressed_at ||
      row.status === "unsubscribed" ||
      row.status === "suppressed"
  );
}

function deriveStatusFromConsent(input: {
  consentStatus: MarketingConsentStatus | string;
  lawfulBasis: MarketingLawfulBasis | string;
}): MarketingContactStatus {
  if (input.consentStatus === "granted" && input.lawfulBasis === "consent") {
    return "subscribed";
  }
  if (
    input.lawfulBasis === "existing_customer_similar_services" &&
    input.consentStatus === "not_required"
  ) {
    return "eligible_customer";
  }
  return "pending_consent";
}

export async function recordMarketingConsent(
  adminClient: SupabaseClient,
  input: {
    marketingContactId: string;
    actorId: string;
    consentStatus: MarketingConsentStatus | string;
    lawfulBasis: MarketingLawfulBasis | string;
    consentSource: string;
    consentRecordedAt?: string;
    evidenceNote?: string;
  }
) {
  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  if (existing.suppressed_at || existing.status === "suppressed") {
    throw new Error("Suppressed contacts cannot be made sendable by consent alone.");
  }
  if (existing.unsubscribe_at || existing.status === "unsubscribed") {
    throw new Error("Unsubscribed contacts require a new explicit consent review.");
  }

  const nextStatus = deriveStatusFromConsent({
    consentStatus: input.consentStatus,
    lawfulBasis: input.lawfulBasis,
  });
  if (nextStatus === "subscribed" && input.consentStatus !== "granted") {
    throw new Error("Subscribed status requires granted consent.");
  }
  if (
    nextStatus === "eligible_customer" &&
    input.lawfulBasis !== "existing_customer_similar_services"
  ) {
    throw new Error("Eligible customer status requires a valid existing-customer lawful basis.");
  }

  const recordedAt = input.consentRecordedAt || new Date().toISOString();
  const update = {
    consent_status: input.consentStatus,
    lawful_basis: input.lawfulBasis,
    consent_source: input.consentSource,
    consent_recorded_at: recordedAt,
    consent_withdrawn_at: null,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminClient
    .from("crm_marketing_contacts")
    .update(update)
    .eq("id", input.marketingContactId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "consent_recorded",
    actorId: input.actorId,
    marketingContactId: input.marketingContactId,
    crmContactId: existing.crm_contact_id,
    crmOrganisationId: existing.crm_organisation_id,
    previousValue: existing,
    newValue: data,
    source: "marketing_admin",
    reason: input.evidenceNote || null,
  });

  return data;
}

export async function withdrawMarketingConsent(
  adminClient: SupabaseClient,
  input: { marketingContactId: string; actorId: string; reason?: string }
) {
  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  const update = {
    consent_status: "withdrawn",
    lawful_basis: "none",
    consent_withdrawn_at: new Date().toISOString(),
    status: "pending_consent",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminClient
    .from("crm_marketing_contacts")
    .update(update)
    .eq("id", input.marketingContactId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "consent_withdrawn",
    actorId: input.actorId,
    marketingContactId: input.marketingContactId,
    crmContactId: existing.crm_contact_id,
    crmOrganisationId: existing.crm_organisation_id,
    previousValue: existing,
    newValue: data,
    source: "marketing_admin",
    reason: input.reason || null,
  });

  return data;
}

export async function markMarketingUnsubscribed(
  adminClient: SupabaseClient,
  input: {
    marketingContactId: string;
    actorId?: string | null;
    source?: string;
    reason?: string;
  }
) {
  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  const now = new Date().toISOString();
  const update = {
    status: "unsubscribed",
    consent_status: "withdrawn",
    lawful_basis: "none",
    unsubscribe_at: existing.unsubscribe_at || now,
    updated_at: now,
  };

  const { data, error } = await adminClient
    .from("crm_marketing_contacts")
    .update(update)
    .eq("id", input.marketingContactId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "unsubscribed",
    actorId: input.actorId ?? null,
    marketingContactId: input.marketingContactId,
    crmContactId: existing.crm_contact_id,
    crmOrganisationId: existing.crm_organisation_id,
    previousValue: existing,
    newValue: data,
    source: input.source || "marketing_admin",
    reason: input.reason || null,
  });

  return data;
}

export async function suppressMarketingContact(
  adminClient: SupabaseClient,
  input: {
    marketingContactId: string;
    actorId: string;
    suppressionReason: SuppressionReason | string;
    note?: string;
    source?: string;
  }
) {
  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  const update = {
    status: "suppressed",
    suppressed_at: new Date().toISOString(),
    suppression_reason: input.suppressionReason,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminClient
    .from("crm_marketing_contacts")
    .update(update)
    .eq("id", input.marketingContactId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "suppressed",
    actorId: input.actorId,
    marketingContactId: input.marketingContactId,
    crmContactId: existing.crm_contact_id,
    crmOrganisationId: existing.crm_organisation_id,
    previousValue: existing,
    newValue: data,
    source: input.source || "marketing_admin",
    reason: input.note || input.suppressionReason,
  });

  return data;
}

export async function removeMarketingSuppression(
  adminClient: SupabaseClient,
  input: { marketingContactId: string; actorId: string; reason: string }
) {
  if (!input.reason.trim()) {
    throw new Error("A reason is required to remove suppression.");
  }

  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  if (!existing.suppressed_at && existing.status !== "suppressed") {
    throw new Error("Contact is not suppressed.");
  }

  const eligibility = evaluateMarketingEligibility({
    email: existing.email,
    status: "pending_consent",
    consentStatus: existing.consent_status,
    lawfulBasis: existing.lawful_basis,
    unsubscribeAt: existing.unsubscribe_at,
    suppressedAt: null,
  });

  const nextStatus = existing.unsubscribe_at
    ? "unsubscribed"
    : eligibility.status || "pending_consent";

  const update = {
    status: nextStatus,
    suppressed_at: null,
    suppression_reason: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminClient
    .from("crm_marketing_contacts")
    .update(update)
    .eq("id", input.marketingContactId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "suppression_removed",
    actorId: input.actorId,
    marketingContactId: input.marketingContactId,
    crmContactId: existing.crm_contact_id,
    crmOrganisationId: existing.crm_organisation_id,
    previousValue: existing,
    newValue: data,
    source: "marketing_admin",
    reason: input.reason,
  });

  return data;
}

export async function addMarketingContactToList(
  adminClient: SupabaseClient,
  input: {
    marketingContactId: string;
    listId: string;
    actorId: string;
    source?: string;
  }
) {
  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  if (existing.unsubscribe_at || existing.status === "unsubscribed") {
    throw new Error("Unsubscribed contacts cannot be reactivated through list membership.");
  }

  const { data: list } = await adminClient
    .from("crm_marketing_lists")
    .select("id, active, is_system")
    .eq("id", input.listId)
    .single();
  if (!list?.active) throw new Error("List is not active.");

  const { error } = await adminClient.from("crm_marketing_list_members").upsert(
    {
      marketing_contact_id: input.marketingContactId,
      marketing_list_id: input.listId,
      source: input.source || "marketing_admin",
      added_by: input.actorId,
    },
    { onConflict: "marketing_contact_id,marketing_list_id" }
  );
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "added_to_list",
    actorId: input.actorId,
    marketingContactId: input.marketingContactId,
    crmContactId: existing.crm_contact_id,
    crmOrganisationId: existing.crm_organisation_id,
    marketingListId: input.listId,
    newValue: { listId: input.listId },
    source: input.source || "marketing_admin",
  });
}

export async function removeMarketingContactFromList(
  adminClient: SupabaseClient,
  input: {
    marketingContactId: string;
    listId: string;
    actorId: string;
    source?: string;
  }
) {
  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  const { error } = await adminClient
    .from("crm_marketing_list_members")
    .delete()
    .eq("marketing_contact_id", input.marketingContactId)
    .eq("marketing_list_id", input.listId);
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "removed_from_list",
    actorId: input.actorId,
    marketingContactId: input.marketingContactId,
    crmContactId: existing.crm_contact_id,
    crmOrganisationId: existing.crm_organisation_id,
    marketingListId: input.listId,
    previousValue: { listId: input.listId },
    source: input.source || "marketing_admin",
  });
}

export async function refreshMarketingEmailFromCrm(
  adminClient: SupabaseClient,
  input: { marketingContactId: string; actorId: string }
) {
  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  const { data: contact, error: contactError } = await adminClient
    .from("crm_contacts")
    .select("email, organisation_id")
    .eq("id", existing.crm_contact_id)
    .single();
  if (contactError || !contact) throw new Error("CRM contact not found.");

  const emailNorm = normaliseMarketingEmail(contact.email as string | null);
  const update: Record<string, unknown> = {
    email: contact.email,
    email_normalised: emailNorm,
    crm_organisation_id: contact.organisation_id,
    updated_at: new Date().toISOString(),
  };

  if (!isTerminalProtected(existing) && !emailNorm) {
    update.status = "invalid_email";
  }

  const { data, error } = await adminClient
    .from("crm_marketing_contacts")
    .update(update)
    .eq("id", input.marketingContactId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "marketing_contact_updated",
    actorId: input.actorId,
    marketingContactId: input.marketingContactId,
    crmContactId: existing.crm_contact_id,
    crmOrganisationId: existing.crm_organisation_id,
    previousValue: existing,
    newValue: data,
    source: "refresh_email_from_crm",
  });

  return data;
}

export async function createManualMarketingList(
  adminClient: SupabaseClient,
  input: { name: string; description?: string; actorId: string }
) {
  const slug = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const { data, error } = await adminClient
    .from("crm_marketing_lists")
    .insert({
      slug: `${slug}-${Date.now().toString(36)}`,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      list_type: "manual",
      is_system: false,
      active: true,
      created_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateManualMarketingList(
  adminClient: SupabaseClient,
  input: {
    listId: string;
    name?: string;
    description?: string;
    active?: boolean;
    actorId: string;
  }
) {
  const { data: list } = await adminClient
    .from("crm_marketing_lists")
    .select("id, is_system")
    .eq("id", input.listId)
    .single();
  if (!list) throw new Error("List not found.");
  if (list.is_system && input.name) {
    throw new Error("System list identity cannot be changed.");
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name) update.name = input.name.trim();
  if (input.description !== undefined) update.description = input.description?.trim() || null;
  if (input.active !== undefined) update.active = input.active;

  const { data, error } = await adminClient
    .from("crm_marketing_lists")
    .update(update)
    .eq("id", input.listId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function archiveManualMarketingList(
  adminClient: SupabaseClient,
  input: { listId: string; actorId: string }
) {
  const { data: list } = await adminClient
    .from("crm_marketing_lists")
    .select("id, is_system")
    .eq("id", input.listId)
    .single();
  if (!list) throw new Error("List not found.");
  if (list.is_system) throw new Error("System lists cannot be archived.");

  return updateManualMarketingList(adminClient, {
    listId: input.listId,
    active: false,
    actorId: input.actorId,
  });
}

export async function processPublicUnsubscribe(
  adminClient: SupabaseClient,
  input: { marketingContactId: string; emailNormalised: string }
) {
  const existing = await loadMarketingContact(adminClient, input.marketingContactId);
  if (
    existing.email_normalised &&
    existing.email_normalised !== input.emailNormalised
  ) {
    throw new Error("Unsubscribe token does not match current email identity.");
  }

  return markMarketingUnsubscribed(adminClient, {
    marketingContactId: input.marketingContactId,
    actorId: null,
    source: "unsubscribe_link",
    reason: "Public unsubscribe link",
  });
}
