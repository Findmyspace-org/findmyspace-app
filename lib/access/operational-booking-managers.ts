/**
 * Who operationally handles bookings for a space.
 *
 * Space Managers (active) are primary. If none, Organisation Admins are
 * fallback recipients. Property Managers and Global Admins may still act
 * via the access resolver, but are not routine notification recipients.
 *
 * recipientUserIds = operational handlers.
 * notifyUserIds = operational handlers plus Organisation Admins who opted
 * into notify_all_bookings (only added when Space Managers are handling).
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
  notifyUserIds: string[];
  canAcceptPublicBooking: boolean;
};

export function computeOperationalBookingManagers(input: {
  organisationId: string | null;
  spaceOwnerId: string | null;
  propertyOwnerId: string | null;
  activeSpaceManagerUserIds: string[];
  activeOrgAdminUserIds: string[];
  notifyAllOrgAdminUserIds?: string[];
}): OperationalBookingManagers {
  const spaceManagers = uniqueIds(input.activeSpaceManagerUserIds);
  const orgAdmins = uniqueIds(input.activeOrgAdminUserIds);
  const notifyAllOrgAdmins = uniqueIds(input.notifyAllOrgAdminUserIds ?? []);
  const organisationId = input.organisationId;
  const spaceOwnerId = input.spaceOwnerId;
  const propertyOwnerId = input.propertyOwnerId;

  const withNotify = (
    kind: OperationalManagerKind,
    recipientUserIds: string[],
    extraNotifyIds: string[]
  ): OperationalBookingManagers => ({
    organisationId,
    spaceOwnerId,
    propertyOwnerId,
    kind,
    recipientUserIds,
    notifyUserIds: uniqueIds([...recipientUserIds, ...extraNotifyIds]),
    canAcceptPublicBooking: kind !== "none",
  });

  if (spaceManagers.length > 0) {
    return withNotify("space_managers", spaceManagers, notifyAllOrgAdmins);
  }

  if (organisationId && orgAdmins.length > 0) {
    return withNotify("org_admins", orgAdmins, []);
  }

  if (spaceOwnerId) {
    return withNotify("legacy_owner", [spaceOwnerId], []);
  }

  if (!organisationId && propertyOwnerId) {
    return withNotify("legacy_owner", [propertyOwnerId], []);
  }

  return withNotify("none", [], []);
}

function uniqueIds(ids: Array<string | null | undefined> | undefined): string[] {
  return Array.from(new Set((ids || []).filter((id): id is string => Boolean(id))));
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
