/**
 * Pipeline page URL filter helpers — single source of truth for filter param keys.
 */

/** Query params that narrow the pipeline results (cleared by Remove filters). */
export const CRM_PIPELINE_FILTER_PARAM_KEYS = [
  "q",
  "stage",
  "assigned",
  "type",
  "overdue",
  "no_next",
  "no_contact",
  "primary_required",
  "no_spaces",
  "no_follow_up",
  "no_email",
  "no_phone",
  "stale",
  "preset",
  "sort",
  "dir",
  "bucket",
  "org",
  "role",
  "owner",
] as const;

/** Query params preserved when clearing pipeline filters. */
export const CRM_PIPELINE_PRESERVED_PARAM_KEYS = [
  "view",
  "boardSort",
  "pageSize",
] as const;

export type CrmPipelineFilterParamKey =
  (typeof CRM_PIPELINE_FILTER_PARAM_KEYS)[number];

function isFilterParamActive(
  searchParams: URLSearchParams,
  key: CrmPipelineFilterParamKey
): boolean {
  const value = searchParams.get(key);
  if (!value) return false;
  return value.length > 0;
}

/** True when any pipeline filter or preset chip is active in the URL. */
export function hasActivePipelineFilters(
  searchParams: URLSearchParams
): boolean {
  return CRM_PIPELINE_FILTER_PARAM_KEYS.some((key) =>
    isFilterParamActive(searchParams, key)
  );
}

/**
 * Remove all pipeline filter params and reset pagination cursors.
 * Preserves view mode, board sort, and page size.
 */
export function clearAllPipelineFilterSearchParams(
  current: URLSearchParams
): URLSearchParams {
  const next = new URLSearchParams(current.toString());

  for (const key of CRM_PIPELINE_FILTER_PARAM_KEYS) {
    next.delete(key);
  }

  next.delete("page");
  next.delete("boardPage");

  return next;
}

/** Build API query params from URL search params (filter keys only). */
export function buildPipelineFilterParams(
  searchParams: URLSearchParams,
  extra: Record<string, string | number | undefined> = {}
): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = { ...extra };
  for (const key of CRM_PIPELINE_FILTER_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value) params[key] = value;
  }
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");
  if (page) params.page = page;
  if (pageSize) params.pageSize = pageSize;
  return params;
}
