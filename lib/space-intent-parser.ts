/**
 * Rule-based natural language parser for public space browse.
 * V1 — deterministic, no external AI.
 */

export type SpaceIntentConfidence = "low" | "medium" | "high";

export type ParsedSpaceIntent = {
  rawQuery: string;
  inferredSpaceTypes: string[];
  location?: string;
  groupSize?: number;
  dateText?: string;
  timeText?: string;
  durationType?: "hourly" | "daily" | "monthly";
  startDate?: string;
  endDate?: string;
  keywords: string[];
  suitableFor: string[];
  sportTypes: string[];
  confidence: SpaceIntentConfidence;
  /** Human label for primary use case (Party, Tennis, Caravan storage, …). */
  primaryLabel?: string;
};

const KNOWN_LOCATIONS = [
  "Paarl",
  "Wellington",
  "Franschhoek",
  "Stellenbosch",
  "Cape Town",
  "Durbanville",
  "Somerset West",
] as const;

const EVENT_TRIGGERS = [
  "party",
  "birthday",
  "wedding",
  "function",
  "private function",
  "celebration",
  "baby shower",
  "bridal shower",
  "engagement",
  "workshop",
  "presentation",
  "talk",
  "meeting",
  "conference",
  "training",
  "event",
  "host a",
  "hosting",
];

const SPORT_TRIGGERS = [
  "tennis",
  "netball",
  "rugby",
  "soccer",
  "football",
  "hockey",
  "cricket",
  "basketball",
  "padel",
  "squash",
  "swimming",
  "athletics",
  "field",
  "court",
  "pitch",
  "sports hall",
  "sport",
  "coaching",
  "practice",
  "tournament",
  "play ",
];

const STORAGE_TRIGGERS = [
  "storage",
  " store ",
  "warehouse",
  "garage",
  "caravan",
  "boat",
  "trailer",
  "furniture",
  "boxes",
  "long term",
  "month to month",
  "store a",
  "store my",
  "storing",
];

const PARKING_TRIGGERS = [
  "parking",
  " park ",
  "park my",
  "park a",
  "secure parking",
  "trailer parking",
  "vehicle",
  "bakkie",
  "car ",
  "car.",
];

const OFFICE_TRIGGERS = [
  "office",
  "desk",
  "coworking",
  "co-working",
  "meeting room",
  "boardroom",
  "workspace",
  "work space",
  "study",
  "training room",
];

/** Maps NL triggers → event space attribute keys (suitable_for). */
const SUITABLE_FOR_RULES: { triggers: string[]; keys: string[]; label?: string }[] = [
  {
    triggers: ["party", "parties", "celebration", "function"],
    keys: ["sf_ev_suit_private_functions", "sf_ev_suit_birthdays"],
    label: "Party",
  },
  {
    triggers: ["birthday"],
    keys: ["sf_ev_suit_birthdays"],
    label: "Birthday party",
  },
  {
    triggers: ["wedding"],
    keys: ["weddings", "sf_ev_suit_small_weddings"],
    label: "Wedding",
  },
  {
    triggers: ["baby shower"],
    keys: ["sf_ev_suit_baby_showers"],
    label: "Baby shower",
  },
  {
    triggers: ["bridal shower"],
    keys: ["sf_ev_suit_bridal_showers"],
    label: "Bridal shower",
  },
  {
    triggers: ["workshop"],
    keys: ["sf_ev_suit_workshops"],
    label: "Workshop",
  },
  {
    triggers: ["presentation"],
    keys: ["sf_ev_suit_presentations"],
    label: "Presentation",
  },
  {
    triggers: ["talk", "talks"],
    keys: ["sf_ev_suit_talks"],
    label: "Talk",
  },
  {
    triggers: ["meeting", "meetings", "conference"],
    keys: ["sf_ev_suit_meetings"],
    label: "Meeting",
  },
  {
    triggers: ["training"],
    keys: ["sf_ev_suit_training"],
    label: "Training",
  },
];

const SPORT_TYPE_RULES: { triggers: string[]; value: string; label: string }[] = [
  { triggers: ["tennis"], value: "tennis", label: "Tennis" },
  { triggers: ["padel"], value: "padel", label: "Padel" },
  { triggers: ["netball"], value: "netball", label: "Netball" },
  { triggers: ["rugby"], value: "rugby", label: "Rugby" },
  { triggers: ["soccer", "football"], value: "soccer", label: "Soccer" },
  { triggers: ["hockey"], value: "hockey", label: "Hockey" },
  { triggers: ["cricket"], value: "cricket", label: "Cricket" },
  { triggers: ["basketball"], value: "basketball", label: "Basketball" },
  { triggers: ["swimming", "swim"], value: "swimming", label: "Swimming" },
  { triggers: ["athletics", "track"], value: "athletics", label: "Athletics" },
  { triggers: ["squash"], value: "squash", label: "Squash" },
];

