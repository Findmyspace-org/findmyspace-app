import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_PUBLIC_PHOTOS_ERROR =
  "Add at least one photo before going public.";

/** Count persisted rows in space_images (uses select, not head count). */
export async function countPersistedSpacePhotos(
  admin: SupabaseClient,
  spaceId: string
): Promise<{ count: number; error: string | null }> {
  const { data, error } = await admin
    .from("space_images")
    .select("id")
    .eq("space_id", spaceId)
    .limit(1);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: data?.length ?? 0, error: null };
}

export async function spaceHasPersistedPhotos(
  admin: SupabaseClient,
  spaceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { count, error } = await countPersistedSpacePhotos(admin, spaceId);
  if (error) {
    return { ok: false, error };
  }
  if (count < 1) {
    return { ok: false, error: MIN_PUBLIC_PHOTOS_ERROR };
  }
  return { ok: true };
}
