import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAccess, deniedAccess } from "@/lib/access/compute-access";
import type {
  AccessContext,
  OrganisationAccessGrant,
  OrganisationAccessRole,
  OrganisationAccessStatus,
  ResolvedAccess,
} from "@/lib/access/roles";
import { ORG_ACCESS_ROLES, ORG_ACCESS_STATUSES } from "@/lib/access/roles";

type SpaceRow = {
  id: string;
  owner_id: string | null;
  property_id: string | null;
};

type PropertyRow = {
  id: string;
  owner_id: string | null;
  organisation_id: string | null;
};

type ProfileRow = {
  role: string | null;
  admin_access_disabled: boolean | null;
};

type GrantRow = {
  organisation_id: string;
  role: string;
  property_id: string | null;
  space_id: string | null;
  status: string;
};

function isAccessRole(value: string): value is OrganisationAccessRole {
  return (ORG_ACCESS_ROLES as readonly string[]).includes(value);
}

function isAccessStatus(value: string): value is OrganisationAccessStatus {
  return (ORG_ACCESS_STATUSES as readonly string[]).includes(value);
}

function mapGrants(rows: GrantRow[] | null | undefined): OrganisationAccessGrant[] {
  const grants: OrganisationAccessGrant[] = [];
  for (const row of rows || []) {
    if (!isAccessRole(row.role) || !isAccessStatus(row.status)) continue;
    grants.push({
      organisationId: row.organisation_id,
      role: row.role,
      propertyId: row.property_id,
      spaceId: row.space_id,
      status: row.status,
    });
  }
  return grants;
}

async function loadProfile(
  admin: SupabaseClient,
  userId: string
): Promise<ProfileRow> {
  const { data } = await admin
    .from("profiles")
    .select("role, admin_access_disabled")
    .eq("id", userId)
    .maybeSingle();
  return {
    role: (data as ProfileRow | null)?.role ?? null,
    admin_access_disabled:
      (data as ProfileRow | null)?.admin_access_disabled ?? false,
  };
}

async function loadActiveGrants(
  admin: SupabaseClient,
  userId: string,
  organisationIds: string[]
): Promise<OrganisationAccessGrant[]> {
  if (organisationIds.length === 0) return [];

  const { data } = await admin
    .from("organisation_access")
    .select("organisation_id, role, property_id, space_id, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("organisation_id", organisationIds);

  return mapGrants((data as GrantRow[] | null) ?? []);
}

/**
 * Resolve what a signed-in user may do for a space.
 * Loads inventory + active grants from the database; never trusts client roles.
 *
 * `userId` must come from a verified server session (e.g. auth.getUser()),
 * never from request JSON. There is no public API that accepts an acting user id.
 */
export async function resolveAccessForSpace(
  admin: SupabaseClient,
  userId: string,
  spaceId: string
): Promise<ResolvedAccess | null> {
  const [{ data: space, error: spaceError }, profile] = await Promise.all([
    admin
      .from("spaces")
      .select("id, owner_id, property_id")
      .eq("id", spaceId)
      .maybeSingle(),
    loadProfile(admin, userId),
  ]);

  if (spaceError || !space) return null;

  const spaceRow = space as SpaceRow;
  let property: PropertyRow | null = null;
  if (spaceRow.property_id) {
    const { data } = await admin
      .from("properties")
      .select("id, owner_id, organisation_id")
      .eq("id", spaceRow.property_id)
      .maybeSingle();
    property = (data as PropertyRow | null) ?? null;
  }

  const organisationId = property?.organisation_id ?? null;
  const grants = organisationId
    ? await loadActiveGrants(admin, userId, [organisationId])
    : [];

  const ctx: AccessContext = {
    userId,
    spaceId: spaceRow.id,
    propertyId: property?.id ?? spaceRow.property_id,
    organisationId,
    spaceOwnerId: spaceRow.owner_id,
    propertyOwnerId: property?.owner_id ?? null,
    profileRole: profile.role,
    adminAccessDisabled: Boolean(profile.admin_access_disabled),
    grants,
  };

  return computeAccess(ctx);
}

/** `userId` must be the verified session user, not a client-supplied id. */
export async function resolveAccessForProperty(
  admin: SupabaseClient,
  userId: string,
  propertyId: string
): Promise<ResolvedAccess | null> {
  const [{ data: property, error }, profile] = await Promise.all([
    admin
      .from("properties")
      .select("id, owner_id, organisation_id")
      .eq("id", propertyId)
      .maybeSingle(),
    loadProfile(admin, userId),
  ]);

  if (error || !property) return null;
  const propertyRow = property as PropertyRow;
  const organisationId = propertyRow.organisation_id;
  const grants = organisationId
    ? await loadActiveGrants(admin, userId, [organisationId])
    : [];

  return computeAccess({
    userId,
    spaceId: null,
    propertyId: propertyRow.id,
    organisationId,
    spaceOwnerId: null,
    propertyOwnerId: propertyRow.owner_id,
    profileRole: profile.role,
    adminAccessDisabled: Boolean(profile.admin_access_disabled),
    grants,
  });
}

/** `userId` must be the verified session user, not a client-supplied id. */
export async function resolveAccessForOrganisation(
  admin: SupabaseClient,
  userId: string,
  organisationId: string
): Promise<ResolvedAccess> {
  const [profile, grants] = await Promise.all([
    loadProfile(admin, userId),
    loadActiveGrants(admin, userId, [organisationId]),
  ]);

  return computeAccess({
    userId,
    spaceId: null,
    propertyId: null,
    organisationId,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: profile.role,
    adminAccessDisabled: Boolean(profile.admin_access_disabled),
    grants,
  });
}

export { computeAccess, deniedAccess };
export type { ResolvedAccess, AccessContext, OrganisationAccessGrant };
