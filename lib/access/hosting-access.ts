import { isPlatformAdminRole } from "@/lib/admin-roles";
import {
  isPersonalHostingQueryValue,
  ORGANISATION_QUERY_PARAM,
  organisationWorkspaceHref,
} from "@/lib/access/organisation-workspace";
import type { OrganisationAccessGrant } from "@/lib/access/roles";

/**
 * Hosting workspace capability, derived from organisation_access, legacy
 * ownership, and Global Admin. profiles.is_host is a legacy compatibility
 * signal only — Organisation managers must not depend on it.
 */

export type HostingAccessInput = {
  profileRole: string | null;
  adminAccessDisabled?: boolean;
  isHostProfile: boolean;
  ownedSpaceCount: number;
  ownedPropertyCount: number;
  grants: OrganisationAccessGrant[];
};

export type HostingAccessSummary = {
  hasHostingAccess: boolean;
  isGlobalAdmin: boolean;
  isOrganisationAdmin: boolean;
  isPropertyManager: boolean;
  isSpaceManager: boolean;
  isLegacyHost: boolean;
  showProperties: boolean;
  showFinance: boolean;
  showPeople: boolean;
  showOrganisationCommercial: boolean;
  showVerification: boolean;
  showCreateSpace: boolean;
  organisationIds: string[];
  primaryOrganisationId: string | null;
};

/**
 * Selected Hosting workspace. Capability flags must be derived from this
 * context, not from the union of every organisation grant.
 */
export type HostingCapabilityContext = {
  kind: "organisation" | "personal" | "unavailable" | "none";
  organisationId: string | null;
};

function activeGrants(grants: OrganisationAccessGrant[]): OrganisationAccessGrant[] {
  return grants.filter((grant) => grant.status === "active");
}

export function summarizeHostingAccess(
  input: HostingAccessInput
): HostingAccessSummary {
  const grants = activeGrants(input.grants);
  const isGlobalAdmin =
    isPlatformAdminRole(input.profileRole) && !Boolean(input.adminAccessDisabled);
  const isOrganisationAdmin = grants.some(
    (grant) =>
      grant.role === "org_admin" &&
      grant.propertyId == null &&
      grant.spaceId == null
  );
  const isPropertyManager = grants.some(
    (grant) => grant.role === "property_manager"
  );
  const isSpaceManager = grants.some((grant) => grant.role === "space_manager");
  const isLegacyHost =
    input.isHostProfile ||
    input.ownedSpaceCount > 0 ||
    input.ownedPropertyCount > 0;

  const hasHostingAccess =
    isGlobalAdmin ||
    isOrganisationAdmin ||
    isPropertyManager ||
    isSpaceManager ||
    input.ownedSpaceCount > 0 ||
    input.ownedPropertyCount > 0 ||
    input.isHostProfile;

  const organisationIds = Array.from(
    new Set(grants.map((grant) => grant.organisationId).filter(Boolean))
  );

  const showPeople = isGlobalAdmin || isOrganisationAdmin;
  const showOrganisationCommercial = showPeople;
  const showProperties =
    isGlobalAdmin || isOrganisationAdmin || isPropertyManager || isLegacyHost;
  const showFinance =
    isGlobalAdmin || isOrganisationAdmin || isPropertyManager || isLegacyHost;
  const showVerification = isGlobalAdmin || isLegacyHost;
  const showCreateSpace =
    isGlobalAdmin || isOrganisationAdmin || isLegacyHost;

  return {
    hasHostingAccess,
    isGlobalAdmin,
    isOrganisationAdmin,
    isPropertyManager,
    isSpaceManager,
    isLegacyHost,
    showProperties,
    showFinance,
    showPeople,
    showOrganisationCommercial,
    showVerification,
    showCreateSpace,
    organisationIds,
    primaryOrganisationId: organisationIds[0] ?? null,
  };
}

export function hasHostingAccess(input: HostingAccessInput): boolean {
  return summarizeHostingAccess(input).hasHostingAccess;
}

