import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summarizeHostingAccess,
  type HostingAccessSummary,
} from "@/lib/access/hosting-access";
import type { OrganisationAccessGrant } from "@/lib/access/roles";
import { ORG_ACCESS_ROLES, ORG_ACCESS_STATUSES } from "@/lib/access/roles";

function mapGrants(
  rows: Array<{
    organisation_id: string;
    role: string;
    property_id: string | null;
    space_id: string | null;
    status: string;
  }>
): OrganisationAccessGrant[] {
  const grants: OrganisationAccessGrant[] = [];
  for (const row of rows) {
    if (
      !(ORG_ACCESS_ROLES as readonly string[]).includes(row.role) ||
      !(ORG_ACCESS_STATUSES as readonly string[]).includes(row.status)
    ) {
      continue;
    }
    grants.push({
      organisationId: row.organisation_id,
      role: row.role as OrganisationAccessGrant["role"],
      propertyId: row.property_id,
      spaceId: row.space_id,
      status: row.status as OrganisationAccessGrant["status"],
    });
  }
  return grants;
}

export async function loadHostingAccessSummary(
  admin: SupabaseClient,
  userId: string
): Promise<HostingAccessSummary> {
  const [{ data: profile }, { count: ownedSpaceCount }, { count: ownedPropertyCount }, { data: grantRows }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("role, admin_access_disabled, is_host")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("spaces")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId),
      admin
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId),
      admin
        .from("organisation_access")
        .select("organisation_id, role, property_id, space_id, status")
        .eq("user_id", userId)
        .eq("status", "active"),
    ]);

  const row = profile as {
    role?: string | null;
    admin_access_disabled?: boolean | null;
    is_host?: boolean | null;
  } | null;

  return summarizeHostingAccess({
    profileRole: row?.role ?? null,
    adminAccessDisabled: Boolean(row?.admin_access_disabled),
    isHostProfile: row?.is_host === true,
    ownedSpaceCount: ownedSpaceCount || 0,
    ownedPropertyCount: ownedPropertyCount || 0,
    grants: mapGrants(
      (grantRows || []) as Array<{
        organisation_id: string;
        role: string;
        property_id: string | null;
        space_id: string | null;
        status: string;
      }>
    ),
  });
}
