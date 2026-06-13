/**
 * Space-type-specific feature definitions for listing forms and display.
 * Values persist in space_attributes (attribute_key + attribute_value); no schema change.
 */

export type LucideIconName = string;

export type SpaceFeatureCheckbox = {
  kind: "checkbox";
  key: string;
  label: string;
  icon: LucideIconName;
};

export type SpaceFeatureRadio = {
  kind: "radio";
  key: string;
  label: string;
  icon: LucideIconName;
  options: { value: string; label: string }[];
};

export type SpaceFeatureMultiselect = {
  kind: "multiselect";
  key: string;
  label: string;
  icon: LucideIconName;
  options: { value: string; label: string }[];
};

export type SpaceFeatureField =
  | SpaceFeatureCheckbox
  | SpaceFeatureRadio
  | SpaceFeatureMultiselect;

export type SpaceFeatureSubsection = {
  id: string;
  title: string;
  fields: SpaceFeatureField[];
};

export type SpaceFeatureSection = {
  id: string;
  title: string;
  fields: SpaceFeatureField[];
  subsections?: SpaceFeatureSubsection[];
};

export type SpaceFeatureLayout = {
  sections: SpaceFeatureSection[];
};

/** Human labels for spaces.space_type (DB values). */
export const SPACE_TYPE_LABELS: Record<string, string> = {
  office: "Office",
  meeting_room: "Meeting room",
  boardroom: "Boardroom",
  desk_coworking: "Desk / coworking",
  parking: "Parking",
  storage: "Storage",
  event_space: "Event space",
  workshop_studio: "Workshop / studio",
  sport_venue: "Sport venue",
  garage: "Garage",
  workspace: "Workspace / coworking",
  other: "Other",
};

const cb = (
  key: string,
  label: string,
  icon: LucideIconName
): SpaceFeatureCheckbox => ({ kind: "checkbox", key, label, icon });

const radio = (
  key: string,
  label: string,
  icon: LucideIconName,
  options: { value: string; label: string }[]
): SpaceFeatureRadio => ({ kind: "radio", key, label, icon, options });

const multi = (
  key: string,
  label: string,
  icon: LucideIconName,
  options: { value: string; label: string }[]
): SpaceFeatureMultiselect => ({ kind: "multiselect", key, label, icon, options });

const ACCESS_BUILDING_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_access_24_7", "24/7 access", "Clock"),
  cb("sf_weekend_access", "Weekend access", "CalendarDays"),
  cb("sf_secure_entry", "Secure entry", "ShieldCheck"),
  cb("sf_cctv", "CCTV", "Cctv"),
  cb("sf_gated", "Gated", "Fence"),
  cb("sf_wheelchair", "Wheelchair accessible", "Accessibility"),
  cb("sf_ground_floor", "Ground floor", "Layers"),
  cb("sf_elevator", "Elevator access", "ArrowUpFromLine"),
];

const OFFICE_CONNECTIVITY_TECH_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_wifi_high_speed", "High-speed WiFi", "Wifi"),
  cb("sf_printing", "Printing", "Printer"),
  cb("sf_scanning", "Scanning", "ScanLine"),
  cb("sf_video_conferencing", "Video conferencing setup", "Video"),
  cb("sf_hdmi_usbc", "HDMI / USB-C connection", "Cable"),
];

const OFFICE_COMFORT_ENVIRONMENT_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_aircon", "Air conditioning", "Wind"),
  cb("sf_natural_light", "Natural light", "Sun"),
  cb("sf_ergonomic_furniture", "Ergonomic furniture", "Armchair"),
  cb("sf_quiet_workspace", "Quiet workspace", "VolumeX"),
  cb("sf_phone_booth", "Phone booth", "Phone"),
  cb("sf_private_toilet", "Private toilet", "Bath"),
  cb("sf_shared_bathroom", "Shared bathroom", "Droplets"),
];

const OFFICE_WORKSPACE_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_desk_included", "Desk included", "Laptop"),
  cb("sf_standing_desk", "Standing desk", "ArrowUpDown"),
  cb("sf_storage_cabinet", "Storage cabinet", "Archive"),
  cb("sf_kitchen_access", "Kitchen access", "UtensilsCrossed"),
  cb("sf_coffee_tea", "Coffee / tea", "Coffee"),
  cb("sf_meeting_room_access", "Meeting room access", "Users"),
];

