import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultMarketingStatusForPipelineClose,
  normaliseMarketingEmail,
} from "./eligibility";
import { normaliseAudienceDefinition } from "./audience-definition";
import { fetchOrganisationMarketplaceCounts } from "@/lib/crm-desktop/organisation-marketplace-counts";

type CrmContactRow = {
  id: string;
  organisation_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  crm_organisations: {
    id: string;
    name: string;
    type: string | null;
    pipeline_stage: string | null;
  } | null;
};

function matchesMarketplaceFilter(
  orgId: string | null,
  pipelineStage: string | null,
  filter: string,
  counts: { hasLinkedProperties: boolean; hasLinkedSpaces: boolean }
): boolean {
  switch (filter) {
    case "has_linked_property":
      return counts.hasLinkedProperties;
    case "has_linked_spaces":
      return counts.hasLinkedSpaces;
    case "listed_organisations":
      return pipelineStage === "listed";
    case "signed_up_not_listed":
      return pipelineStage === "signed_up";
    case "no_property_linked":
      return !counts.hasLinkedProperties;
    case "no_spaces":
      return !counts.hasLinkedSpaces;
    case "active_listing":
      return pipelineStage === "listed" && counts.hasLinkedSpaces;
    case "unclaimed_listing":
      return counts.hasLinkedSpaces && pipelineStage !== "listed";
    default:
      return true;
  }
}

export async function ensureMarketingContactForCrmContact(
  adminClient: SupabaseClient,
  contact: CrmContactRow,
  actorId?: string | null
): Promise<string> {
  const { data: existing } = await adminClient
    .from("crm_marketing_contacts")
    .select("id, status, unsubscribe_at, suppressed_at")
    .eq("crm_contact_id", contact.id)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const defaults = defaultMarketingStatusForPipelineClose();
  const email = contact.email?.trim() || null;
  const emailNormalised = normaliseMarketingEmail(email);

  const { data, error } = await adminClient
    .from("crm_marketing_contacts")
    .insert({
      crm_contact_id: contact.id,
      crm_organisation_id: contact.organisation_id,
      email,
      email_normalised: emailNormalised,
      status: defaults.status,
      consent_status: defaults.consentStatus,
      lawful_basis: defaults.lawfulBasis,
      created_from: "audience_builder",
      created_by: actorId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    const { data: raced } = await adminClient
      .from("crm_marketing_contacts")
      .select("id")
      .eq("crm_contact_id", contact.id)
      .maybeSingle();
    if (raced?.id) return raced.id as string;
    throw new Error(error.message);
  }

  return data.id as string;
}

export async function resolveAudienceMarketingContactIds(
  adminClient: SupabaseClient,
  rawDefinition: unknown,
  actorId?: string | null
): Promise<{
  marketingContactIds: string[];
  matchedCrmContactIds: string[];
}> {
  const definition = normaliseAudienceDefinition(rawDefinition);
  const crmContactIds = new Set<string>();

  if (definition.mode === "all_crm_contacts") {
    const { data } = await adminClient.from("crm_contacts").select("id");
    for (const row of data || []) crmContactIds.add(row.id as string);
  } else {
    if (definition.listIds?.length) {
      const { data: members } = await adminClient
        .from("crm_marketing_list_members")
        .select("marketing_contact_id, crm_marketing_contacts ( crm_contact_id )")
        .in("marketing_list_id", definition.listIds);
      for (const row of members || []) {
        const mc = row.crm_marketing_contacts as unknown as { crm_contact_id: string } | null;
        if (mc?.crm_contact_id) crmContactIds.add(mc.crm_contact_id);
      }
    }

    const needsOrgFilter =
      Boolean(definition.pipelineStages?.length) ||
      Boolean(definition.organisationTypes?.length) ||
      Boolean(definition.marketplaceFilters?.length) ||
      Boolean(definition.manualIncludeContactIds?.length);

    if (needsOrgFilter) {
      const { data: contacts } = await adminClient
        .from("crm_contacts")
        .select(
          `id, organisation_id, email, first_name, last_name, full_name,
           crm_organisations ( id, name, type, pipeline_stage )`
        );

      const orgIds = [
        ...new Set(
          ((contacts || []) as unknown as CrmContactRow[])
            .map((c) => c.organisation_id)
            .filter(Boolean) as string[]
        ),
      ];
      const marketplaceMap = definition.marketplaceFilters?.length
        ? await fetchOrganisationMarketplaceCounts(adminClient, orgIds)
        : new Map();

      for (const contact of (contacts || []) as unknown as CrmContactRow[]) {
        const org = contact.crm_organisations;
        const orgId = contact.organisation_id;
        const stage = org?.pipeline_stage ?? null;
        const orgType = org?.type ?? null;
        const counts = orgId
          ? marketplaceMap.get(orgId) || {
              hasLinkedProperties: false,
              hasLinkedSpaces: false,
            }
          : { hasLinkedProperties: false, hasLinkedSpaces: false };

        let matches = false;

        if (definition.manualIncludeContactIds?.includes(contact.id)) {
          matches = true;
        }

        if (!matches && definition.pipelineStages?.length && stage) {
          if (definition.pipelineStages.includes(stage)) matches = true;
        }

        if (!matches && definition.organisationTypes?.length && orgType) {
          if (definition.organisationTypes.includes(orgType)) matches = true;
        }

        if (!matches && definition.marketplaceFilters?.length && orgId) {
          for (const filter of definition.marketplaceFilters) {
            if (matchesMarketplaceFilter(orgId, stage, filter, counts)) {
              matches = true;
              break;
            }
          }
        }

        if (matches) crmContactIds.add(contact.id);
      }
    }

    for (const id of definition.manualIncludeContactIds || []) {
      crmContactIds.add(id);
    }
  }

  for (const id of definition.manualExcludeContactIds || []) {
    crmContactIds.delete(id);
  }

  const matchedCrmContactIds = [...crmContactIds];
  const marketingContactIds: string[] = [];

  if (!matchedCrmContactIds.length) {
    return { marketingContactIds, matchedCrmContactIds };
  }

  const { data: contactRows } = await adminClient
    .from("crm_contacts")
    .select(
      `id, organisation_id, email, first_name, last_name, full_name,
       crm_organisations ( id, name, type, pipeline_stage )`
    )
    .in("id", matchedCrmContactIds);

  for (const contact of (contactRows || []) as unknown as CrmContactRow[]) {
    const marketingId = await ensureMarketingContactForCrmContact(
      adminClient,
      contact,
      actorId
    );
    marketingContactIds.push(marketingId);
  }

  return {
    marketingContactIds: [...new Set(marketingContactIds)],
    matchedCrmContactIds,
  };
}
