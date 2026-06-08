/**
 * Structured booking intelligence — shared types and helpers for:
 * - listing_questionnaires (host)
 * - listing_booking_requirements (host)
 * - booking_request_details (renter)
 *
 * TODO: AI assistant integration — combine questionnaire + requirements + request details
 * for host/renter copilots and automated matching signals.
 */

import {
  getSpaceFeatureLayout,
  sectionFields,
  normalizeFeatureAttributes,
} from "@/app/data/spaceFeatureConfig";

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

/** Which renter requirement toggles to show per listing category (listing form). */
export type RenterRequirementFieldKey = keyof ListingBookingRequirements;

export function renterRequirementKeysForCategory(
  category: ListingIntelCategory
): RenterRequirementFieldKey[] {
  if (category === "parking") {
    return [
      "require_item_type",
      "require_dimensions",
      "require_photos",
      "require_vehicle_details",
      "require_estimated_value",
      "require_access_frequency",
      "require_notes",
    ];
  }
  if (category === "storage") {
    return [
      "require_item_type",
      "require_dimensions",
      "require_photos",
      "require_estimated_value",
      "require_access_frequency",
      "require_notes",
    ];
  }
  return [
    "require_item_type",
    "require_dimensions",
    "require_photos",
    "require_estimated_value",
    "require_access_frequency",
    "require_notes",
  ];
}

