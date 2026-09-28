/**
 * Billable inventory for subscription tier matching.
 *
 * Count currently managed inventory, not historical rows.
 * Pausing a listing must not drop a tier. Archiving/deleting does.
 *
 * Space statuses come from public.spaces_status_check (migration 014).
 */

/** Canonical `spaces.status` values from `spaces_status_check`. */
export const SPACE_STATUS_CHECK_VALUES = [
  "draft",
  "unclaimed",
  "owner_claimed",
  "pending_verification",
  "needs_changes",
  "approved",
  "pending",
  "active",
  "paused",
  "rejected",
  "deleted",
] as const;

export type SpaceStatusCheckValue = (typeof SPACE_STATUS_CHECK_VALUES)[number];

/** Managed/usable inventory. `approved` is schema-valid and treated as in-pipeline. */
export const BILLABLE_SPACE_INCLUDED_STATUSES = [
  "draft",
  "owner_claimed",
  "pending_verification",
  "needs_changes",
  "approved",
  "pending",
  "active",
  "paused",
] as const;

export const BILLABLE_SPACE_EXCLUDED_STATUSES = [
  "unclaimed",
  "rejected",
  "deleted",
] as const;

export type BillableOrganisationInput = {
  id?: string | null;
  status?: string | null;
  archived_at?: string | null;
};

export type BillablePropertyInput = {
  id: string;
  organisation_id?: string | null;
  archived_at?: string | null;
};

export type BillableSpaceInput = {
  id: string;
  property_id?: string | null;
  status?: string | null;
  archived_at?: string | null;
};

export type BillableInventoryScope = "organisation" | "property" | "space";

export type BillableInventoryCounts = {
  scopeType: BillableInventoryScope;
  scopeId: string;
  propertyCount: number;
  spaceCount: number;
  organisationBillable: boolean;
};

export function isBillableOrganisation(
  organisation: BillableOrganisationInput | null | undefined
): boolean {
  if (!organisation) return false;
  if (organisation.archived_at) return false;
  const status = (organisation.status || "").toLowerCase();
  if (status === "archived") return false;
  return true;
}

export function isBillableProperty(
  property: BillablePropertyInput | null | undefined
): boolean {
  if (!property) return false;
  return !property.archived_at;
}

export function isBillableSpace(
  space: BillableSpaceInput | null | undefined
): boolean {
  if (!space) return false;
  if (space.archived_at) return false;
  const status = (space.status || "").toLowerCase();
  return (BILLABLE_SPACE_INCLUDED_STATUSES as readonly string[]).includes(
    status
  );
}

export function countBillableInventory(input: {
  scopeType: BillableInventoryScope;
  scopeId: string;
  organisation?: BillableOrganisationInput | null;
  properties: BillablePropertyInput[];
  spaces: BillableSpaceInput[];
}): BillableInventoryCounts {
  const organisationBillable = isBillableOrganisation(input.organisation);

  if (input.scopeType === "organisation" && !organisationBillable) {
    return {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      propertyCount: 0,
      spaceCount: 0,
      organisationBillable: false,
    };
  }

  const properties = input.properties.filter((property) => {
    if (!isBillableProperty(property)) return false;
    if (input.scopeType === "organisation") {
      return property.organisation_id === input.scopeId;
    }
    if (input.scopeType === "property") {
      return property.id === input.scopeId;
    }
    return property.id === input.spaces.find((s) => s.id === input.scopeId)?.property_id;
  });

  const billablePropertyIds = new Set(properties.map((property) => property.id));

  const spaces = input.spaces.filter((space) => {
    if (!isBillableSpace(space)) return false;
    if (!space.property_id || !billablePropertyIds.has(space.property_id)) {
      return false;
    }
    if (input.scopeType === "space") {
      return space.id === input.scopeId;
    }
    if (input.scopeType === "property") {
      return space.property_id === input.scopeId;
    }
    return true;
  });

  if (input.scopeType === "space") {
    const space = input.spaces.find((row) => row.id === input.scopeId) ?? null;
    const property = input.properties.find(
      (row) => row.id === space?.property_id
    );
    const billable = isBillableSpace(space) && isBillableProperty(property);
    return {
      scopeType: "space",
      scopeId: input.scopeId,
      propertyCount: billable && property ? 1 : 0,
      spaceCount: billable ? 1 : 0,
      organisationBillable,
    };
  }

  return {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    propertyCount: properties.length,
    spaceCount: spaces.length,
    organisationBillable,
  };
}
