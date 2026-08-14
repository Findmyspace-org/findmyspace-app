import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdminRole } from "@/lib/admin-roles";

export async function assertSpaceListingManageAccess(
  admin: SupabaseClient,
  userId: string,
  spaceId: string
): Promise<void> {
  const { data: space, error } = await admin
    .from("spaces")
    .select("id, owner_id, property_id")
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) {
    throw new Error("Space not found.");
  }

  const row = space as {
    id: string;
    owner_id: string | null;
    property_id: string | null;
  };

  if (row.owner_id === userId) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (isPlatformAdminRole((profile as { role?: string | null } | null)?.role)) {
    return;
  }

  if (row.property_id) {
    const { data: property } = await admin
      .from("properties")
      .select("owner_id")
      .eq("id", row.property_id)
      .maybeSingle();

    if ((property as { owner_id: string | null } | null)?.owner_id === userId) {
      return;
    }
  }

  throw new Error("Forbidden.");
}

/**
 * Same listing-manage rules (space owner, property owner, platform admin),
 * plus assigned space managers when `space_manager_assignments` exists.
 */
export async function assertCanApproveSpaceBooking(
  admin: SupabaseClient,
  userId: string,
  spaceId: string
): Promise<void> {
  try {
    await assertSpaceListingManageAccess(admin, userId, spaceId);
    return;
  } catch (err) {
    if (!(err instanceof Error) || err.message !== "Forbidden.") {
      throw err;
    }
  }

  const assigned = await userIsAssignedSpaceManager(admin, userId, spaceId);
  if (assigned) return;

  throw new Error("Forbidden.");
}

async function userIsAssignedSpaceManager(
  admin: SupabaseClient,
  userId: string,
  spaceId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("space_manager_assignments")
    .select("id")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }
  return true;
}