const MEETING_CAPACITY_RADIO = radio(
  "sf_capacity_band",
  "Capacity",
  "Users",
  [
    { value: "2_4", label: "2–4 people" },
    { value: "5_8", label: "5–8 people" },
    { value: "9_15", label: "9–15 people" },
    { value: "15_plus", label: "15+ people" },
  ]
);

const MEETING_ROOM_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_tv_screen", "TV / screen", "Tv"),
  cb("sf_projector", "Projector", "Projector"),
  cb("sf_whiteboard", "Whiteboard", "Presentation"),
  cb("sf_flip_chart", "Flip chart", "FileText"),
];

const MEETING_CONNECTIVITY_TECH_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_wifi_high_speed", "High-speed WiFi", "Wifi"),
  cb("sf_video_conferencing", "Video conferencing setup", "Video"),
  cb("sf_hdmi_usbc", "HDMI / USB-C connection", "Cable"),
];

const MEETING_COMFORT_ENVIRONMENT_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_aircon", "Air conditioning", "Wind"),
  cb("sf_soundproofing", "Soundproofing", "Mic"),
  cb("sf_natural_light", "Natural light", "Sun"),
  cb("sf_coffee_tea", "Coffee / tea", "Coffee"),
  cb("sf_catering", "Catering available", "UtensilsCrossed"),
  cb("sf_reception", "Reception service", "Bell"),
];

const PARKING_TYPE_RADIO = radio(
  "sf_parking_type",
  "Parking type",
  "Car",
  [
    { value: "indoor", label: "Indoor" },
    { value: "outdoor", label: "Outdoor" },
    { value: "covered", label: "Covered" },
    { value: "garage", label: "Garage" },
    { value: "basement", label: "Basement" },
  ]
);

const PARKING_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_gated", "Gated", "Fence"),
  cb("sf_guarded", "Guarded", "Shield"),
  cb("sf_cctv", "CCTV", "Cctv"),
  cb("sf_pk_remote_access", "Remote access", "RadioReceiver"),
  cb("sf_access_24_7", "24/7 access", "Clock"),
  cb("sf_pk_daytime_only", "Daytime only", "Sun"),
  cb("sf_pk_night_access", "Night access", "Moon"),
];

const PARKING_CONVENIENCE_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_pk_ev_charging", "Electric charging", "PlugZap"),
  cb("sf_pk_wide_bay", "Wide bay", "StretchHorizontal"),
  cb("sf_pk_near_entrance", "Near entrance", "DoorOpen"),
  cb("sf_pk_easy_access", "Easy access", "CircleCheck"),
];

const VEHICLE_MULTI = multi("sf_vehicle_types", "Vehicle suitability", "Truck", [
  { value: "small_car", label: "Small car" },
  { value: "suv", label: "SUV" },
  { value: "bakkie", label: "Bakkie" },
  { value: "trailer", label: "Trailer" },
  { value: "caravan", label: "Caravan" },
  { value: "boat", label: "Boat" },
]);

/** Sport sub-types for sport_venue listings (multiselect in space_attributes). */
export const SPORT_TYPES_FIELD_KEY = "sf_sport_types";

export const SPORT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "tennis", label: "Tennis" },
  { value: "padel", label: "Padel" },
  { value: "netball", label: "Netball" },
  { value: "rugby", label: "Rugby" },
  { value: "soccer", label: "Soccer" },
  { value: "hockey", label: "Hockey" },
  { value: "cricket", label: "Cricket" },
  { value: "basketball", label: "Basketball" },
  { value: "swimming", label: "Swimming" },
  { value: "athletics", label: "Athletics" },
  { value: "squash", label: "Squash" },
  { value: "golf", label: "Golf" },
  { value: "cycling", label: "Cycling" },
  { value: "multi_sport", label: "Multi-sport" },
];

const SPORT_TYPES_MULTI = multi(
  SPORT_TYPES_FIELD_KEY,
  "Sport types",
  "Users",
  SPORT_TYPE_OPTIONS
);

