import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmOrganisationListRow } from "./types";
import {
  emptyOrganisationMarketplaceCounts,
  fetchOrganisationMarketplaceCounts,
} from "./organisation-marketplace-counts";

export function patchOrganisationRowMarketplaceCounts(
  row: CrmOrganisationListRow,
  counts: {
    linkedPropertyCount: number;
    linkedSpaceCount: number;
  }
): CrmOrganisationListRow {
  return {
    ...row,
    property_count: counts.linkedPropertyCount,
    space_count: counts.linkedSpaceCount,
  };
}

export async function loadOrganisationMarketplaceCountsForRow(
  adminClient: SupabaseClient,
  organisationId: string
) {
  const map = await fetchOrganisationMarketplaceCounts(adminClient, [
    organisationId,
  ]);
  return map.get(organisationId) ?? emptyOrganisationMarketplaceCounts();
}

export async function patchOrganisationRowFromMarketplace(
  adminClient: SupabaseClient,
  row: CrmOrganisationListRow
): Promise<CrmOrganisationListRow> {
  const counts = await loadOrganisationMarketplaceCountsForRow(
    adminClient,
    row.id
  );
  return patchOrganisationRowMarketplaceCounts(row, {
    linkedPropertyCount: counts.linkedPropertyCount,
    linkedSpaceCount: counts.linkedSpaceCount,
  });
}
