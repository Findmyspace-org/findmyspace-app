import type { OrganisationMarketplaceCounts } from "./organisation-marketplace-counts";

export type OrganisationMarketplaceWarning = {
  key: "no_properties" | "no_spaces";
  label: string;
};

export function resolveOrganisationMarketplaceWarnings(
  counts: Pick<
    OrganisationMarketplaceCounts,
    "linkedPropertyCount" | "linkedSpaceCount"
  >
): OrganisationMarketplaceWarning[] {
  if (counts.linkedPropertyCount === 0) {
    return [{ key: "no_properties", label: "No properties linked" }];
  }
  if (counts.linkedSpaceCount === 0) {
    return [{ key: "no_spaces", label: "No spaces" }];
  }
  return [];
}