const SPORT_VENUE_SUITABLE_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_sp_suit_fitness", "Fitness classes", "Users"),
  cb("sf_sp_suit_coaching", "Coaching", "Mic"),
  cb("sf_sp_suit_team_practice", "Team practice", "Users"),
  cb("sf_sp_suit_tournaments", "Tournaments", "Sparkles"),
  cb("sf_sp_suit_school_sports", "School sports days", "BookOpen"),
];

const SPORT_FACILITIES_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_sp_floodlights", "Floodlights", "Lightbulb"),
  cb("sf_sp_changing_rooms", "Change rooms", "DoorOpen"),
  cb("sf_sp_toilets", "Toilets", "Bath"),
  cb("sf_sp_seating", "Seating / stands", "Users"),
  cb("sf_sp_parking", "Parking", "ParkingCircle"),
  cb("sf_sp_clubhouse", "Clubhouse", "Building2"),
  cb("sf_sp_equipment", "Equipment available", "Package"),
  cb("sf_sp_scoreboard", "Scoreboard", "Tv"),
  cb("sf_sp_water_access", "Water access", "Droplets"),
  cb("sf_sp_first_aid", "First aid point", "ShieldCheck"),
];

const SPORT_SURFACE_RADIO = radio(
  "sf_sp_surface",
  "Surface",
  "Layers",
  [
    { value: "indoor", label: "Indoor" },
    { value: "outdoor", label: "Outdoor" },
    { value: "grass", label: "Grass" },
    { value: "astro", label: "Astro turf" },
    { value: "hard_court", label: "Hard court" },
    { value: "clay", label: "Clay court" },
    { value: "pool", label: "Swimming pool" },
  ]
);

const STORAGE_TYPE_RADIO = radio(
  "sf_storage_type",
  "Storage type",
  "Warehouse",
  [
    { value: "indoor", label: "Indoor" },
    { value: "outdoor", label: "Outdoor" },
    { value: "garage", label: "Garage" },
    { value: "warehouse", label: "Warehouse" },
  ]
);

const STORAGE_SIZE_RADIO = radio(
  "sf_storage_size_band",
  "Size",
  "Ruler",
  [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
  ]
);

const STORAGE_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_cctv", "CCTV", "Cctv"),
  cb("sf_gated", "Gated", "Fence"),
  cb("sf_guarded", "Guarded", "Shield"),
  cb("sf_st_lockable", "Lockable", "Lock"),
];

const STORAGE_ACCESS_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_access_24_7", "24/7 access", "Clock"),
  cb("sf_st_limited_hours", "Limited hours", "Clock3"),
];

const STORAGE_CONDITIONS_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_st_dry", "Dry", "Sun"),
  cb("sf_st_climate", "Climate controlled", "Thermometer"),
  cb("sf_st_ventilated", "Ventilated", "Fan"),
];

const EVENT_VENUE_RADIO = radio(
  "sf_event_venue_type",
  "Venue type",
  "Building2",
  [
    { value: "indoor", label: "Indoor" },
    { value: "outdoor", label: "Outdoor" },
    { value: "mixed", label: "Mixed" },
  ]
);

const EVENT_CAPACITY_RADIO = radio(
  "sf_event_capacity",
  "Capacity",
  "Users",
  [
    { value: "up_to_20", label: "Up to 20" },
    { value: "20_50", label: "20–50" },
    { value: "50_100", label: "50–100" },
    { value: "100_plus", label: "100+" },
  ]
);

const EVENT_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ev_stage", "Stage / DJ area", "Music2"),
  cb("sf_ev_sound", "Sound system", "Speaker"),
  cb("sf_ev_lighting", "Lighting", "Lightbulb"),
  cb("sf_ev_projector", "Projector / screen", "Projector"),
];

const EVENT_FACILITIES_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ev_kitchen", "Kitchen", "ChefHat"),
  cb("sf_ev_bar", "Bar area", "Wine"),
  cb("sf_ev_toilets", "Toilets", "Bath"),
  cb("sf_ev_parking", "Parking available", "ParkingCircle"),
];

const EVENT_SERVICES_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ev_alcohol", "Alcohol allowed", "Beer"),
  cb("sf_ev_music", "Music allowed", "Music"),
  cb("sf_ev_late_night", "Late night allowed", "Moon"),
  cb("sf_ev_cleaning", "Cleaning service", "Sparkles"),
  cb("sf_ev_security", "Security", "Shield"),
];

