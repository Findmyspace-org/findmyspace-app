export type SpaceImageSortable = {
  id: string;
  image_url: string;
  sort_order: number | null;
};

/** Normalize upload/API rows into space image records. */
export function normalizeSpaceImages(raw: unknown): SpaceImageSortable[] {
  if (!Array.isArray(raw)) return [];
  const rows: SpaceImageSortable[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const image_url = String(row.image_url ?? row.imageUrl ?? "").trim();
    if (!id || !image_url) continue;
    const sort_order =
      typeof row.sort_order === "number"
        ? row.sort_order
        : row.sort_order === null
          ? null
          : null;
    rows.push({ id, image_url, sort_order });
  }
  return rows;
}

/** Lowest sort_order first; stable tie-break by id. */
export function sortSpaceImages<T extends SpaceImageSortable>(images: T[]): T[] {
  return [...images].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}
