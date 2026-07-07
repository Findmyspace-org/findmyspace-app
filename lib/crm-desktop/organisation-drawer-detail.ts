import { adminApiFetch } from "@/lib/admin-api-client";
import { crmDb } from "@/lib/space-place/db";
import type {
  CrmContact,
  CrmOrganisation,
  CrmProfile,
  CrmTask,
  CrmEmailMessageWithRelations,
} from "@/lib/space-place/types";
import type { SpaceEngagementRow } from "@/app/space-place/components/SpaceActivityHistory";
import {
  fetchOrganisationDrawerMarketplace,
  type DrawerMarketplaceCounts,
  type DrawerMarketplaceListing,
  type DrawerMarketplaceProperty,
} from "./organisation-drawer-marketplace";

export type {
  DrawerMarketplaceCounts,
  DrawerMarketplaceListing,
  DrawerMarketplaceProperty,
} from "./organisation-drawer-marketplace";
export {
  marketplaceCountsEqual,
  reloadOrganisationDrawerMarketplace,
} from "./organisation-drawer-marketplace";

export type MarketingOrgSummary = {
  total: number;
  sendable: number;
  pending: number;
  blocked: number;
  lists: string[];
};

export type OrganisationDrawerDetail = {
  org: CrmOrganisation | null;
  contacts: CrmContact[];
  tasks: CrmTask[];
  engagements: SpaceEngagementRow[];
  emails: CrmEmailMessageWithRelations[];
  spacers: CrmProfile[];
  marketingSummary: MarketingOrgSummary | null;
  marketplace: {
    listings: DrawerMarketplaceListing[];
    properties: DrawerMarketplaceProperty[];
    counts: DrawerMarketplaceCounts;
    error: string | null;
  };
};

async function fetchMarketingSummary(
  organisationId: string,
  signal?: AbortSignal
): Promise<MarketingOrgSummary | null> {
  try {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const json = await adminApiFetch(
      `/api/admin/crm/marketing/org-summary?organisationId=${organisationId}`,
      { signal }
    );
    return (json.summary as MarketingOrgSummary) ?? null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return null;
  }
}

export async function loadOrganisationDrawerDetail(
  organisationId: string,
  options?: { signal?: AbortSignal }
): Promise<OrganisationDrawerDetail> {
  const signal = options?.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  };

  throwIfAborted();

  const [o, c, t, e, em, p, marketplace, marketingSummary] = await Promise.all([
    crmDb.organisations().select("*").eq("id", organisationId).single(),
    crmDb.contacts().select("*").eq("organisation_id", organisationId),
    crmDb.tasks().select("*").eq("organisation_id", organisationId).order("due_date"),
    crmDb
      .engagements()
      .select(`*, crm_contacts ( id, full_name, first_name, last_name )`)
      .eq("organisation_id", organisationId)
      .order("occurred_at", { ascending: false })
      .limit(30),
    crmDb
      .emailMessages()
      .select(`*, crm_contacts ( id, full_name, email ), crm_organisations ( id, name )`)
      .eq("organisation_id", organisationId)
      .order("sent_at", { ascending: false })
      .limit(20),
    crmDb.profiles().select("*").eq("active", true).order("full_name"),
    fetchOrganisationDrawerMarketplace(organisationId, signal),
    fetchMarketingSummary(organisationId, signal),
  ]);

  throwIfAborted();

  const { data: profs } = await crmDb.profiles().select("id, full_name");
  throwIfAborted();

  const creatorMap = Object.fromEntries(
    ((profs as { id: string; full_name: string | null }[]) || []).map((x) => [
      x.id,
      x.full_name,
    ])
  );

  const engagementList = ((e.data as SpaceEngagementRow[]) || []).map((eng) => ({
    ...eng,
    contact: eng.crm_contacts ?? null,
    creator: eng.created_by
      ? { id: eng.created_by, full_name: creatorMap[eng.created_by] ?? null }
      : null,
  }));

  return {
    org: (o.data as CrmOrganisation) || null,
    contacts: (c.data as CrmContact[]) || [],
    tasks: (t.data as CrmTask[]) || [],
    engagements: engagementList,
    emails: (em.data as CrmEmailMessageWithRelations[]) || [],
    spacers: (p.data as CrmProfile[]) || [],
    marketingSummary,
    marketplace,
  };
}