const EVENT_ACCESS_LOGISTICS_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_access_24_7", "24/7 access", "Clock"),
  cb("sf_weekend_access", "Weekend access", "CalendarDays"),
  cb("sf_secure_entry", "Secure entry", "ShieldCheck"),
  cb("sf_cctv", "CCTV", "Cctv"),
  cb("sf_gated", "Gated", "Fence"),
  cb("sf_ground_floor", "Ground floor", "Layers"),
  cb("sf_elevator", "Elevator access", "ArrowUpFromLine"),
];

const EVENT_SUITABLE_BUSINESS_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ev_suit_meetings", "Meetings", "Users"),
  cb("sf_ev_suit_presentations", "Presentations", "Presentation"),
  cb("sf_ev_suit_workshops", "Workshops", "Lightbulb"),
  cb("sf_ev_suit_training", "Training sessions", "Laptop"),
  cb("sf_ev_suit_team_building", "Team building", "Users"),
  cb("sf_ev_suit_networking", "Networking events", "RadioReceiver"),
  cb("sf_ev_suit_product_launch", "Product launches", "Sparkles"),
  cb("sf_ev_suit_interviews", "Interviews", "Phone"),
  cb("sf_ev_suit_coworking", "Co-working", "Laptop"),
];

const EVENT_SUITABLE_CONTENT_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ev_suit_podcast", "Podcast recording", "Mic"),
  cb("sf_ev_suit_video", "Video recording", "Video"),
  cb("sf_ev_suit_photography", "Photography shoot", "Camera"),
  cb("sf_ev_suit_content_creation", "Content creation", "FileText"),
  cb("sf_ev_suit_live_streaming", "Live streaming", "RadioReceiver"),
  cb("sf_ev_suit_youtube", "YouTube production", "Tv"),
  cb("film_shoots", "Film shoots", "Camera"),
];

const EVENT_SUITABLE_SOCIAL_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ev_suit_private_functions", "Private functions", "Wine"),
  cb("sf_ev_suit_birthdays", "Birthday celebrations", "CalendarDays"),
  cb("sf_ev_suit_baby_showers", "Baby showers", "Gift"),
  cb("sf_ev_suit_bridal_showers", "Bridal showers", "Sparkles"),
  cb("sf_ev_suit_small_weddings", "Small weddings", "Heart"),
  cb("sf_ev_suit_family_gatherings", "Family gatherings", "Users"),
  cb("weddings", "Weddings", "Heart"),
];

const EVENT_SUITABLE_COMMUNITY_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ev_suit_talks", "Talks & speakers", "Mic"),
  cb("sf_ev_suit_church", "Church gatherings", "Building2"),
  cb("sf_ev_suit_community_meetings", "Community meetings", "Users"),
  cb("sf_ev_suit_book_clubs", "Book clubs", "BookOpen"),
  cb("sf_ev_suit_classes", "Classes", "Presentation"),
];

const EVENT_CONNECTIVITY_BUSINESS_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ev_conn_wifi_free", "Free WiFi", "Wifi"),
  cb("sf_ev_conn_wifi_high_speed", "High-speed WiFi", "Wifi"),
  cb("sf_ev_conn_fibre", "Fibre internet", "Cable"),
  cb("sf_ev_conn_guest_wifi", "Guest network", "Wifi"),
  cb("sf_ev_conn_power", "Power points available", "Plug"),
  cb("sf_ev_conn_screen", "Presentation screen", "Tv"),
  cb("sf_ev_conn_projector", "Projector", "Projector"),
  cb("sf_ev_conn_whiteboard", "Whiteboard", "StretchHorizontal"),
  cb("sf_ev_conn_flipchart", "Flipchart", "FileText"),
  cb("sf_ev_conn_microphone", "Microphone", "Mic"),
  cb("sf_ev_conn_sound_system", "Sound system", "Speaker"),
];