function normalizeQuery(query: string): string {
  return ` ${query.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function containsAny(haystack: string, triggers: string[]): boolean {
  return triggers.some((t) => haystack.includes(t));
}

function extractGroupSize(query: string): number | undefined {
  const patterns = [
    /\bfor\s+(\d{1,4})\s+(?:people|guests|pax|persons|attendees|players)\b/i,
    /\b(\d{1,4})\s+(?:people|guests|pax|persons|attendees|players)\b/i,
    /\bteam\s+of\s+(\d{1,4})\b/i,
    /\b(\d{1,4})\s+person\b/i,
    /\bvenue\s+for\s+(\d{1,4})\b/i,
    /\broom\s+for\s+(\d{1,4})\b/i,
    /\bfor\s+(\d{1,4})\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0 && n < 5000) return n;
    }
  }
  return undefined;
}

function extractLocation(query: string): string | undefined {
  const lower = query.toLowerCase();
  for (const loc of KNOWN_LOCATIONS) {
    if (lower.includes(loc.toLowerCase())) return loc;
  }
  const inMatch = query.match(/\bin\s+([A-Za-z][A-Za-z\s-]{2,40})\b/);
  if (inMatch) {
    const candidate = inMatch[1].trim();
    const stopWords = ["paarl", "a", "the", "my", "an"];
    if (!stopWords.includes(candidate.toLowerCase()) && candidate.length <= 40) {
      return candidate
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }
  return undefined;
}

function extractDateTime(query: string): {
  dateText?: string;
  timeText?: string;
  startDate?: string;
  endDate?: string;
} {
  const lower = query.toLowerCase();
  let dateText: string | undefined;
  let timeText: string | undefined;
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (lower.includes("tomorrow")) dateText = "Tomorrow";
  else if (lower.includes("today")) dateText = "Today";
  else if (lower.includes("next week")) dateText = "Next week";

  const weekdayMatch = lower.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (weekdayMatch) {
    dateText = weekdayMatch[1].charAt(0).toUpperCase() + weekdayMatch[1].slice(1);
  }

  const rangeMatch = query.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+to\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (rangeMatch) {
    startDate = rangeMatch[1];
    endDate = rangeMatch[2];
    dateText = `${startDate} to ${endDate}`;
  }

  const time12 = query.match(/\b(\d{1,2})\s*(?:pm|am)\b/i);
  const time24 = query.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const atTime = query.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:pm|am)?)\b/i);

  if (atTime) timeText = atTime[1].trim();
  else if (time12) timeText = time12[0].trim();
  else if (time24) timeText = time24[0];

  if (lower.includes("afternoon")) timeText = timeText || "Afternoon";
  if (lower.includes("morning")) timeText = timeText || "Morning";

  return { dateText, timeText, startDate, endDate };
}

function extractDurationType(haystack: string): ParsedSpaceIntent["durationType"] {
  if (
    containsAny(haystack, [
      " long term",
      "month to month",
      "monthly",
      "january to",
      "from january",
      "per month",
    ])
  ) {
    return "monthly";
  }
  if (
    containsAny(haystack, [" per day", "daily", " full day", "for a day"]) ||
    haystack.includes(" tomorrow ")
  ) {
    return "daily";
  }
  if (
    containsAny(haystack, ["4pm", "am", "pm", "hour", "hourly", " per hour"]) ||
    haystack.includes(" at ")
  ) {
    return "hourly";
  }
  return undefined;
}

function extractKeywords(query: string): string[] {
  const stop = new Set([
    "a",
    "an",
    "the",
    "for",
    "in",
    "at",
    "to",
    "from",
    "i",
    "want",
    "need",
    "looking",
    "space",
    "people",
    "my",
    "play",
  ]);
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

function scoreCategory(
  haystack: string,
  triggers: string[],
  weight: number
): number {
  let score = 0;
  for (const t of triggers) {
    if (haystack.includes(t)) score += weight;
  }
  return score;
}

export function parseSpaceIntent(query: string): ParsedSpaceIntent {
  const rawQuery = query.trim();
  if (!rawQuery) {
    return {
      rawQuery: "",
      inferredSpaceTypes: [],
      keywords: [],
      suitableFor: [],
      sportTypes: [],
      confidence: "low",
    };
  }

  const haystack = normalizeQuery(rawQuery);
  const groupSize = extractGroupSize(rawQuery);
  const location = extractLocation(rawQuery);
  const { dateText, timeText, startDate, endDate } = extractDateTime(rawQuery);
  const durationType = extractDurationType(haystack);
  const keywords = extractKeywords(rawQuery);

  const eventScore = scoreCategory(haystack, EVENT_TRIGGERS, 2);
  const sportScore = scoreCategory(haystack, SPORT_TRIGGERS, 2);
  const storageScore = scoreCategory(haystack, STORAGE_TRIGGERS, 2);
  const parkingScore = scoreCategory(haystack, PARKING_TRIGGERS, 2);
  const officeScore = scoreCategory(haystack, OFFICE_TRIGGERS, 2);

  const inferredSpaceTypes: string[] = [];
  const suitableFor: string[] = [];
  const sportTypes: string[] = [];
  let primaryLabel: string | undefined;

  const categories: { score: number; types: string[]; label?: string }[] = [
    { score: eventScore, types: ["event_space"], label: "Event" },
    { score: sportScore, types: ["sport_venue"], label: "Sport" },
    { score: storageScore, types: ["storage"], label: "Storage" },
    { score: parkingScore, types: ["parking"], label: "Parking" },
    {
      score: officeScore,
      types: ["meeting_room", "boardroom", "office", "desk_coworking", "workspace"],
      label: "Workspace",
    },
  ];

  categories.sort((a, b) => b.score - a.score);
  const top = categories[0];
  const second = categories[1];

  if (top.score > 0) {
    if (top.score >= second.score * 1.5 || second.score === 0) {
      inferredSpaceTypes.push(...top.types);
      primaryLabel = top.label;
    } else if (top.score === second.score) {
      inferredSpaceTypes.push(...top.types, ...second.types);
    } else {
      inferredSpaceTypes.push(...top.types);
      primaryLabel = top.label;
    }
  }

  for (const rule of SUITABLE_FOR_RULES) {
    if (containsAny(haystack, rule.triggers)) {
      suitableFor.push(...rule.keys);
      if (!primaryLabel && rule.label) primaryLabel = rule.label;
    }
  }

  for (const rule of SPORT_TYPE_RULES) {
    if (containsAny(haystack, rule.triggers)) {
      sportTypes.push(rule.value);
      if (!primaryLabel) primaryLabel = rule.label;
    }
  }

  if (haystack.includes("caravan") || haystack.includes("trailer")) {
    keywords.push("caravan", "trailer");
    if (!primaryLabel && storageScore >= parkingScore) {
      primaryLabel = "Caravan storage";
    } else if (!primaryLabel) {
      primaryLabel = "Trailer parking";
    }
  }

  if (haystack.includes("meeting room") || haystack.includes("boardroom")) {
    if (!inferredSpaceTypes.includes("meeting_room")) {
      inferredSpaceTypes.unshift("meeting_room");
    }
    if (!primaryLabel) primaryLabel = "Meeting room";
  }

  if (haystack.includes("play tennis") || haystack.includes("tennis")) {
    if (!inferredSpaceTypes.includes("sport_venue")) {
      inferredSpaceTypes.unshift("sport_venue");
    }
    if (!sportTypes.includes("tennis")) sportTypes.push("tennis");
    primaryLabel = "Tennis";
  }

  const uniqueTypes = Array.from(new Set(inferredSpaceTypes));
  const uniqueSuitable = Array.from(new Set(suitableFor));
  const uniqueSports = Array.from(new Set(sportTypes));

  let confidence: SpaceIntentConfidence = "low";
  const signals =
    (uniqueTypes.length > 0 ? 1 : 0) +
    (location ? 1 : 0) +
    (groupSize ? 1 : 0) +
    (uniqueSports.length > 0 ? 1 : 0) +
    (uniqueSuitable.length > 0 ? 1 : 0);

  if (signals >= 3 || (uniqueTypes.length > 0 && top.score >= 4)) {
    confidence = "high";
  } else if (signals >= 2 || uniqueTypes.length > 0 || top.score >= 2) {
    confidence = "medium";
  }

  return {
    rawQuery,
    inferredSpaceTypes: uniqueTypes,
    location,
    groupSize,
    dateText,
    timeText,
    durationType,
    startDate,
    endDate,
    keywords: Array.from(new Set(keywords)),
    suitableFor: uniqueSuitable,
    sportTypes: uniqueSports,
    confidence,
    primaryLabel,
  };
}

/** Split browse chip intent keys from natural-language intent param. */
export function resolveBrowseIntentParam(value: string | null | undefined): {
  browseIntentKey: string | null;
  naturalLanguageQuery: string;
} {
  const trimmed = value?.trim() || "";
  if (!trimmed) return { browseIntentKey: null, naturalLanguageQuery: "" };

  const browseKeys = new Set(["store", "park", "work", "do", "host"]);
  if (browseKeys.has(trimmed.toLowerCase())) {
    return { browseIntentKey: trimmed.toLowerCase(), naturalLanguageQuery: "" };
  }

  return { browseIntentKey: null, naturalLanguageQuery: trimmed };
}
