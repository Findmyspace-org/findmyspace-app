export type PropertyOwnershipRow = {
  owner_id: string | null;
  owner_accepted_at: string | null;
};

/** Property invite accepted — child spaces inherit venue ownership. */
export function isInheritedPropertyOwnership(
  ownerId: string,
  property: PropertyOwnershipRow | null | undefined,
  spacePropertyId: string | null | undefined
): boolean {
  return Boolean(
    spacePropertyId &&
      property &&
      property.owner_id === ownerId &&
      property.owner_accepted_at
  );
}
