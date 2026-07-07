import type { SupabaseClient } from "@supabase/supabase-js";

export type OrganisationMarketplaceCounts = {
  linkedPropertyCount: number;
  linkedSpaceCount: number;
  hasLinkedProperties: boolean;
  hasLinkedSpaces: boolean;
};

type PropertyRow = { id: string; crm_organisation_id: string | null };
type SpaceRow = {
  id: string;
  crm_organisation_id: string | null;
  property_id: string | null;
};

/**
 * Count marketplace properties and spaces linked to CRM organisations.
 * Spaces include direct CRM links and spaces under linked properties (deduped).
 */
export async function fetchOrganisationMarketplaceCounts(
  adminClient: SupabaseClient,
  organisationIds: string[]
): Promise<Map<string, OrganisationMarketplaceCounts>> {
  const result = new Map<string, OrganisationMarketplaceCounts>();
  if (!organisationIds.length) return result;

  for (const id of organisationIds) {
    result.set(id, {
      linkedPropertyCount: 0,
      linkedSpaceCount: 0,
      hasLinkedProperties: false,
      hasLinkedSpaces: false,
    });
  }

  const { data: properties, error: propertiesErr } = await adminClient
    .from("properties")
    .select("id, crm_organisation_id")
    .in("crm_organisation_id", organisationIds)
    .is("archived_at", null);

  if (propertiesErr) throw propertiesErr;

  const propertyRows = (properties || []) as PropertyRow[];
  const propertyIds = propertyRows.map((row) => row.id);
  const propertyOrgById = new Map(
    propertyRows.map((row) => [row.id, row.crm_organisation_id])
  );

  for (const row of propertyRows) {
    if (!row.crm_organisation_id) continue;
    const entry = result.get(row.crm_organisation_id)!;
    entry.linkedPropertyCount += 1;
    entry.hasLinkedProperties = true;
  }

  const spaceIdsByOrg = new Map<string, Set<string>>();
  for (const orgId of organisationIds) {
    spaceIdsByOrg.set(orgId, new Set());
  }

  const { data: directSpaces, error: directErr } = await adminClient
    .from("spaces")
    .select("id, crm_organisation_id, property_id")
    .in("crm_organisation_id", organisationIds)
    .neq("status", "deleted");

  if (directErr) throw directErr;

  for (const space of (directSpaces || []) as SpaceRow[]) {
    if (!space.crm_organisation_id) continue;
    spaceIdsByOrg.get(space.crm_organisation_id)?.add(space.id);
  }

  if (propertyIds.length > 0) {
    const { data: propertySpaces, error: propertySpacesErr } = await adminClient
      .from("spaces")
      .select("id, crm_organisation_id, property_id")
      .in("property_id", propertyIds)
      .neq("status", "deleted");

    if (propertySpacesErr) throw propertySpacesErr;

    for (const space of (propertySpaces || []) as SpaceRow[]) {
      if (!space.property_id) continue;
      const orgId = propertyOrgById.get(space.property_id);
      if (!orgId) continue;
      spaceIdsByOrg.get(orgId)?.add(space.id);
    }
  }

  for (const orgId of organisationIds) {
    const entry = result.get(orgId)!;
    const count = spaceIdsByOrg.get(orgId)?.size ?? 0;
    entry.linkedSpaceCount = count;
    entry.hasLinkedSpaces = count > 0;
  }

  return result;
}

export function emptyOrganisationMarketplaceCounts(): OrganisationMarketplaceCounts {
  return {
    linkedPropertyCount: 0,
    linkedSpaceCount: 0,
    hasLinkedProperties: false,
    hasLinkedSpaces: false,
  };
}
