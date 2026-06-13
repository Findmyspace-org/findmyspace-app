import type { WhenDurationUnit } from "@/lib/browse-when-filter";

export type SpaceIntentKey = "store" | "park" | "work" | "do" | "host";

export type SpaceIntentDefinition = {
  key: SpaceIntentKey;
  label: string;
  shortLabel: string;
  allTypesLabel: string;
  mappedSpaceTypes: string[];
};

export const SPACE_INTENTS: SpaceIntentDefinition[] = [
  {
    key: "store",
    label: "Store something",
    shortLabel: "Store",
    allTypesLabel: "All storage spaces",
    mappedSpaceTypes: ["storage", "garage", "other"],
  },
  {
    key: "park",
    label: "Park something",
    shortLabel: "Park",
    allTypesLabel: "All parking spaces",
    mappedSpaceTypes: ["parking", "garage"],
  },
  {
    key: "work",
    label: "Work somewhere",
    shortLabel: "Work",
    allTypesLabel: "All work spaces",
    mappedSpaceTypes: [
      "office",
      "desk_coworking",
      "meeting_room",
      "boardroom",
      "workspace",
    ],
  },
  {
    key: "do",
    label: "Do something",
    shortLabel: "Do",
    allTypesLabel: "All activity spaces",
    mappedSpaceTypes: [
      "workshop_studio",
      "meeting_room",
      "boardroom",
      "event_space",
      "sport_venue",
      "other",
    ],
  },
  {
    key: "host",
    label: "Host something",
    shortLabel: "Host",
    allTypesLabel: "All hosting spaces",
    mappedSpaceTypes: ["event_space", "workshop_studio", "sport_venue", "other"],
  },
];

export function parseIntent(value: string | null | undefined): SpaceIntentKey | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return SPACE_INTENTS.some((i) => i.key === v) ? (v as SpaceIntentKey) : null;
}

export function getIntentDefinition(intent: SpaceIntentKey | null) {
  if (!intent) return null;
  return SPACE_INTENTS.find((i) => i.key === intent) || null;
}

export function getSuggestedUnitForIntent(
  intent: SpaceIntentKey | null
): WhenDurationUnit | null {
  if (intent === "park" || intent === "store") return "month";
  if (intent === "work") return "day";
  if (intent === "do" || intent === "host") return "hour";
  return null;
}

