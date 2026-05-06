/**
 * Structured booking intelligence — shared types and helpers for:
 * - listing_questionnaires (host)
 * - listing_booking_requirements (host)
 * - booking_request_details (renter)
 *
 * TODO: AI assistant integration — combine questionnaire + requirements + request details
 * for host/renter copilots and automated matching signals.
 */

export type ListingIntelCategory = "storage" | "parking" | "office_event";

export type ListingBookingRequirements = {
  require_item_type: boolean;
  require_dimensions: boolean;
  require_photos: boolean;
  require_vehicle_details: boolean;
  require_access_frequency: boolean;
  require_estimated_value: boolean;
  require_notes: boolean;
};

export const DEFAULT_LISTING_BOOKING_REQUIREMENTS: ListingBookingRequirements = {
  require_item_type: false,
  require_dimensions: false,
  require_photos: false,
  require_vehicle_details: false,
  require_access_frequency: false,
  require_estimated_value: false,
  require_notes: false,
};

/** Renter payload shape stored in booking_request_details.data */
export type BookingRequestDetailPayload = {
  item_type?: string | null;
  /** Free-text when item_type is "other" or host needs more specificity */
  item_type_other?: string | null;
  dimensions_cm?: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
  };
  vehicle?: {
    type?: string | null;
    registration?: string | null;
  };
  photo_urls?: string[];
  access_frequency?: string | null;
  estimated_value_zar?: number | null;
  notes?: string | null;
};

export function parseBookingRequestDetailData(
  raw: Record<string, unknown> | null | undefined
): BookingRequestDetailPayload {
  if (!raw || typeof raw !== "object") return {};
  return raw as BookingRequestDetailPayload;
}

export function getItemTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  const found = RENTER_ITEM_TYPE_OPTIONS.find((o) => o.value === value);
  return found?.label || value;
}

export function getAccessFrequencyLabel(value: string | null | undefined): string {
  if (!value) return "";
  const found = ACCESS_FREQUENCY_OPTIONS.find((o) => o.value === value);
  return found?.label || value;
}

/** True when structured payload has any field worth showing in host/renter UI */
export function bookingRequestDetailsHasDisplayableContent(
  raw: Record<string, unknown> | null | undefined
): boolean {
  const d = parseBookingRequestDetailData(raw);
  if (d.item_type && String(d.item_type).trim()) return true;
  if (d.item_type_other && String(d.item_type_other).trim()) return true;
  const dim = d.dimensions_cm;
  if (dim) {
    const nums = [dim.length, dim.width, dim.height].filter(
      (n) => typeof n === "number" && Number.isFinite(n) && n > 0
    );
    if (nums.length > 0) return true;
  }
  const v = d.vehicle;
  if (v && ((v.type && v.type.trim()) || (v.registration && v.registration.trim()))) return true;
  if (Array.isArray(d.photo_urls) && d.photo_urls.length > 0) return true;
  if (d.access_frequency && String(d.access_frequency).trim()) return true;
  if (typeof d.estimated_value_zar === "number" && Number.isFinite(d.estimated_value_zar) && d.estimated_value_zar > 0)
    return true;
  if (d.notes && String(d.notes).trim()) return true;
  return false;
}

