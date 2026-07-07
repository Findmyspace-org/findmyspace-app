import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST URL length stays safe when chunking `.in()` filters. */
export const CRM_IN_FILTER_CHUNK_SIZE = 200;

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type SortableRow = { id: string; [key: string]: unknown };

function compareSortValues(
  a: unknown,
  b: unknown,
  ascending: boolean
): number {
  if (a == null && b == null) return 0;
  if (a == null) return ascending ? 1 : -1;
  if (b == null) return ascending ? -1 : 1;
  if (typeof a === "number" && typeof b === "number") {
    return ascending ? a - b : b - a;
  }
  const as = String(a).toLowerCase();
  const bs = String(b).toLowerCase();
  const cmp = as.localeCompare(bs);
  return ascending ? cmp : -cmp;
}

/**
 * Paginate a large ID set without passing every ID to a single `.in()` filter.
 * Fetches sort field per ID in chunks, sorts in memory, then loads the page batch.
 */
export async function paginateIdsBySortField(
  adminClient: SupabaseClient,
  table: string,
  ids: string[],
  sortField: string,
  ascending: boolean,
  page: number,
  pageSize: number
): Promise<{ pageIds: string[]; total: number }> {
  const total = ids.length;
  if (total === 0) {
    return { pageIds: [], total: 0 };
  }

  const sortRows: SortableRow[] = [];
  for (const chunk of chunkArray(ids, CRM_IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await adminClient
      .from(table)
      .select(`id, ${sortField}`)
      .in("id", chunk);
    if (error) throw new Error(error.message);
    sortRows.push(...((data || []) as unknown as SortableRow[]));
  }

  sortRows.sort((a, b) =>
    compareSortValues(a[sortField], b[sortField], ascending)
  );

  const from = (page - 1) * pageSize;
  const pageIds = sortRows.slice(from, from + pageSize).map((row) => row.id);
  return { pageIds, total };
}

/**
 * Narrow a candidate ID set by applying base filters in chunked `.in()` queries.
 */
export async function filterIdsInChunks(
  adminClient: SupabaseClient,
  table: string,
  candidateIds: Set<string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyFilters: (query: any) => any
): Promise<string[]> {
  const matching: string[] = [];
  const chunks = chunkArray([...candidateIds], CRM_IN_FILTER_CHUNK_SIZE);

  for (const chunk of chunks) {
    const query = applyFilters(
      adminClient.from(table).select("id").in("id", chunk)
    );
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    matching.push(...((data || []) as { id: string }[]).map((row) => row.id));
  }

  return matching;
}
