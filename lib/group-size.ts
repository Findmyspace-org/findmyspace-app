export type GroupSizeFields = {
  min_group_size?: number | null;
  max_group_size?: number | null;
};

/** Legacy attribute keys — group size now lives on spaces.min/max_group_size. */
export const DEPRECATED_GROUP_SIZE_ATTR_KEYS = new Set([
  "sf_capacity_band",
  "sf_event_capacity",
  "scout_capacity",
]);

const NON_GROUP_SPACE_TYPES = new Set(["storage", "parking"]);

export const GROUP_SIZE_FILTER_BUCKETS = [
  { value: "up_to_20", label: "Up to 20", min: 1, max: 20 },
  { value: "20_50", label: "20–50", min: 20, max: 50 },
  { value: "50_100", label: "50–100", min: 50, max: 100 },
  { value: "100_plus", label: "100+", min: 100, max: Number.POSITIVE_INFINITY },
] as const;

export type GroupSizeFilterBucketValue =
  (typeof GROUP_SIZE_FILTER_BUCKETS)[number]["value"];

export function isGroupSizeApplicable(spaceType: string | null | undefined): boolean {
  if (!spaceType) return true;
  return !NON_GROUP_SPACE_TYPES.has(spaceType.toLowerCase());
}

export function parseGroupSizeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1 || n > 50_000) return null;
  return Math.floor(n);
}

export function validateGroupSizePair(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  if (min != null && (!Number.isFinite(min) || min < 1)) {
    return "Minimum group size must be at least 1.";
  }
  if (max != null && (!Number.isFinite(max) || max < 1)) {
    return "Maximum group size must be at least 1.";
  }
  if (min != null && max != null && max < min) {
    return "Maximum group size must be greater than or equal to minimum.";
  }
  return null;
}

/** Effective searchable range: null min → 1, null max → unlimited. */
export function normalizeSpaceGroupSizeRange(space: GroupSizeFields): {
  min: number;
  max: number;
} {
  return {
    min: space.min_group_size ?? 1,
    max: space.max_group_size ?? Number.POSITIVE_INFINITY,
  };
}

export function formatGroupSizePublic(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  if (min != null && max != null) {
    return `Suitable for ${min}–${max} people`;
  }
  if (max != null) {
    return `Up to ${max} people`;
  }
  if (min != null) {
    return `Suitable for ${min}+ people`;
  }
  return null;
}

export function formatGroupSizeShort(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  return formatGroupSizePublic(min, max);
}

export function formatGroupSizeAdmin(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  if (min != null && max != null) {
    return `${min}–${max}`;
  }
  if (max != null) {
    return `Up to ${max}`;
  }
  if (min != null) {
    return `${min}+`;
  }
  return null;
}

/** @alias formatGroupSizePublic */
export const formatSpaceCapacity = formatGroupSizePublic;

/** Admin/owner tables when capacity is unset. */
export function formatGroupSizeAdminLabel(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  return formatGroupSizeAdmin(min, max) ?? "Capacity not specified";
}

export function parseGroupSizeBucketFilter(
  value: string
): { min: number; max: number } | null {
  const bucket = GROUP_SIZE_FILTER_BUCKETS.find((b) => b.value === value.trim());
  if (!bucket) return null;
  return { min: bucket.min, max: bucket.max };
}

/** Space range overlaps the selected search bucket. */
export function spaceMatchesGroupSizeBucket(
  space: GroupSizeFields,
  bucketMin: number,
  bucketMax: number
): boolean {
  const { min: spaceMin, max: spaceMax } = normalizeSpaceGroupSizeRange(space);
  return spaceMin <= bucketMax && spaceMax >= bucketMin;
}

/** Match a single attendee count against the space range. */
export function spaceMatchesGroupSize(
  space: GroupSizeFields,
  desiredGroupSize: number
): boolean {
  if (!Number.isFinite(desiredGroupSize) || desiredGroupSize < 1) return true;

  const { min: spaceMin, max: spaceMax } = normalizeSpaceGroupSizeRange(space);
  return desiredGroupSize >= spaceMin && desiredGroupSize <= spaceMax;
}