const WORKSHOP_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_ws_power", "Power outlets", "Plug"),
  cb("sf_ws_high_ceilings", "High ceilings", "ArrowUpToLine"),
  cb("sf_ws_ventilation", "Ventilation", "Fan"),
  cb("sf_ws_water", "Water access", "Droplets"),
  cb("sf_ws_workbenches", "Workbenches", "Hammer"),
  cb("sf_ws_tools", "Tools included", "Wrench"),
  cb("sf_ws_racks", "Storage racks", "Package"),
  cb("sf_ws_industrial_access", "Industrial access", "Truck"),
];

function section(
  id: string,
  title: string,
  fields: SpaceFeatureField[],
  subsections?: SpaceFeatureSubsection[]
): SpaceFeatureSection {
  return subsections ? { id, title, fields, subsections } : { id, title, fields };
}

function subsection(
  id: string,
  title: string,
  fields: SpaceFeatureField[]
): SpaceFeatureSubsection {
  return { id, title, fields };
}

export const spaceFeatureLayouts: Record<string, SpaceFeatureLayout> = {
  office: {
    sections: [
      section("workspace_features", "Workspace features", OFFICE_WORKSPACE_CHECKS),
      section("connectivity_tech", "Connectivity & tech", OFFICE_CONNECTIVITY_TECH_CHECKS),
      section("comfort_environment", "Comfort & environment", OFFICE_COMFORT_ENVIRONMENT_CHECKS),
      section("access_building", "Access & building", ACCESS_BUILDING_CHECKS),
    ],
  },

  meeting_room: {
    sections: [
      section("capacity", "Layout", [MEETING_CAPACITY_RADIO]),
      section("workspace_features", "Workspace features", MEETING_ROOM_CHECKS),
      section("connectivity_tech", "Connectivity & tech", MEETING_CONNECTIVITY_TECH_CHECKS),
      section("comfort_environment", "Comfort & environment", MEETING_COMFORT_ENVIRONMENT_CHECKS),
      section("access_building", "Access & building", ACCESS_BUILDING_CHECKS),
    ],
  },

  boardroom: {
    sections: [
      section("capacity", "Layout", [MEETING_CAPACITY_RADIO]),
      section("workspace_features", "Workspace features", MEETING_ROOM_CHECKS),
      section("connectivity_tech", "Connectivity & tech", MEETING_CONNECTIVITY_TECH_CHECKS),
      section("comfort_environment", "Comfort & environment", MEETING_COMFORT_ENVIRONMENT_CHECKS),
      section("access_building", "Access & building", ACCESS_BUILDING_CHECKS),
    ],
  },

  desk_coworking: {
    sections: [
      section("workspace_features", "Workspace features", OFFICE_WORKSPACE_CHECKS),
      section("connectivity_tech", "Connectivity & tech", OFFICE_CONNECTIVITY_TECH_CHECKS),
      section("comfort_environment", "Comfort & environment", OFFICE_COMFORT_ENVIRONMENT_CHECKS),
      section("access_building", "Access & building", ACCESS_BUILDING_CHECKS),
    ],
  },

  parking: {
    sections: [
      section("parking_type", "Parking type", [PARKING_TYPE_RADIO]),
      section("security_access", "Security & access", PARKING_CHECKS),
      section("convenience", "Convenience", PARKING_CONVENIENCE_CHECKS),
      section("vehicle_suitability", "Vehicle suitability", [VEHICLE_MULTI]),
    ],
  },

  storage: {
    sections: [
      section("storage_type", "Storage type", [STORAGE_TYPE_RADIO, STORAGE_SIZE_RADIO]),
      section("security", "Security", STORAGE_CHECKS),
      section("access", "Access", STORAGE_ACCESS_CHECKS),
      section("conditions", "Conditions", STORAGE_CONDITIONS_CHECKS),
    ],
  },

  event_space: {
    sections: [
      section("suitable_for", "Suitable for", [], [
        subsection("business", "Business", EVENT_SUITABLE_BUSINESS_CHECKS),
        subsection("content_creation", "Content creation", EVENT_SUITABLE_CONTENT_CHECKS),
        subsection("social_private", "Social & private", EVENT_SUITABLE_SOCIAL_CHECKS),
        subsection("community", "Community", EVENT_SUITABLE_COMMUNITY_CHECKS),
      ]),
      section("venue_features", "Venue features", [EVENT_VENUE_RADIO, EVENT_CAPACITY_RADIO, ...EVENT_CHECKS]),
      section("connectivity_business", "Connectivity & business facilities", EVENT_CONNECTIVITY_BUSINESS_CHECKS),
      section("facilities", "Facilities", EVENT_FACILITIES_CHECKS),
      section("services", "Services", EVENT_SERVICES_CHECKS),
      section("access_logistics", "Access & logistics", EVENT_ACCESS_LOGISTICS_CHECKS),
    ],
  },

  workshop_studio: {
    sections: [
      section("studio", "Studio & utilities", WORKSHOP_CHECKS),
      section("access_building", "Access & building", ACCESS_BUILDING_CHECKS),
    ],
  },

  sport_venue: {
    sections: [
      section("sport_types", "Sport types", [SPORT_TYPES_MULTI]),
      section("suitable_for", "Suitable for", SPORT_VENUE_SUITABLE_CHECKS),
      section("facilities", "Facilities", SPORT_FACILITIES_CHECKS),
      section("surface", "Surface", [SPORT_SURFACE_RADIO]),
      section("access_building", "Access & building", ACCESS_BUILDING_CHECKS),
    ],
  },

  other: {
    sections: [
      section("access_building", "Access & building", ACCESS_BUILDING_CHECKS),
    ],
  },
};

