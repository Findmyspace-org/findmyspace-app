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

export type SpaceFeatureSection = {
  id: string;
  title: string;
  fields: SpaceFeatureField[];
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

/** Shared building & access options (appended per space type). */
const COMMON_ACCESS: SpaceFeatureCheckbox[] = [
  cb("sf_access_24_7", "24/7 access", "Clock"),
  cb("sf_weekend_access", "Weekend access", "CalendarDays"),
  cb("sf_secure_entry", "Secure entry", "ShieldCheck"),
  cb("sf_cctv", "CCTV", "Cctv"),
  cb("sf_gated_access", "Gated access", "Fence"),
  cb("sf_electricity_included", "Electricity included", "Zap"),
  cb("sf_backup_power", "Backup power", "BatteryCharging"),
  cb("sf_wheelchair", "Wheelchair accessible", "Accessibility"),
  cb("sf_ground_floor", "Ground floor", "Layers"),
  cb("sf_elevator", "Elevator access", "ArrowUpFromLine"),
];

const OFFICE_WORKSPACE_CHECKS: SpaceFeatureCheckbox[] = [
  cb("sf_wifi_high_speed", "High-speed WiFi", "Wifi"),
  cb("sf_aircon", "Air conditioning", "Wind"),
  cb("sf_natural_light", "Natural light", "Sun"),
  cb("sf_ergonomic_furniture", "Ergonomic furniture", "Armchair"),
  cb("sf_desk_included", "Desk included", "Laptop"),
  cb("sf_standing_desk", "Standing desk", "ArrowUpDown"),
  cb("sf_storage_cabinet", "Storage cabinet", "Archive"),
  cb("sf_kitchen_access", "Kitchen access", "UtensilsCrossed"),
  cb("sf_coffee_tea", "Coffee / tea", "Coffee"),
  cb("sf_printing", "Printing", "Printer"),
  cb("sf_scanning", "Scanning", "ScanLine"),
  cb("sf_private_toilet", "Private toilet", "Bath"),
  cb("sf_shared_bathroom", "Shared bathroom", "Droplets"),
  cb("sf_meeting_room_access", "Meeting room access", "Users"),
  cb("sf_quiet_workspace", "Quiet workspace", "VolumeX"),
  cb("sf_phone_booth", "Phone booth", "Phone"),
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
  cb("sf_mr_wifi", "WiFi", "Wifi"),
  cb("sf_tv_screen", "TV / screen", "Tv"),
  cb("sf_projector", "Projector", "Projector"),
  cb("sf_whiteboard", "Whiteboard", "Presentation"),
  cb("sf_flip_chart", "Flip chart", "FileText"),
  cb("sf_video_conferencing", "Video conferencing setup", "Video"),
  cb("sf_hdmi_usbc", "HDMI / USB-C connection", "Cable"),
  cb("sf_mr_aircon", "Air conditioning", "Wind"),
  cb("sf_soundproofing", "Soundproofing", "Mic"),
  cb("sf_mr_natural_light", "Natural light", "Sun"),
  cb("sf_mr_coffee_tea", "Coffee / tea", "Coffee"),
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
  cb("sf_pk_gated", "Gated", "Fence"),
  cb("sf_pk_guarded", "Guarded", "Shield"),
  cb("sf_pk_cctv", "CCTV", "Cctv"),
  cb("sf_pk_remote_access", "Remote access", "RadioReceiver"),
  cb("sf_pk_24_7", "24/7 access", "Clock"),
  cb("sf_pk_daytime_only", "Daytime only", "Sun"),
  cb("sf_pk_night_access", "Night access", "Moon"),
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
  cb("sf_st_dry", "Dry", "Sun"),
  cb("sf_st_climate", "Climate controlled", "Thermometer"),
  cb("sf_st_ventilated", "Ventilated", "Fan"),
  cb("sf_st_lockable", "Lockable", "Lock"),
  cb("sf_st_cctv", "CCTV", "Cctv"),
  cb("sf_st_gated", "Gated access", "Fence"),
  cb("sf_st_24_7", "24/7 access", "Clock"),
  cb("sf_st_limited_hours", "Limited hours", "Clock3"),
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
  cb("sf_ev_kitchen", "Kitchen", "ChefHat"),
  cb("sf_ev_bar", "Bar area", "Wine"),
  cb("sf_ev_toilets", "Toilets", "Bath"),
  cb("sf_ev_stage", "Stage / DJ area", "Music2"),
  cb("sf_ev_sound", "Sound system", "Speaker"),
  cb("sf_ev_lighting", "Lighting", "Lightbulb"),
  cb("sf_ev_projector", "Projector / screen", "Projector"),
  cb("sf_ev_alcohol", "Alcohol allowed", "Beer"),
  cb("sf_ev_music", "Music allowed", "Music"),
  cb("sf_ev_late_night", "Late night allowed", "Moon"),
  cb("sf_ev_cleaning", "Cleaning service", "Sparkles"),
  cb("sf_ev_security", "Security", "Shield"),
  cb("sf_ev_parking", "Parking available", "ParkingCircle"),
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

function section(id: string, title: string, fields: SpaceFeatureField[]): SpaceFeatureSection {
  return { id, title, fields };
}

export const spaceFeatureLayouts: Record<string, SpaceFeatureLayout> = {
  office: {
    sections: [
      section("workspace", "Workspace & amenities", OFFICE_WORKSPACE_CHECKS),
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },

  meeting_room: {
    sections: [
      section("capacity", "Layout", [MEETING_CAPACITY_RADIO]),
      section("equipment", "Equipment & services", MEETING_ROOM_CHECKS),
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },

  boardroom: {
    sections: [
      section("capacity", "Layout", [MEETING_CAPACITY_RADIO]),
      section("equipment", "Equipment & services", MEETING_ROOM_CHECKS),
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },

  desk_coworking: {
    sections: [
      section("workspace", "Workspace & amenities", OFFICE_WORKSPACE_CHECKS),
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },

  parking: {
    sections: [
      section("type", "Parking", [PARKING_TYPE_RADIO]),
      section("features", "Features", PARKING_CHECKS),
      section("vehicles", "Vehicle suitability", [VEHICLE_MULTI]),
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },

  storage: {
    sections: [
      section("type", "Storage", [STORAGE_TYPE_RADIO, STORAGE_SIZE_RADIO]),
      section("features", "Features", STORAGE_CHECKS),
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },

  event_space: {
    sections: [
      section("venue", "Venue", [EVENT_VENUE_RADIO, EVENT_CAPACITY_RADIO]),
      section("features", "Features & services", EVENT_CHECKS),
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },

  workshop_studio: {
    sections: [
      section("studio", "Studio & utilities", WORKSHOP_CHECKS),
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },

  other: {
    sections: [
      section("access", "Access & building", COMMON_ACCESS),
    ],
  },
};

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

function registerFields(layout: SpaceFeatureLayout) {
  for (const sec of layout.sections) {
    for (const f of sec.fields) {
      fieldRegistry.set(f.key, f);
    }
  }
}

for (const layout of Object.values(spaceFeatureLayouts)) {
  registerFields(layout);
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
  { value: "other", label: "Other" },
  { value: "garage", label: "Garage (legacy)" },
  { value: "workspace", label: "Workspace (legacy)" },
];

export function formatSpaceTypeLabel(spaceType: string | null | undefined): string {
  if (!spaceType) return "Space";
  return SPACE_TYPE_LABELS[spaceType] || spaceType.charAt(0).toUpperCase() + spaceType.slice(1).replace(/_/g, " ");
}
