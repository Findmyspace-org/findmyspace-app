import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCanManageSpaceId } from "@/lib/space-manager-server";

export async function assertSpaceListingManageAccess(
  admin: SupabaseClient,
  userId: string,
  spaceId: string
): Promise<void> {
  await assertCanManageSpaceId(admin, userId, spaceId);
}