/**
 * User-wide identity (organisation membership, personal-host, Global Admin)
 * plus capability flags for the selected Hosting context only.
 *
 * A stronger role in Organisation A must not enable Finance / People /
 * Organisation commercial UI in Organisation B.
 */
export function summarizeHostingAccessForContext(
  input: HostingAccessInput,
  context: HostingCapabilityContext
): HostingAccessSummary {
  const identity = summarizeHostingAccess(input);
  const deniedCapabilities: Pick<
    HostingAccessSummary,
    | "isOrganisationAdmin"
    | "isPropertyManager"
    | "isSpaceManager"
    | "showProperties"
    | "showFinance"
    | "showPeople"
    | "showOrganisationCommercial"
    | "showVerification"
    | "showCreateSpace"
  > = {
    isOrganisationAdmin: false,
    isPropertyManager: false,
    isSpaceManager: false,
    showProperties: false,
    showFinance: false,
    showPeople: false,
    showOrganisationCommercial: false,
    showVerification: false,
    showCreateSpace: false,
  };

  if (context.kind === "unavailable" || context.kind === "none") {
    return { ...identity, ...deniedCapabilities };
  }

  if (context.kind === "personal") {
    const showHostTools = identity.isGlobalAdmin || identity.isLegacyHost;
    return {
      ...identity,
      ...deniedCapabilities,
      showProperties: showHostTools,
      showFinance: showHostTools,
      showVerification: showHostTools,
      showCreateSpace: showHostTools,
    };
  }

  const organisationId = context.organisationId;
  const grants = activeGrants(input.grants).filter(
    (grant) => grant.organisationId === organisationId
  );
  const isOrganisationAdmin = grants.some(
    (grant) =>
      grant.role === "org_admin" &&
      grant.propertyId == null &&
      grant.spaceId == null
  );
  const isPropertyManager = grants.some(
    (grant) => grant.role === "property_manager"
  );
  const isSpaceManager = grants.some((grant) => grant.role === "space_manager");
  const showPeople = identity.isGlobalAdmin || isOrganisationAdmin;
  const showOrganisationCommercial = showPeople;
  const showProperties =
    identity.isGlobalAdmin || isOrganisationAdmin || isPropertyManager;
  const showFinance = showProperties;
  const showVerification = identity.isGlobalAdmin || identity.isLegacyHost;
  const showCreateSpace =
    identity.isGlobalAdmin || isOrganisationAdmin || identity.isLegacyHost;

  return {
    ...identity,
    isOrganisationAdmin,
    isPropertyManager,
    isSpaceManager,
    showProperties,
    showFinance,
    showPeople,
    showOrganisationCommercial,
    showVerification,
    showCreateSpace,
  };
}

export function organisationInvitationRedirect(
  role: string,
  organisationId: string
): string {
  if (role === "org_admin") {
    return organisationWorkspaceHref("/dashboard/people", organisationId);
  }
  return organisationWorkspaceHref("/dashboard/owner", organisationId);
}

export function hostingHref(
  pathnameWithQuery: string,
  organisationId: string | null
): string {
  if (!organisationId) return pathnameWithQuery;
  const [path, query] = pathnameWithQuery.split("?");
  const params = new URLSearchParams(query || "");
  params.set(ORGANISATION_QUERY_PARAM, organisationId);
  return `${path}?${params.toString()}`;
}

export function resolveHostingOrganisationId(input: {
  requestedId: string | null | undefined;
  organisationIds: string[];
  primaryOrganisationId: string | null;
  isGlobalAdmin?: boolean;
  isLegacyHost?: boolean;
}): string | null {
  // Organisation context does not grant authority. An explicit unauthorised id
  // must not silently substitute another organisation.
  const requested = input.requestedId?.trim() || "";
  if (requested) {
    if (isPersonalHostingQueryValue(requested)) return null;
    if (input.organisationIds.includes(requested)) return requested;
    if (input.isGlobalAdmin) {
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuid.test(requested)) return requested;
    }
    return null;
  }
  return input.primaryOrganisationId;
}
