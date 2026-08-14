import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdminRole } from "@/lib/admin-roles";

export type HostManagedSpaces = {
  ownedSpaceIds: string[];
  assignedSpaceIds: string[];
  propertySpaceIds: string[];
  allIds: string[];
};

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function fetchAssignedSpaceIds(
  client: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await client
    .from("space_manager_assignments")
    .select("space_id")
    .eq("user_id", userId);
  if (error) {
    if (/space_manager_assignments/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return uniqueIds(
    ((data as { space_id: string }[]) || []).map((row) => row.space_id)
  );
}

export async function fetchHostManagedSpaces(
  client: SupabaseClient,
  userId: string
): Promise<HostManagedSpaces> {
  const { data: ownedRows, error: ownedErr } = await client
    .from("spaces")
    .select("id")
    .eq("owner_id", userId)
    .neq("status", "deleted");
  if (ownedErr) throw new Error(ownedErr.message);

  const ownedSpaceIds = uniqueIds(
    ((ownedRows as { id: string }[]) || []).map((row) => row.id)
  );

  let assignedSpaceIds: string[] = [];
  try {
    assignedSpaceIds = await fetchAssignedSpaceIds(client, userId);
  } catch {
    assignedSpaceIds = [];
  }

  const { data: properties } = await client
    .from("properties")
    .select("id")
    .eq("owner_id", userId);

  const propertyIds = uniqueIds(
    ((properties as { id: string }[]) || []).map((row) => row.id)
  );

  let propertySpaceIds: string[] = [];
  if (propertyIds.length > 0) {
    const { data: propertySpaces } = await client
      .from("spaces")
      .select("id")
      .in("property_id", propertyIds)
      .neq("status", "deleted");
    propertySpaceIds = uniqueIds(
      ((propertySpaces as { id: string }[]) || []).map((row) => row.id)
    );
  }

  return {
    ownedSpaceIds,
    assignedSpaceIds,
    propertySpaceIds,
    allIds: uniqueIds([...ownedSpaceIds, ...assignedSpaceIds, ...propertySpaceIds]),
  };
}

export async function isPlatformAdminUser(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return isPlatformAdminRole((data as { role?: string | null } | null)?.role);
}
