import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccessForSpace } from "@/lib/access/resolve-access";

/**
 * Listing-definition writes (booking requirement fields, etc.).
 * Uses the organisation access resolver so Organisation Admin, Property
 * Manager, and Space Manager can edit spaces they manage — not only
 * legacy owner_id.
 */
export async function assertSpaceListingManageAccess(
  admin: SupabaseClient,
  userId: string,
  spaceId: string
): Promise<void> {
  const access = await resolveAccessForSpace(admin, userId, spaceId);
  if (!access) {
    throw new Error("Space not found.");
  }
  if (!access.canEditSpace) {
    throw new Error("Forbidden.");
  }
}
