export type SpaceFieldOption = {
  label: string;
  value: string;
};

export type SpaceFieldIcon =
  | "shield"
  | "wifi"
  | "clock"
  | "users"
  | "monitor"
  | "key"
  | "climate"
  | "ruler"
  | "car"
  | "power"
  | "water"
  | "briefcase"
  | "volume"
  | "note";

export type SpaceField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "multiselect" | "boolean";
  icon?: SpaceFieldIcon;
  options?: SpaceFieldOption[];
  placeholder?: string;
};

export const spaceFieldConfig: Record<string, SpaceField[]> = {
  parking: [
    {
      key: "access_options",
      label: "Access options",
      type: "multiselect",
      icon: "key",
      options: [
        { label: "Own key", value: "own_key" },
        { label: "Own remote", value: "own_remote" },
        { label: "Keypad code", value: "keypad_code" },
        { label: "Remote access", value: "remote_access" },
        { label: "Owner present", value: "owner_present" },
        { label: "By arrangement", value: "by_arrangement" },
      ],
    },
    {
      key: "security_features",
      label: "Security features",
      type: "multiselect",
      icon: "shield",
      options: [
        { label: "Alarm", value: "alarm" },
        { label: "CCTV", value: "cctv" },
        { label: "Gated access", value: "gated_access" },
        { label: "Security guard", value: "security_guard" },
        { label: "Fenced property", value: "fenced_property" },
      ],
    },
    {
      key: "vehicle_size",
      label: "Vehicle size",
      type: "select",
      icon: "car",
      options: [
        { label: "Small car", value: "small" },
        { label: "Sedan", value: "sedan" },
        { label: "SUV", value: "suv" },
        { label: "Large vehicle", value: "large" },
      ],
    },
    {
      key: "access_hours",
      label: "Access hours",
      type: "text",
      icon: "clock",
      placeholder: "e.g. 24/7 or Mon-Fri 08:00-18:00",
    },
  ],

  storage: [
    {
      key: "access_options",
      label: "Access options",
      type: "multiselect",
      icon: "key",
      options: [
        { label: "Own key", value: "own_key" },
        { label: "Keypad code", value: "keypad_code" },
        { label: "Remote access", value: "remote_access" },
        { label: "Owner present", value: "owner_present" },
        { label: "Scheduled access", value: "scheduled_access" },
        { label: "Managed access", value: "managed_access" },
      ],
    },
    {
      key: "security_features",
      label: "Security features",
      type: "multiselect",
      icon: "shield",
      options: [
        { label: "Alarm", value: "alarm" },
        { label: "CCTV", value: "cctv" },
        { label: "Gated access", value: "gated_access" },
        { label: "Security guard", value: "security_guard" },
        { label: "Lockable unit", value: "lockable_unit" },
        { label: "Fenced property", value: "fenced_property" },
        { label: "Motion sensors", value: "motion_sensors" },
      ],
    },
    {
      key: "indoor_outdoor",
      label: "Indoor / outdoor",
      type: "select",
      icon: "briefcase",
      options: [
        { label: "Indoor", value: "indoor" },
        { label: "Outdoor", value: "outdoor" },
        { label: "Covered", value: "covered" },
      ],
    },
    {
      key: "climate_controlled",
      label: "Climate controlled",
      type: "boolean",
      icon: "climate",
    },
    {
      key: "length_m",
      label: "Length (m)",
      type: "number",
      icon: "ruler",
    },
    {
      key: "width_m",
      label: "Width (m)",
      type: "number",
      icon: "ruler",
    },
    {
      key: "height_m",
      label: "Height (m)",
      type: "number",
      icon: "ruler",
    },
  ],

  garage: [
    {
      key: "access_options",
      label: "Access options",
      type: "multiselect",
      icon: "key",
      options: [
        { label: "Own key", value: "own_key" },
        { label: "Own remote", value: "own_remote" },
        { label: "Keypad code", value: "keypad_code" },
        { label: "Owner present", value: "owner_present" },
        { label: "By arrangement", value: "by_arrangement" },
      ],
    },
    {
      key: "security_features",
      label: "Security features",
      type: "multiselect",
      icon: "shield",
      options: [
        { label: "Alarm", value: "alarm" },
        { label: "CCTV", value: "cctv" },
        { label: "Gated access", value: "gated_access" },
        { label: "Lockable garage", value: "lockable_garage" },
        { label: "Security guard", value: "security_guard" },
        { label: "Fenced property", value: "fenced_property" },
      ],
    },
    {
      key: "power_available",
      label: "Power available",
      type: "boolean",
      icon: "power",
    },
    {
      key: "water_available",
      label: "Water available",
      type: "boolean",
      icon: "water",
    },
    {
      key: "workspace_ready",
      label: "Suitable as workspace",
      type: "boolean",
      icon: "briefcase",
    },
  ],

  office: [
    {
      key: "security_features",
      label: "Security features",
      type: "multiselect",
      icon: "shield",
      options: [
        { label: "Alarm", value: "alarm" },
        { label: "CCTV", value: "cctv" },
        { label: "Gated access", value: "gated_access" },
        { label: "Reception", value: "reception" },
        { label: "Security guard", value: "security_guard" },
      ],
    },
    {
      key: "desks",
      label: "Number of desks",
      type: "number",
      icon: "users",
    },
    {
      key: "wifi",
      label: "WiFi available",
      type: "boolean",
      icon: "wifi",
    },
    {
      key: "meeting_room",
      label: "Meeting room available",
      type: "boolean",
      icon: "monitor",
    },
    {
      key: "business_hours",
      label: "Business hours",
      type: "text",
      icon: "clock",
      placeholder: "e.g. Mon-Fri 08:00-17:00",
    },
  ],

  workspace: [
    {
      key: "access_options",
      label: "Access options",
      type: "multiselect",
      icon: "key",
      options: [
        { label: "Own key", value: "own_key" },
        { label: "Keypad code", value: "keypad_code" },
        { label: "Owner present", value: "owner_present" },
        { label: "By arrangement", value: "by_arrangement" },
      ],
    },
    {
      key: "security_features",
      label: "Security features",
      type: "multiselect",
      icon: "shield",
      options: [
        { label: "Alarm", value: "alarm" },
        { label: "CCTV", value: "cctv" },
        { label: "Gated access", value: "gated_access" },
      ],
    },
    {
      key: "desks",
      label: "Number of desks",
      type: "number",
      icon: "users",
    },
    {
      key: "wifi",
      label: "WiFi available",
      type: "boolean",
      icon: "wifi",
    },
    {
      key: "quiet_space",
      label: "Quiet space",
      type: "boolean",
      icon: "volume",
    },
  ],

  other: [
    {
      key: "custom_notes",
      label: "Extra details",
      type: "text",
      icon: "note",
      placeholder: "Add any special details about this space",
    },
  ],
};