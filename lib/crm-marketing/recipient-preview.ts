import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateMarketingEligibility,
  normaliseMarketingEmail,
} from "./eligibility";
import type { RecipientPreviewResult } from "./types";

type PreviewCandidate = {
  marketingContactId: string;
  crmContactId: string;
  crmOrganisationId: string | null;
  contactName: string;
  organisationName: string | null;
  email: string | null;
  emailNormalised: string | null;
  status: string;
  consentStatus: string;
  lawfulBasis: string;
  unsubscribeAt: string | null;
  suppressedAt: string | null;
  pipelineStage: string | null;
};

export type RecipientPreviewInput = {
  listIds?: string[];
  marketingContactIds?: string[];
  filters?: Record<string, string | undefined>;
};

function contactDisplayName(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  if (row.full_name?.trim()) return row.full_name.trim();
  const parts = [row.first_name, row.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "Unnamed";
}

async function fetchCandidates(
  adminClient: SupabaseClient,
  input: RecipientPreviewInput
): Promise<PreviewCandidate[]> {
  const ids = new Set<string>();

  if (input.marketingContactIds?.length) {
    for (const id of input.marketingContactIds) ids.add(id);
  }

  if (input.listIds?.length) {
    const { data: members } = await adminClient
      .from("crm_marketing_list_members")
      .select("marketing_contact_id")
      .in("marketing_list_id", input.listIds);
    for (const row of members || []) {
      ids.add(row.marketing_contact_id as string);
    }
  }

  let query = adminClient.from("crm_marketing_contacts").select(
    `
      id, crm_contact_id, crm_organisation_id, email, email_normalised,
      status, consent_status, lawful_basis, unsubscribe_at, suppressed_at,
      crm_contacts ( full_name, first_name, last_name ),
      crm_organisations ( name, pipeline_stage )
    `
  );

  if (ids.size > 0) {
    query = query.in("id", [...ids]);
  }

  const filters = input.filters || {};
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.consent) query = query.eq("consent_status", filters.consent);
  if (filters.basis) query = query.eq("lawful_basis", filters.basis);
  if (filters.org) query = query.eq("crm_organisation_id", filters.org);
  if (filters.q?.trim()) query = query.ilike("email", `%${filters.q.trim()}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((row) => {
    const contact = row.crm_contacts as unknown as {
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
    } | null;
    const org = row.crm_organisations as unknown as {
      name: string;
      pipeline_stage: string;
    } | null;
    return {
      marketingContactId: row.id as string,
      crmContactId: row.crm_contact_id as string,
      crmOrganisationId: (row.crm_organisation_id as string | null) ?? null,
      contactName: contact ? contactDisplayName(contact) : "Unknown",
      organisationName: org?.name ?? null,
      email: (row.email as string | null) ?? null,
      emailNormalised:
        (row.email_normalised as string | null) ??
        normaliseMarketingEmail(row.email as string | null),
      status: row.status as string,
      consentStatus: row.consent_status as string,
      lawfulBasis: row.lawful_basis as string,
      unsubscribeAt: (row.unsubscribe_at as string | null) ?? null,
      suppressedAt: (row.suppressed_at as string | null) ?? null,
      pipelineStage: org?.pipeline_stage ?? null,
    };
  });
}

export async function buildRecipientPreview(
  adminClient: SupabaseClient,
  input: RecipientPreviewInput
): Promise<RecipientPreviewResult> {
  const candidates = await fetchCandidates(adminClient, input);
  const exclusionCounts: Record<string, number> = {};
  const eligible: RecipientPreviewResult["eligible"] = [];
  const excluded: RecipientPreviewResult["excluded"] = [];
  const emailPrimary = new Map<string, string>();

  for (const candidate of candidates) {
    const eligibility = evaluateMarketingEligibility({
      email: candidate.email,
      status: candidate.status,
      consentStatus: candidate.consentStatus,
      lawfulBasis: candidate.lawfulBasis,
      unsubscribeAt: candidate.unsubscribeAt,
      suppressedAt: candidate.suppressedAt,
      pipelineStage: candidate.pipelineStage,
    });

    const isDuplicateEmail =
      Boolean(candidate.emailNormalised) && emailPrimary.has(candidate.emailNormalised!);

    if (isDuplicateEmail) {
      exclusionCounts["Duplicate email"] = (exclusionCounts["Duplicate email"] || 0) + 1;
      excluded.push({
        marketingContactId: candidate.marketingContactId,
        contactName: candidate.contactName,
        email: candidate.email,
        reason: "Duplicate email",
      });
      continue;
    }

    if (!eligibility.sendable) {
      const reason = eligibility.reason;
      exclusionCounts[reason] = (exclusionCounts[reason] || 0) + 1;
      excluded.push({
        marketingContactId: candidate.marketingContactId,
        contactName: candidate.contactName,
        email: candidate.email,
        reason,
      });
      continue;
    }

    if (candidate.emailNormalised) {
      emailPrimary.set(candidate.emailNormalised, candidate.marketingContactId);
    }
    eligible.push({
      marketingContactId: candidate.marketingContactId,
      contactName: candidate.contactName,
      organisationName: candidate.organisationName,
      email: candidate.email,
    });
  }

  return {
    totalMatching: candidates.length,
    eligibleRecipients: eligible.length,
    excludedRecipients: excluded.length,
    uniqueRecipientCount: eligible.length,
    duplicateEmailCount: exclusionCounts["Duplicate email"] || 0,
    exclusionCounts,
    eligible,
    excluded,
  };
}

export async function countDuplicateEmails(adminClient: SupabaseClient): Promise<number> {
  const { data } = await adminClient
    .from("crm_marketing_contacts")
    .select("email_normalised")
    .not("email_normalised", "is", null);

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const email = row.email_normalised as string;
    counts.set(email, (counts.get(email) || 0) + 1);
  }
  let duplicates = 0;
  for (const count of counts.values()) {
    if (count > 1) duplicates += count;
  }
  return duplicates;
}
