/** Quick facility tags for venue scout fast capture (stored in space_attributes). */

export const SCOUT_TAG_KEY = "scout_tag";

export const VENUE_SCOUT_QUICK_TAGS = [
  { value: "parking", label: "Parking" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "kitchen", label: "Kitchen" },
  { value: "accessible", label: "Accessible" },
  { value: "outdoor", label: "Outdoor area" },
  { value: "air_conditioning", label: "Air conditioning" },
  { value: "security", label: "Security" },
  { value: "loading_bay", label: "Loading bay" },
] as const;

export const SCOUT_ATTR_KEYS = {
  website: "scout_website",
  phone: "scout_phone",
  tag: SCOUT_TAG_KEY,
} as const;

export function scoutAttributesFromForm(input: {
  website?: string;
  phone?: string;
  tags?: string[];
}): Record<string, string[]> {
  const attrs: Record<string, string[]> = {};
  const website = input.website?.trim();
  const phone = input.phone?.trim();
  if (website) attrs[SCOUT_ATTR_KEYS.website] = [website];
  if (phone) attrs[SCOUT_ATTR_KEYS.phone] = [phone];
  if (input.tags?.length) attrs[SCOUT_ATTR_KEYS.tag] = input.tags;
  return attrs;
}

export function scoutFormFromAttributes(
  attributes: Record<string, string[]>
): { website: string; phone: string; tags: string[] } {
  return {
    website: attributes[SCOUT_ATTR_KEYS.website]?.[0] || "",
    phone: attributes[SCOUT_ATTR_KEYS.phone]?.[0] || "",
    tags: attributes[SCOUT_ATTR_KEYS.tag] || [],
  };
}

export function mergeScoutAttributes(
  base: Record<string, string[]>,
  scout: Record<string, string[]>
): Record<string, string[]> {
  const merged = { ...base };
  for (const key of Object.values(SCOUT_ATTR_KEYS)) {
    delete merged[key];
  }
  return { ...merged, ...scout };
}
