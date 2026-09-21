import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Space IDs the user may operate as host: legacy owner, property owner,
 * or active organisation grants. Does not include every marketplace space
 * for Global Admin (admin bookings UI remains separate).
 */
export async function listManagedSpaceIds(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: ownedSpaces } = await admin
    .from("spaces")
    .select("id")
    .eq("owner_id", userId);
  for (const row of (ownedSpaces || []) as Array<{ id: string }>) {
    ids.add(row.id);
  }

  const { data: ownedProperties } = await admin
    .from("properties")
    .select("id")
    .eq("owner_id", userId);
  const ownedPropertyIds = ((ownedProperties || []) as Array<{ id: string }>).map(
    (row) => row.id
  );
  if (ownedPropertyIds.length > 0) {
    const { data: propertySpaces } = await admin
      .from("spaces")
      .select("id")
      .in("property_id", ownedPropertyIds);
    for (const row of (propertySpaces || []) as Array<{ id: string }>) {
      ids.add(row.id);
    }
  }

  const { data: grants } = await admin
    .from("organisation_access")
    .select("role, organisation_id, property_id, space_id")
    .eq("user_id", userId)
    .eq("status", "active");

  const orgAdminOrgIds: string[] = [];
  const managerPropertyIds: string[] = [];

  for (const grant of (grants || []) as Array<{
    role: string;
    organisation_id: string;
    property_id: string | null;
    space_id: string | null;
  }>) {
    if (grant.role === "space_manager" && grant.space_id) {
      ids.add(grant.space_id);
    } else if (grant.role === "property_manager" && grant.property_id) {
      managerPropertyIds.push(grant.property_id);
    } else if (
      grant.role === "org_admin" &&
      grant.property_id == null &&
      grant.space_id == null
    ) {
      orgAdminOrgIds.push(grant.organisation_id);
    }
  }

  if (orgAdminOrgIds.length > 0) {
    const { data: orgProperties } = await admin
      .from("properties")
      .select("id")
      .in("organisation_id", orgAdminOrgIds);
    for (const row of (orgProperties || []) as Array<{ id: string }>) {
      managerPropertyIds.push(row.id);
    }
  }

  const uniquePropertyIds = Array.from(new Set(managerPropertyIds));
  if (uniquePropertyIds.length > 0) {
    const { data: managedSpaces } = await admin
      .from("spaces")
      .select("id")
      .in("property_id", uniquePropertyIds);
    for (const row of (managedSpaces || []) as Array<{ id: string }>) {
      ids.add(row.id);
    }
  }

  return Array.from(ids);
}
