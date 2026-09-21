import { isPlatformAdminRole } from "@/lib/admin-roles";
import {
  EMPTY_CAPABILITIES,
  EMPTY_ROLE_FLAGS,
  type AccessContext,
  type AccessRoleFlags,
  type OrganisationAccessGrant,
  type ResolvedAccess,
} from "@/lib/access/roles";

function activeGrants(grants: OrganisationAccessGrant[]): OrganisationAccessGrant[] {
  return grants.filter((grant) => grant.status === "active");
}

/**
 * Canonical capability computation. Server-side only.
 * Never infers Organisation Admin from property.owner_id or space.owner_id.
 * Pending/revoked grants are ignored.
 */
export function computeAccess(ctx: AccessContext): ResolvedAccess {
  const grants = activeGrants(ctx.grants);
  const organisationId = ctx.organisationId;
  const propertyId = ctx.propertyId;
  const spaceId = ctx.spaceId;

  const isGlobalAdmin =
    isPlatformAdminRole(ctx.profileRole) && !ctx.adminAccessDisabled;

  const isOrganisationAdmin = Boolean(
    organisationId &&
      grants.some(
        (grant) =>
          grant.role === "org_admin" &&
          grant.organisationId === organisationId &&
          grant.propertyId == null &&
          grant.spaceId == null
      )
  );

  const isPropertyManager = Boolean(
    propertyId &&
      organisationId &&
      grants.some(
        (grant) =>
          grant.role === "property_manager" &&
          grant.organisationId === organisationId &&
          grant.propertyId === propertyId &&
          grant.spaceId == null
      )
  );

  const isSpaceManager = Boolean(
    spaceId &&
      propertyId &&
      organisationId &&
      grants.some(
        (grant) =>
          grant.role === "space_manager" &&
          grant.organisationId === organisationId &&
          grant.propertyId === propertyId &&
          grant.spaceId === spaceId
      )
  );

  const isLegacyPropertyOwner = Boolean(
    propertyId && ctx.propertyOwnerId === ctx.userId
  );
  const isLegacySpaceOwner = Boolean(spaceId && ctx.spaceOwnerId === ctx.userId);

  const canOperateSpace = Boolean(
    isGlobalAdmin ||
      isOrganisationAdmin ||
      isPropertyManager ||
      isSpaceManager ||
      isLegacyPropertyOwner ||
      isLegacySpaceOwner
  );

  const canAdministerOrganisation = Boolean(
    isGlobalAdmin || isOrganisationAdmin
  );

  const roles: AccessRoleFlags = {
    isGlobalAdmin,
    isOrganisationAdmin,
    isPropertyManager,
    isSpaceManager,
    isLegacyPropertyOwner,
    isLegacySpaceOwner,
  };

  return {
    userId: ctx.userId,
    spaceId,
    propertyId,
    organisationId,
    ...roles,
    canViewSpace: canOperateSpace,
    canEditSpace: canOperateSpace,
    canManageBooking: canOperateSpace,
    canViewBookingCommercial: canOperateSpace,
    canManageOrganisationFinance: canAdministerOrganisation,
    canManagePeopleAccess: canAdministerOrganisation,
    canAssignOrganisationAdmin: canAdministerOrganisation,
    canAssignManagers: canAdministerOrganisation,
  };
}

export function deniedAccess(userId: string): ResolvedAccess {
  return {
    userId,
    spaceId: null,
    propertyId: null,
    organisationId: null,
    ...EMPTY_ROLE_FLAGS,
    ...EMPTY_CAPABILITIES,
  };
}