const FEATURE_KEY_ALIASES: Record<string, string[]> = {
  sf_gated: ["sf_gated_access", "sf_pk_gated", "sf_st_gated"],
  sf_cctv: ["sf_pk_cctv", "sf_st_cctv"],
  sf_access_24_7: ["sf_pk_24_7", "sf_st_24_7"],
  sf_wifi_high_speed: ["sf_mr_wifi"],
  sf_aircon: ["sf_mr_aircon"],
  sf_natural_light: ["sf_mr_natural_light"],
  sf_coffee_tea: ["sf_mr_coffee_tea"],
};

const aliasToCanonicalMap: Map<string, string> = new Map();

for (const [canonical, aliases] of Object.entries(FEATURE_KEY_ALIASES)) {
  aliasToCanonicalMap.set(canonical, canonical);
  for (const alias of aliases) {
    aliasToCanonicalMap.set(alias, canonical);
  }
}

export function toCanonicalFeatureKey(key: string): string {
  return aliasToCanonicalMap.get(key) || key;
}

export function getFeatureAliasKeys(canonicalKey: string): string[] {
  return FEATURE_KEY_ALIASES[canonicalKey] || [];
}

export function normalizeFeatureAttributes(
  attributes: Record<string, string[]>
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [rawKey, rawValues] of Object.entries(attributes || {})) {
    const canonicalKey = toCanonicalFeatureKey(rawKey);
    const current = normalized[canonicalKey] || [];
    const incoming = rawValues || [];
    normalized[canonicalKey] = Array.from(new Set([...current, ...incoming]));
  }
  return normalized;
}

/** Map legacy DB space_type values to config keys used in spaceFeatureLayouts. */
export function normalizeSpaceTypeForFeatures(spaceType: string | null | undefined): string {
  const s = (spaceType || "other").trim().toLowerCase();
  if (s === "workspace") return "desk_coworking";
  if (s === "garage") return "parking";
  return spaceFeatureLayouts[s] ? s : "other";
}

export function getSpaceFeatureLayout(spaceType: string | null | undefined): SpaceFeatureLayout {
  const key = normalizeSpaceTypeForFeatures(spaceType);
  return spaceFeatureLayouts[key] || spaceFeatureLayouts.other;
}

/** Flat registry of all field keys → definition (for display). */
const fieldRegistry: Map<string, SpaceFeatureField> = new Map();

export function sectionFields(sec: SpaceFeatureSection): SpaceFeatureField[] {
  return [
    ...sec.fields,
    ...(sec.subsections?.flatMap((sub) => sub.fields) ?? []),
  ];
}

function registerFields(layout: SpaceFeatureLayout) {
  for (const sec of layout.sections) {
    for (const f of sectionFields(sec)) {
      fieldRegistry.set(f.key, f);
    }
  }
}

for (const layout of Object.values(spaceFeatureLayouts)) {
  registerFields(layout);
}

