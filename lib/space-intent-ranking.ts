import {
  buildAttributeSearchText,
  formatSpaceTypeLabel,
  getSportTypeBadgeLabels,
} from "@/app/data/spaceFeatureConfig";
import type { ParsedSpaceIntent } from "@/lib/space-intent-parser";
import { spaceHasSportTypes } from "@/lib/sport-search";

export type SpaceIntentMatchInput = {
  id: string;
  title: string;
  description?: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1?: string | null;
  space_type: string | null;
  attributes?: Record<string, string[]>;
};

const CAPACITY_BAND_MIN: Record<string, number> = {
  "2_4": 2,
  "5_8": 5,
  "9_15": 9,
  "15_plus": 15,
  up_to_20: 1,
  "20_50": 20,
  "50_100": 50,
  "100_plus": 100,
};

function capacityBandMatches(
  attributes: Record<string, string[]> | undefined,
  requested: number
): boolean {
  if (!attributes || !requested) return false;
  const bands = [
    ...(attributes.sf_capacity_band || []),
    ...(attributes.sf_event_capacity || []),
    ...(attributes.scout_capacity || []),
  ];
  for (const band of bands) {
    const min = CAPACITY_BAND_MIN[band];
    if (min != null && requested <= min + (band.includes("plus") || band.includes("_100") ? 999 : 50)) {
      return true;
    }
    const numeric = Number(band);
    if (Number.isFinite(numeric) && numeric >= requested) return true;
  }
  return false;
}

function attributeHasSuitableFor(
  attributes: Record<string, string[]> | undefined,
  keys: string[]
): boolean {
  if (!attributes || !keys.length) return false;
  return keys.some((key) => (attributes[key] || []).includes("yes"));
}

/** Score a listing against parsed natural-language intent (higher = better match). */
export function scoreSpaceForIntent(
  space: SpaceIntentMatchInput,
  parsed: ParsedSpaceIntent
): number {
  if (!parsed.rawQuery) return 0;

  let score = 0;
  const type = (space.space_type || "").toLowerCase();
  const attrs = space.attributes || {};
  const haystack = [
    space.title,
    space.description,
    space.city,
    space.suburb,
    space.address_line_1,
    formatSpaceTypeLabel(space.space_type),
    buildAttributeSearchText(space.space_type, attrs),
    getSportTypeBadgeLabels(space.space_type, attrs).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (parsed.inferredSpaceTypes.includes(type)) {
    score += 50;
  }

  if (parsed.suitableFor.length && attributeHasSuitableFor(attrs, parsed.suitableFor)) {
    score += 35;
  }

  if (parsed.sportTypes.length && spaceHasSportTypes(attrs, parsed.sportTypes)) {
    score += 45;
  }

  if (parsed.location) {
    const loc = parsed.location.toLowerCase();
    if (
      (space.city || "").toLowerCase().includes(loc) ||
      (space.suburb || "").toLowerCase().includes(loc)
    ) {
      score += 35;
    }
  }

  if (parsed.capacity) {
    if (capacityBandMatches(attrs, parsed.capacity)) {
      score += 25;
    } else if (haystack.includes(String(parsed.capacity))) {
      score += 10;
    }
  }

  for (const keyword of parsed.keywords) {
    if (space.title?.toLowerCase().includes(keyword)) score += 15;
    else if (haystack.includes(keyword)) score += 5;
  }

  if (parsed.rawQuery.length > 3 && haystack.includes(parsed.rawQuery.toLowerCase())) {
    score += 20;
  }

  return score;
}

export function formatIntentSummary(parsed: ParsedSpaceIntent): string {
  if (!parsed.rawQuery) return "";

  const parts: string[] = [];

  if (parsed.primaryLabel) {
    parts.push(parsed.primaryLabel);
  } else if (parsed.inferredSpaceTypes.length === 1) {
    parts.push(formatSpaceTypeLabel(parsed.inferredSpaceTypes[0]));
  } else if (parsed.inferredSpaceTypes.length > 1) {
    parts.push("Multiple space types");
  }

  if (parsed.capacity) {
    parts.push(`${parsed.capacity} people`);
  }

  if (parsed.sportTypes.length === 1) {
    const label = parsed.sportTypes[0].charAt(0).toUpperCase() + parsed.sportTypes[0].slice(1);
    if (!parts.some((p) => p.toLowerCase().includes(label.toLowerCase()))) {
      parts.unshift(label);
    }
  }

  if (parsed.location) parts.push(parsed.location);
  if (parsed.dateText) parts.push(parsed.dateText);
  if (parsed.timeText) parts.push(parsed.timeText);
  if (parsed.startDate && parsed.endDate && !parsed.dateText) {
    parts.push(`${parsed.startDate} to ${parsed.endDate}`);
  }

  if (parts.length === 0) {
    return parsed.rawQuery.length > 60
      ? `${parsed.rawQuery.slice(0, 60)}…`
      : parsed.rawQuery;
  }

  return parts.join(" · ");
}