export const RENTER_REQUIREMENT_LABELS: Record<RenterRequirementFieldKey, string> = {
  require_item_type: "What they want to store, park, or use",
  require_dimensions: "Dimensions",
  require_photos: "Photos",
  require_vehicle_details: "Vehicle details",
  require_estimated_value: "Estimated value",
  require_access_frequency: "Access frequency",
  require_notes: "Additional notes",
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
  if (t === "parking" || t === "garage") return "parking";
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

/** Options for listing quality — combines questionnaire, amenities, renter requirements row. */
export type ListingQualityOptions = {
  /** `true` when `listing_booking_requirements` exists for the space (loaded or saved). */
  renterRequirementsCommitted: boolean;
  /** `spaces.space_type` — used with `featureAttributes` for the amenities signal. */
  spaceType?: string | null;
  /** Grouped `space_attributes` (same shape as listing form state). */
  featureAttributes?: Record<string, string[]> | null;
};

/** True when the host selected at least one Features & amenities field (any space type). */
export function amenitiesQualitySignal(
  spaceType: string | null | undefined,
  attributes: Record<string, string[]> | null | undefined
): boolean {
  const norm = normalizeFeatureAttributes(attributes || {});
  const layout = getSpaceFeatureLayout(spaceType);
  for (const sec of layout.sections) {
    for (const f of sectionFields(sec)) {
      if (f.kind === "checkbox") {
        if ((norm[f.key] || []).includes("yes")) return true;
      } else if ((norm[f.key] || []).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function checkboxSubgroupAnswered(obj: unknown): boolean {
  return typeof obj === "object" && obj !== null && Object.keys(obj as object).length > 0;
}

function storageDimensionsSectionAnswered(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  for (const k of ["width_cm", "length_cm", "height_cm"]) {
    const n = Number(o[k]);
    if (Number.isFinite(n) && n > 0) return true;
  }
  return false;
}

function featureStorageSizeBandAnswered(attrs: Record<string, string[]> | null | undefined): boolean {
  const norm = normalizeFeatureAttributes(attrs || {});
  return (norm.sf_storage_size_band || []).length > 0;
}

function parkingLimitsOrBaysAnswered(data: Record<string, unknown>): boolean {
  if (typeof data.parking_bays === "number" && Number.isFinite(data.parking_bays)) return true;
  return checkboxSubgroupAnswered(data.limits_m);
}

function parkingOperationalAnswered(data: Record<string, unknown>): boolean {
  const s = data.operational_notes;
  return typeof s === "string" && s.trim().length > 0;
}

function storageOperationalAnswered(data: Record<string, unknown>): boolean {
  const s = data.operational_notes;
  return typeof s === "string" && s.trim().length > 0;
}

function storageSizeSectionAnswered(
  data: Record<string, unknown>,
  attrs: Record<string, string[]> | null | undefined
): boolean {
  return storageDimensionsSectionAnswered(data.dimensions_cm) || featureStorageSizeBandAnswered(attrs);
}

function officeCapacityAccessSectionAnswered(data: Record<string, unknown>): boolean {
  const cap = data.capacity_people;
  if (typeof cap === "number" && Number.isFinite(cap) && cap > 0) return true;
  const ca = data.capacity_access as Record<string, unknown> | undefined;
  if (!ca || typeof ca !== "object") return false;
  const bays = ca.parking_bays;
  if (typeof bays === "number" && Number.isFinite(bays)) return true;
  const ah = ca.after_hours_access;
  if (ah === true || ah === false) return true;
  return false;
}

function officeOperationsSectionAnswered(data: Record<string, unknown>): boolean {
  const op = data.operations_notes;
  if (op && typeof op === "object") {
    for (const v of Object.values(op as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim().length > 0) return true;
    }
  }
  const legacy = data.setup_teardown_notes;
  if (typeof legacy === "string" && legacy.trim().length > 0) return true;
  return false;
}

/**
 * Completion score for host “Listing quality” (0–100).
 * Sections only (not per checkbox). Combines Features & amenities + booking questionnaire + renter row.
 */
export function computeListingQualityPercent(
  category: ListingIntelCategory,
  data: Record<string, unknown>,
  options: ListingQualityOptions
): { percent: number; answered: number; total: number } {
  let total = 0;
  let answered = 0;
  const attrs = options.featureAttributes ?? null;

  const bump = (complete: boolean) => {
    total += 1;
    if (complete) answered += 1;
  };

  bump(amenitiesQualitySignal(options.spaceType ?? null, attrs));

  if (category === "storage") {
    bump(checkboxSubgroupAnswered(data.storage_suitability));
    bump(
      checkboxSubgroupAnswered(data.access) ||
        checkboxSubgroupAnswered(data.restrictions)
    );
    bump(storageSizeSectionAnswered(data, attrs));
    bump(storageOperationalAnswered(data));
  } else if (category === "parking") {
    bump(parkingLimitsOrBaysAnswered(data));
    bump(parkingOperationalAnswered(data));
  } else {
    bump(officeCapacityAccessSectionAnswered(data));
    bump(checkboxSubgroupAnswered(data.use_suitability));
    bump(officeOperationsSectionAnswered(data));
  }

  bump(options.renterRequirementsCommitted);

  if (total === 0) return { percent: 0, answered: 0, total: 0 };
  const percent = Math.round((answered / total) * 100);
  return { percent, answered, total };
}

/**
 * Section-level labels for incomplete quality areas (same rules as the score).
 */
export function getMissingListingQualitySignalLabels(
  category: ListingIntelCategory,
  data: Record<string, unknown>,
  options: ListingQualityOptions
): string[] {
  const missing: string[] = [];
  const attrs = options.featureAttributes ?? null;

  if (!amenitiesQualitySignal(options.spaceType ?? null, attrs)) {
    missing.push("Features & amenities");
  }

  if (category === "storage") {
    if (!checkboxSubgroupAnswered(data.storage_suitability)) {
      missing.push("Storage suitability");
    }
    if (!checkboxSubgroupAnswered(data.access) && !checkboxSubgroupAnswered(data.restrictions)) {
      missing.push("Access & restrictions");
    }
    if (!storageSizeSectionAnswered(data, attrs)) {
      missing.push("Size details (dimensions or amenity size band)");
    }
    if (!storageOperationalAnswered(data)) {
      missing.push("Operational notes");
    }
  } else if (category === "parking") {
    if (!parkingLimitsOrBaysAnswered(data)) {
      missing.push("Bay count & size limits");
    }
    if (!parkingOperationalAnswered(data)) {
      missing.push("Operational notes");
    }
  } else {
    if (!officeCapacityAccessSectionAnswered(data)) {
      missing.push("Capacity & access");
    }
    if (!checkboxSubgroupAnswered(data.use_suitability)) {
      missing.push("Use & suitability");
    }
    if (!officeOperationsSectionAnswered(data)) {
      missing.push("Setup & operational notes");
    }
  }

  if (!options.renterRequirementsCommitted) {
    missing.push("Renter booking requirements");
  }

  return missing;
}

export function emptyQuestionnaireDataForCategory(
  category: ListingIntelCategory
): Record<string, unknown> {
  if (category === "storage") {
    return {
      access: {},
      storage_suitability: {},
      dimensions_cm: {},
      restrictions: {},
      operational_notes: "",
    };
  }
  if (category === "parking") {
    return {
      limits_m: {},
      parking_bays: null as number | null,
      operational_notes: "",
    };
  }
  return {
    capacity_people: null as number | null,
    capacity_access: {
      parking_bays: null as number | null,
      after_hours_access: null as boolean | null,
    },
    use_suitability: {},
    operations_notes: {
      load_in: "",
      setup: "",
      cleanup: "",
      house_rules: "",
    },
  };
}

export function mergeQuestionnaireData(
  category: ListingIntelCategory,
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const base = emptyQuestionnaireDataForCategory(category);
  if (!raw || typeof raw !== "object") return base;

  if (category === "storage") {
    const op =
      typeof raw.operational_notes === "string"
        ? raw.operational_notes
        : (base.operational_notes as string);
    const merged = {
      access: { ...(base.access as object), ...(raw.access as object) },
      storage_suitability: {
        ...(base.storage_suitability as object),
        ...((raw.storage_suitability as object) || {}),
      },
      dimensions_cm: { ...(base.dimensions_cm as object), ...(raw.dimensions_cm as object) },
      restrictions: { ...(base.restrictions as object), ...(raw.restrictions as object) },
      operational_notes: op,
    };
    const legacy: Record<string, unknown> = {};
    if (raw.security !== undefined) legacy.security = raw.security;
    if (raw.environment !== undefined) legacy.environment = raw.environment;
    return { ...legacy, ...merged };
  }
  if (category === "parking") {
    const rawBays = raw.parking_bays;
    const parking_bays =
      "parking_bays" in raw
        ? typeof rawBays === "number" && Number.isFinite(rawBays)
          ? rawBays
          : rawBays === null
            ? null
            : (base.parking_bays as number | null)
        : (base.parking_bays as number | null);
    const merged = {
      limits_m: { ...(base.limits_m as object), ...(raw.limits_m as object) },
      parking_bays,
      operational_notes:
        typeof raw.operational_notes === "string"
          ? raw.operational_notes
          : (base.operational_notes as string),
    };
    const legacy: Record<string, unknown> = {};
    if (raw.vehicle_types !== undefined) legacy.vehicle_types = raw.vehicle_types;
    if (raw.access !== undefined) legacy.access = raw.access;
    return { ...legacy, ...merged };
  }

  const baseOps = base.operations_notes as Record<string, string>;
  const rawOps = (raw.operations_notes as Record<string, string>) || {};
  const legacySetup =
    typeof raw.setup_teardown_notes === "string" ? raw.setup_teardown_notes.trim() : "";

  const mergedOffice = {
    capacity_people:
      typeof raw.capacity_people === "number"
        ? raw.capacity_people
        : raw.capacity_people === null
          ? null
          : (base.capacity_people as number | null),
    capacity_access: {
      ...(base.capacity_access as object),
      ...((raw.capacity_access as object) || {}),
    },
    use_suitability: {
      ...(base.use_suitability as object),
      ...((raw.use_suitability as object) || {}),
    },
    operations_notes: {
      load_in: rawOps.load_in ?? baseOps.load_in ?? "",
      setup: rawOps.setup ?? baseOps.setup ?? legacySetup,
      cleanup: rawOps.cleanup ?? baseOps.cleanup ?? "",
      house_rules: rawOps.house_rules ?? baseOps.house_rules ?? "",
    },
  };

  const legacyOffice: Record<string, unknown> = {};
  if (raw.layout_styles !== undefined) legacyOffice.layout_styles = raw.layout_styles;
  if (raw.amenities !== undefined) legacyOffice.amenities = raw.amenities;
  if (raw.noise_level !== undefined) legacyOffice.noise_level = raw.noise_level;
  if (raw.parking_available !== undefined) legacyOffice.parking_available = raw.parking_available;
  if (raw.alcohol_allowed !== undefined) legacyOffice.alcohol_allowed = raw.alcohol_allowed;
  if (raw.setup_teardown_notes !== undefined) legacyOffice.setup_teardown_notes = raw.setup_teardown_notes;

  return { ...legacyOffice, ...mergedOffice };
}

type SupabaseLike = {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict?: string }
    ) => Promise<{ error: { message?: string } | null }>;
  };
};

/**
 * Upsert `listing_questionnaires` and `listing_booking_requirements` for a space.
 * Call after the `spaces` row exists and the caller owns the listing.
 */
export async function upsertListingBookingIntelTables(
  supabase: SupabaseLike,
  params: {
    spaceId: string;
    spaceType: string | null | undefined;
    questionnaireData: Record<string, unknown>;
    requirements: ListingBookingRequirements;
  }
): Promise<{ questionnaireError: string | null; requirementsError: string | null }> {
  const intelCategory = mapSpaceTypeToIntelCategory(params.spaceType);
  const { error: qErr } = await (supabase.from("listing_questionnaires" as never) as any).upsert(
    {
      space_id: params.spaceId,
      category: intelCategory,
      data: params.questionnaireData,
    },
    { onConflict: "space_id" }
  );
  if (qErr) {
    return {
      questionnaireError: qErr.message || "Could not save booking questionnaire.",
      requirementsError: null,
    };
  }
  const { error: rErr } = await (supabase.from("listing_booking_requirements" as never) as any).upsert(
    {
      space_id: params.spaceId,
      ...params.requirements,
    },
    { onConflict: "space_id" }
  );
  return {
    questionnaireError: null,
    requirementsError: rErr ? rErr.message || "Could not save renter requirements." : null,
  };
}
