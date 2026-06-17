export type GroupSizeFields = {
  min_group_size?: number | null;
  max_group_size?: number | null;
};

const NON_GROUP_SPACE_TYPES = new Set(["storage", "parking"]);

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

export function formatGroupSizePublic(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  if (min != null && max != null) {
    return `Suitable for groups of ${min}–${max} people`;
  }
  if (max != null) {
    return `Up to ${max} people`;
  }
  if (min != null) {
    return `Groups of ${min}+ people`;
  }
  return null;
}

export function formatGroupSizeShort(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  if (min != null && max != null) {
    return `${min}–${max} people`;
  }
  if (max != null) {
    return `Up to ${max} people`;
  }
  if (min != null) {
    return `${min}+ people`;
  }
  return null;
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

/** Venue matches when desired count falls within the configured range. */
export function spaceMatchesGroupSize(
  space: GroupSizeFields,
  desiredGroupSize: number
): boolean {
  if (!Number.isFinite(desiredGroupSize) || desiredGroupSize < 1) return true;

  const min = space.min_group_size;
  const max = space.max_group_size;

  if (min == null && max == null) return true;
  if (min != null && desiredGroupSize < min) return false;
  if (max != null && desiredGroupSize > max) return false;
  return true;
}
