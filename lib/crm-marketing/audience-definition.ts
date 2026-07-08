export type MarketplaceAudienceFilter =
  | "has_linked_property"
  | "has_linked_spaces"
  | "listed_organisations"
  | "signed_up_not_listed"
  | "no_property_linked"
  | "no_spaces"
  | "active_listing"
  | "unclaimed_listing";

export type CampaignAudienceDefinition = {
  mode?: "all_crm_contacts" | "filtered";
  listIds?: string[];
  pipelineStages?: string[];
  organisationTypes?: string[];
  marketplaceFilters?: MarketplaceAudienceFilter[];
  manualIncludeContactIds?: string[];
  manualExcludeContactIds?: string[];
  savedFilters?: Record<string, string | undefined>;
};

export const MARKETPLACE_AUDIENCE_FILTER_LABELS: Record<
  MarketplaceAudienceFilter,
  string
> = {
  has_linked_property: "Has linked property",
  has_linked_spaces: "Has linked spaces",
  listed_organisations: "Listed organisations",
  signed_up_not_listed: "Signed up but not listed",
  no_property_linked: "No property linked",
  no_spaces: "No spaces",
  active_listing: "Active listing",
  unclaimed_listing: "Unclaimed listing",
};

export function normaliseAudienceDefinition(
  raw: unknown
): CampaignAudienceDefinition {
  if (!raw || typeof raw !== "object") return { mode: "filtered" };
  const value = raw as CampaignAudienceDefinition;
  return {
    mode: value.mode || "filtered",
    listIds: [...new Set(value.listIds || [])],
    pipelineStages: [...new Set(value.pipelineStages || [])],
    organisationTypes: [...new Set(value.organisationTypes || [])],
    marketplaceFilters: [...new Set(value.marketplaceFilters || [])],
    manualIncludeContactIds: [...new Set(value.manualIncludeContactIds || [])],
    manualExcludeContactIds: [...new Set(value.manualExcludeContactIds || [])],
    savedFilters: value.savedFilters || {},
  };
}

export function audienceDefinitionIsEmpty(def: CampaignAudienceDefinition): boolean {
  if (def.mode === "all_crm_contacts") return false;
  return (
    !(def.listIds?.length) &&
    !(def.pipelineStages?.length) &&
    !(def.organisationTypes?.length) &&
    !(def.marketplaceFilters?.length) &&
    !(def.manualIncludeContactIds?.length) &&
    !Object.values(def.savedFilters || {}).some(Boolean)
  );
}
