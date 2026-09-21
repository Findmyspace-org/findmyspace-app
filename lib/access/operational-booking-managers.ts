/**
 * Who operationally handles bookings for a space.
 *
 * Space Managers (active) are primary. If none, Organisation Admins are
 * fallback recipients. Property Managers and Global Admins may still act
 * via the access resolver, but are not routine notification recipients.
 *
 * Temporary 066 notification bridge uses recipientUserIds. Full fan-out is 067.
 */

export type OperationalManagerKind =
  | "space_managers"
  | "org_admins"
  | "legacy_owner"
  | "none";

export type OperationalBookingManagers = {
  organisationId: string | null;
  spaceOwnerId: string | null;
  propertyOwnerId: string | null;
  kind: OperationalManagerKind;
  recipientUserIds: string[];
  canAcceptPublicBooking: boolean;
};

export function computeOperationalBookingManagers(input: {
  organisationId: string | null;
  spaceOwnerId: string | null;
  propertyOwnerId: string | null;
  activeSpaceManagerUserIds: string[];
  activeOrgAdminUserIds: string[];
}): OperationalBookingManagers {
  const spaceManagers = uniqueIds(input.activeSpaceManagerUserIds);
  const orgAdmins = uniqueIds(input.activeOrgAdminUserIds);
  const organisationId = input.organisationId;
  const spaceOwnerId = input.spaceOwnerId;
  const propertyOwnerId = input.propertyOwnerId;

  if (spaceManagers.length > 0) {
    return {
      organisationId,
      spaceOwnerId,
      propertyOwnerId,
      kind: "space_managers",
      recipientUserIds: spaceManagers,
      canAcceptPublicBooking: true,
    };
  }

  if (organisationId && orgAdmins.length > 0) {
    return {
      organisationId,
      spaceOwnerId,
      propertyOwnerId,
      kind: "org_admins",
      recipientUserIds: orgAdmins,
      canAcceptPublicBooking: true,
    };
  }

  if (spaceOwnerId) {
    return {
      organisationId,
      spaceOwnerId,
      propertyOwnerId,
      kind: "legacy_owner",
      recipientUserIds: [spaceOwnerId],
      canAcceptPublicBooking: true,
    };
  }

  if (!organisationId && propertyOwnerId) {
    return {
      organisationId,
      spaceOwnerId,
      propertyOwnerId,
      kind: "legacy_owner",
      recipientUserIds: [propertyOwnerId],
      canAcceptPublicBooking: true,
    };
  }

  return {
    organisationId,
    spaceOwnerId,
    propertyOwnerId,
    kind: "none",
    recipientUserIds: [],
    canAcceptPublicBooking: false,
  };
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

export function snapshotBookingOwnership(input: {
  spaceOwnerId: string | null;
  organisationId: string | null;
}): {
  ownerId: string | null;
  organisationId: string | null;
} {
  return {
    ownerId: input.spaceOwnerId,
    organisationId: input.organisationId,
  };
}
