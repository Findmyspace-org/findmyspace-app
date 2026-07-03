import { isArchivedSpace } from "@/lib/space-archive";
import { isSpacePubliclyVisible } from "@/lib/public-listing-mode";
import { sortSpaceImages, type SpaceImageSortable } from "@/lib/sort-space-images";
import { supabase } from "@/lib/supabase";

export type SpaceOgSource = {
  id: string;
  public_listing_mode: string | null;
  status: string | null;
  coverImage: SpaceImageSortable | null;
};

export function isSpaceOgEligible(
  space: {
    public_listing_mode?: string | null;
    status?: string | null;
    archived_at?: string | null;
  } | null | undefined
): boolean {
  if (!space) return false;
  if (isArchivedSpace(space.status) || space.archived_at) return false;
  return isSpacePubliclyVisible(space);
}

/** Minimal public-safe fields for branded OG image generation. */
export async function getSpaceOgSource(spaceId: string): Promise<SpaceOgSource | null> {
  const { data: space, error } = await supabase
    .from("spaces")
    .select("id, public_listing_mode, status")
    .eq("id", spaceId)
    .single();

  if (error || !space) return null;

  const { data: images } = await supabase
    .from("space_images")
    .select("id, image_url, sort_order")
    .eq("space_id", spaceId)
    .order("sort_order", { ascending: true });

  const sorted = sortSpaceImages(
    (images || []) as SpaceImageSortable[]
  );

  return {
    id: space.id,
    public_listing_mode: space.public_listing_mode ?? null,
    status: space.status ?? null,
    coverImage: sorted[0] ?? null,
  };
}
