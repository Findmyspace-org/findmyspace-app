import {
  SPORT_TYPES_FIELD_KEY,
  SPORT_TYPE_OPTIONS,
} from "@/app/data/spaceFeatureConfig";

const SPORT_SEARCH_ALIASES: Record<string, string[]> = {
  tennis: ["tennis"],
  padel: ["padel"],
  netball: ["netball", "netball court"],
  rugby: ["rugby", "rugby field"],
  soccer: ["soccer", "football", "soccer field"],
  hockey: ["hockey", "hockey pitch"],
  cricket: ["cricket", "cricket pitch"],
  basketball: ["basketball", "basketball court"],
  swimming: ["swimming", "swim", "pool"],
  athletics: ["athletics", "track", "running track"],
  squash: ["squash", "squash court"],
  golf: ["golf"],
  cycling: ["cycling", "cycle", "bike"],
  multi_sport: ["multi-sport", "multisport", "multi sport"],
};

/** Sport type values whose labels or aliases appear in the query. */
export function sportTypesMatchingQuery(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matched = new Set<string>();

  for (const opt of SPORT_TYPE_OPTIONS) {
    const label = opt.label.toLowerCase();
    if (q.includes(label) || label.includes(q)) {
      matched.add(opt.value);
    }
  }

  for (const [sportValue, terms] of Object.entries(SPORT_SEARCH_ALIASES)) {
    if (terms.some((term) => q.includes(term))) {
      matched.add(sportValue);
    }
  }

  return Array.from(matched);
}

export function spaceHasSportTypes(
  attributes: Record<string, string[]> | undefined,
  sportTypes: string[]
): boolean {
  if (!sportTypes.length) return false;
  const selected = attributes?.[SPORT_TYPES_FIELD_KEY] || [];
  return sportTypes.some((sport) => selected.includes(sport));
}

/** Higher score = stronger sport match for browse sort boosting. */
export function sportListingBoostScore(input: {
  spaceType: string | null | undefined;
  attributes: Record<string, string[]> | undefined;
  query: string;
}): number {
  const matched = sportTypesMatchingQuery(input.query);
  if (matched.length === 0) return 0;
  if ((input.spaceType || "").toLowerCase() !== "sport_venue") return 0;
  if (!spaceHasSportTypes(input.attributes, matched)) return 0;
  return 100;
}

/** Extra search terms so alias queries match sport listings in substring search. */
export function sportSearchHaystackExtras(
  spaceType: string | null | undefined,
  attributes: Record<string, string[]> | undefined
): string {
  if ((spaceType || "").toLowerCase() !== "sport_venue") return "";
  const selected = attributes?.[SPORT_TYPES_FIELD_KEY] || [];
  const parts: string[] = [];
  for (const value of selected) {
    const opt = SPORT_TYPE_OPTIONS.find((o) => o.value === value);
    if (opt) parts.push(opt.label);
    const aliases = SPORT_SEARCH_ALIASES[value] || [];
    parts.push(...aliases);
  }
  return parts.join(" ");
}
