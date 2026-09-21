export const ORG_ACCESS_ROLES = [
  "org_admin",
  "property_manager",
  "space_manager",
] as const;

export type OrganisationAccessRole = (typeof ORG_ACCESS_ROLES)[number];

export const ORG_ACCESS_STATUSES = ["pending", "active", "revoked"] as const;

export type OrganisationAccessStatus = (typeof ORG_ACCESS_STATUSES)[number];

export type AccessCapabilities = {
  canViewSpace: boolean;
  canEditSpace: boolean;
  canManageBooking: boolean;
  canViewBookingCommercial: boolean;
  canManageOrganisationFinance: boolean;
  canManagePeopleAccess: boolean;
  canAssignOrganisationAdmin: boolean;
  canAssignManagers: boolean;
};

export type AccessRoleFlags = {
  isGlobalAdmin: boolean;
  isOrganisationAdmin: boolean;
  isPropertyManager: boolean;
  isSpaceManager: boolean;
  isLegacyPropertyOwner: boolean;
  isLegacySpaceOwner: boolean;
};

export type ResolvedAccess = AccessCapabilities &
  AccessRoleFlags & {
    userId: string;
    spaceId: string | null;
    propertyId: string | null;
    organisationId: string | null;
  };

export type OrganisationAccessGrant = {
  organisationId: string;
  role: OrganisationAccessRole;
  propertyId: string | null;
  spaceId: string | null;
  status: OrganisationAccessStatus;
};

export type AccessContext = {
  userId: string;
  spaceId: string | null;
  propertyId: string | null;
  organisationId: string | null;
  spaceOwnerId: string | null;
  propertyOwnerId: string | null;
  profileRole: string | null;
  adminAccessDisabled: boolean;
  grants: OrganisationAccessGrant[];
};

export const EMPTY_CAPABILITIES: AccessCapabilities = {
  canViewSpace: false,
  canEditSpace: false,
  canManageBooking: false,
  canViewBookingCommercial: false,
  canManageOrganisationFinance: false,
  canManagePeopleAccess: false,
  canAssignOrganisationAdmin: false,
  canAssignManagers: false,
};

export const EMPTY_ROLE_FLAGS: AccessRoleFlags = {
  isGlobalAdmin: false,
  isOrganisationAdmin: false,
  isPropertyManager: false,
  isSpaceManager: false,
  isLegacyPropertyOwner: false,
  isLegacySpaceOwner: false,
};