export function formatZarFromRand(amount: number): string {
  return `R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export const RENTER_ITEM_TYPE_OPTIONS = [
  { value: "household", label: "Household items" },
  { value: "furniture", label: "Furniture" },
  { value: "vehicle", label: "Vehicle" },
  { value: "trailer", label: "Trailer" },
  { value: "boat", label: "Boat" },
  { value: "business_inventory", label: "Business inventory" },
  { value: "equipment", label: "Equipment" },
  { value: "event_equipment", label: "Event equipment" },
  { value: "other", label: "Other" },
] as const;

export const ACCESS_FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "occasionally", label: "Occasionally" },
  { value: "rarely", label: "Rarely" },
] as const;

export function mapSpaceTypeToIntelCategory(
  spaceType: string | null | undefined
): ListingIntelCategory {
  const t = (spaceType || "").toLowerCase();
  if (t === "parking") return "parking";
  if (
    [
      "office",
      "meeting_room",
      "boardroom",
      "desk_coworking",
      "event_space",
      "workshop_studio",
      "workspace",
      "other",
    ].includes(t)
  ) {
    return "office_event";
  }
  return "storage";
}

function isMeaningfulValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>).some(isMeaningfulValue);
  }
  return false;
}

/** Completion score for host “Listing quality” indicator (0–100). */
export function computeListingQualityPercent(
  category: ListingIntelCategory,
  data: Record<string, unknown>
): { percent: number; answered: number; total: number } {
  let total = 0;
  let answered = 0;

  const countGroup = (obj: unknown, keys: string[]) => {
    for (const k of keys) {
      total += 1;
      if (typeof obj === "object" && obj !== null && k in (obj as object)) {
        if (isMeaningfulValue((obj as Record<string, unknown>)[k])) answered += 1;
      }
    }
  };

  if (category === "storage") {
    const access = data.access as Record<string, unknown> | undefined;
    const security = data.security as Record<string, unknown> | undefined;
    const environment = data.environment as Record<string, unknown> | undefined;
    const restrictions = data.restrictions as Record<string, unknown> | undefined;
    const dimensions = data.dimensions_cm as Record<string, unknown> | undefined;

    countGroup(access, [
      "full_247",
      "appointment_required",
      "vehicle_access",
      "loading_access",
    ]);
    countGroup(security, ["cctv", "guarded", "alarm", "lockable"]);
    countGroup(environment, [
      "indoor_outdoor",
      "covered",
      "ventilated",
      "dry_storage",
      "climate_controlled",
    ]);
    countGroup(dimensions, ["width_cm", "length_cm", "height_cm"]);
    countGroup(restrictions, [
      "no_chemicals",
      "no_perishables",
      "no_flammables",
      "no_vehicles",
    ]);
  } else if (category === "parking") {
    const vehicleTypes = data.vehicle_types as Record<string, unknown> | undefined;
    const limits = data.limits_m as Record<string, unknown> | undefined;
    const access = data.access as Record<string, unknown> | undefined;

    countGroup(vehicleTypes, [
      "car",
      "suv",
      "boat",
      "trailer",
      "caravan",
      "motorcycle",
    ]);
    countGroup(limits, ["height_limit_m", "length_limit_m"]);
    countGroup(access, ["covered", "remote_gate", "full_247"]);
  } else {
    const layout = data.layout_styles as Record<string, unknown> | undefined;
    const amenities = data.amenities as Record<string, unknown> | undefined;
    countGroup(data, ["capacity_people", "noise_level", "parking_available", "alcohol_allowed"]);
    countGroup(layout, ["theatre", "classroom", "boardroom", "banquet", "open_plan"]);
    countGroup(amenities, [
      "wifi",
      "av_equipment",
      "kitchen",
      "restrooms",
      "wheelchair_access",
    ]);
    countGroup(data, ["setup_teardown_notes"]);
  }

  if (total === 0) return { percent: 0, answered: 0, total: 0 };
  const percent = Math.round((answered / total) * 100);
  return { percent, answered, total };
}

export function emptyQuestionnaireDataForCategory(
  category: ListingIntelCategory
): Record<string, unknown> {
  if (category === "storage") {
    return {
      access: {},
      security: {},
      environment: {},
      dimensions_cm: {},
      restrictions: {},
    };
  }
  if (category === "parking") {
    return {
      vehicle_types: {},
      limits_m: {},
      access: {},
    };
  }
  return {
    capacity_people: null,
    noise_level: "",
    parking_available: null,
    alcohol_allowed: null,
    layout_styles: {},
    amenities: {},
    setup_teardown_notes: "",
  };
}

export function mergeQuestionnaireData(
  category: ListingIntelCategory,
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const base = emptyQuestionnaireDataForCategory(category);
  if (!raw || typeof raw !== "object") return base;

  if (category === "storage") {
    return {
      access: { ...(base.access as object), ...(raw.access as object) },
      security: { ...(base.security as object), ...(raw.security as object) },
      environment: { ...(base.environment as object), ...(raw.environment as object) },
      dimensions_cm: { ...(base.dimensions_cm as object), ...(raw.dimensions_cm as object) },
      restrictions: { ...(base.restrictions as object), ...(raw.restrictions as object) },
    };
  }
  if (category === "parking") {
    return {
      vehicle_types: { ...(base.vehicle_types as object), ...(raw.vehicle_types as object) },
      limits_m: { ...(base.limits_m as object), ...(raw.limits_m as object) },
      access: { ...(base.access as object), ...(raw.access as object) },
    };
  }
  return {
    ...base,
    ...raw,
    layout_styles: {
      ...((base.layout_styles as object) || {}),
      ...((raw.layout_styles as object) || {}),
    },
    amenities: {
      ...((base.amenities as object) || {}),
      ...((raw.amenities as object) || {}),
    },
  };
}