function validateLayoutNoDuplicates(layoutKey: string, layout: SpaceFeatureLayout) {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const sec of layout.sections) {
    for (const f of sectionFields(sec)) {
      const canonicalKey = toCanonicalFeatureKey(f.key);
      if (seen.has(canonicalKey)) {
        duplicates.push(canonicalKey);
      } else {
        seen.add(canonicalKey);
      }
    }
  }
  if (duplicates.length > 0 && process.env.NODE_ENV !== "production") {
    throw new Error(
      `Duplicate features in "${layoutKey}" layout: ${Array.from(new Set(duplicates)).join(", ")}`
    );
  }
}

for (const [layoutKey, layout] of Object.entries(spaceFeatureLayouts)) {
  validateLayoutNoDuplicates(layoutKey, layout);
}

export function getSpaceFeatureField(key: string): SpaceFeatureField | undefined {
  return fieldRegistry.get(key);
}

export function getOptionLabel(field: SpaceFeatureField, value: string): string {
  if (field.kind === "radio" || field.kind === "multiselect") {
    return field.options.find((o) => o.value === value)?.label || value;
  }
  return value;
}

/** Active checkbox labels for a layout section (e.g. suitable_for on event spaces). */
export function getSectionCheckboxLabels(
  spaceType: string | null | undefined,
  attributes: Record<string, string[]>,
  sectionId: string
): string[] {
  const layout = getSpaceFeatureLayout(spaceType);
  const normalized = normalizeFeatureAttributes(attributes);
  const section = layout.sections.find((sec) => sec.id === sectionId);
  if (!section) return [];

  return sectionFields(section)
    .filter((field): field is SpaceFeatureCheckbox => field.kind === "checkbox")
    .filter((field) =>
      (normalized[toCanonicalFeatureKey(field.key)] || []).includes("yes")
    )
    .map((field) => field.label);
}

/** Badge labels for sport sub-types on listing cards and detail pages. */
export function getSportTypeBadgeLabels(
  spaceType: string | null | undefined,
  attributes: Record<string, string[]> | undefined
): string[] {
  if ((spaceType || "").toLowerCase() !== "sport_venue") return [];
  const field = getSpaceFeatureField(SPORT_TYPES_FIELD_KEY);
  if (!field || field.kind !== "multiselect") return [];
  const normalized = normalizeFeatureAttributes(attributes || {});
  const values = normalized[SPORT_TYPES_FIELD_KEY] || [];
  return values.map((value) => getOptionLabel(field, value)).filter(Boolean);
}

/** Human-readable attribute text for browse / map keyword search. */
export function buildAttributeSearchText(
  spaceType: string | null | undefined,
  attributes: Record<string, string[]>
): string {
  const layout = getSpaceFeatureLayout(spaceType);
  const normalized = normalizeFeatureAttributes(attributes);
  const parts: string[] = [];

  for (const sec of layout.sections) {
    for (const field of sectionFields(sec)) {
      const canonical = toCanonicalFeatureKey(field.key);
      const values = normalized[canonical] || [];
      if (values.length === 0) continue;

      if (field.kind === "checkbox") {
        if (values.includes("yes")) parts.push(field.label);
      } else if (field.kind === "radio" || field.kind === "multiselect") {
        for (const value of values) {
          const label = getOptionLabel(field, value);
          if (label) parts.push(label);
        }
      }
    }
  }

  return parts.join(" ");
}

/** Options for listing create/edit & browse filters (includes legacy DB values). */
export const LISTING_SPACE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "storage", label: "Storage" },
  { value: "office", label: "Office" },
  { value: "meeting_room", label: "Meeting room" },
  { value: "boardroom", label: "Boardroom" },
  { value: "desk_coworking", label: "Desk / coworking" },
  { value: "parking", label: "Parking" },
  { value: "event_space", label: "Event space" },
  { value: "workshop_studio", label: "Workshop / studio" },
  { value: "sport_venue", label: "Sport venue" },
  { value: "other", label: "Other" },
  { value: "garage", label: "Garage" },
  { value: "workspace", label: "Workspace / coworking" },
];

export function formatSpaceTypeLabel(spaceType: string | null | undefined): string {
  if (!spaceType) return "Space";
  return SPACE_TYPE_LABELS[spaceType] || spaceType.charAt(0).toUpperCase() + spaceType.slice(1).replace(/_/g, " ");
}
