export type SpaceImageSortable = {
  id: string;
  image_url: string;
  sort_order: number | null;
};

/** Lowest sort_order first; stable tie-break by id. */
export function sortSpaceImages<T extends SpaceImageSortable>(images: T[]): T[] {
  return [...images].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}
