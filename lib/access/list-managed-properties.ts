import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Properties the user may manage as host: legacy owner, Property Manager
 * grant, or Organisation Admin. Space Managers do not inherit the parent
 * property from a single assigned space.
 */
export async function listManagedPropertyIds(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: ownedProperties } = await admin
    .from("properties")
    .select("id")
    .eq("owner_id", userId);
  for (const row of (ownedProperties || []) as Array<{ id: string }>) {
    ids.add(row.id);
  }

  const { data: grants } = await admin
    .from("organisation_access")
    .select("role, organisation_id, property_id, space_id")
    .eq("user_id", userId)
    .eq("status", "active");

  const orgAdminOrgIds: string[] = [];
  for (const grant of (grants || []) as Array<{
    role: string;
    organisation_id: string;
    property_id: string | null;
    space_id: string | null;
  }>) {
    if (grant.role === "property_manager" && grant.property_id && !grant.space_id) {
      ids.add(grant.property_id);
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
      ids.add(row.id);
    }
  }

  return Array.from(ids);
}
