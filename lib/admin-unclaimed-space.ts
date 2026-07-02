import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import { UNCLAIMED_LISTING_STATUS } from "@/lib/listing-lifecycle";
import { parseSpaceCrmLinkInput } from "@/lib/space-crm-link";
import { validateMinimumPublicContent } from "@/lib/admin-public-listing-mode";
import {
  parseSpacePricingInput,
  syncLegacyPriceFields,
  isSpacePriceUnit,
  type SpacePriceUnit,
} from "@/lib/space-pricing";
import {
  isGroupSizeApplicable,
  parseGroupSizeInput,
  validateGroupSizePair,
} from "@/lib/group-size";
import { parseMinBookingInput } from "@/lib/space-min-booking";
import {
  assertSpacePricingPeriodDbFields,
  normalizeSpacePricingPeriodDbFields,
} from "@/lib/space-pricing-period-sync";

export const ADMIN_UNCLAIMED_STATUSES = ["draft", "unclaimed"] as const;
export type AdminUnclaimedStatus = (typeof ADMIN_UNCLAIMED_STATUSES)[number];

export const ADMIN_CREATED_VIEW_STATUSES = [
  "draft",
  "unclaimed",
  "owner_claimed",
] as const;

const SPACE_TYPE_VALUES = new Set(LISTING_SPACE_TYPE_OPTIONS.map((o) => o.value));
const BOOKING_UNITS = new Set(["hour", "day", "month"]);

const MAX_TITLE = 200;
const MAX_DESC = 50_000;
const MAX_ADDR = 300;

export type UnclaimedSpaceInput = {
  title?: string | null;
  description?: string | null;
  space_type?: string | null;
  booking_unit?: string | null;
  city?: string | null;
  suburb?: string | null;
  street_address?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  address_line_1?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  attributes?: Record<string, string[]>;
  min_group_size?: number | null;
  max_group_size?: number | null;
  crm_organisation_id?: string | null;
  crm_contact_id?: string | null;
  price_amount?: number | null;
  price_unit?: string | null;
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
  min_booking_hours?: number | null;
  min_booking_days?: number | null;
  min_booking_months?: number | null;
};

export function createServiceAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseGroupSizeField(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    if (value.trim() === "") return null;
    return parseGroupSizeInput(value);
  }
  return undefined;
}

function parseCoord(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function parseUnclaimedSpaceInput(
  body: Record<string, unknown>
): { ok: true; data: UnclaimedSpaceInput } | { ok: false; error: string } {
  const data: UnclaimedSpaceInput = {};

  if ("title" in body) {
    const v = trimOrNull(body.title);
    if (v && v.length > MAX_TITLE) return { ok: false, error: "Title is too long." };
    data.title = v;
  }
  if ("description" in body) {
    const v = trimOrNull(body.description);
    if (v && v.length > MAX_DESC) return { ok: false, error: "Description is too long." };
    data.description = v;
  }
  if ("space_type" in body) {
    const v = trimOrNull(body.space_type);
    if (v && !SPACE_TYPE_VALUES.has(v)) return { ok: false, error: "Invalid space type." };
    data.space_type = v;
  }
  if ("booking_unit" in body) {
    const v = trimOrNull(body.booking_unit);
    if (v && !BOOKING_UNITS.has(v)) return { ok: false, error: "Invalid booking unit." };
    data.booking_unit = v;
  }

  for (const key of [
    "city",
    "suburb",
    "street_address",
    "province",
    "postal_code",
    "country",
    "address_line_1",
  ] as const) {
    if (key in body) {
      const v = trimOrNull(body[key]);
      if (v && v.length > MAX_ADDR) {
        return { ok: false, error: `${key} is too long.` };
      }
      data[key] = v;
    }
  }

  if ("latitude" in body) {
    const v = parseCoord(body.latitude);
    if (v === undefined) return { ok: false, error: "Invalid latitude." };
    data.latitude = v;
  }
  if ("longitude" in body) {
    const v = parseCoord(body.longitude);
    if (v === undefined) return { ok: false, error: "Invalid longitude." };
    data.longitude = v;
  }

  if ("min_group_size" in body) {
    const v = parseGroupSizeField(body.min_group_size);
    if (v === undefined && body.min_group_size !== null && body.min_group_size !== "") {
      return { ok: false, error: "Invalid minimum group size." };
    }
    data.min_group_size = v ?? null;
  }
  if ("max_group_size" in body) {
    const v = parseGroupSizeField(body.max_group_size);
    if (v === undefined && body.max_group_size !== null && body.max_group_size !== "") {
      return { ok: false, error: "Invalid maximum group size." };
    }
    data.max_group_size = v ?? null;
  }

  const spaceTypeForValidation = data.space_type ?? trimOrNull(body.space_type);
  if (
    (data.min_group_size !== undefined || data.max_group_size !== undefined) &&
    spaceTypeForValidation &&
    !isGroupSizeApplicable(spaceTypeForValidation)
  ) {
    data.min_group_size = null;
    data.max_group_size = null;
  } else if (data.min_group_size !== undefined || data.max_group_size !== undefined) {
    const min = data.min_group_size ?? null;
    const max = data.max_group_size ?? null;
    const err = validateGroupSizePair(min, max);
    if (err) return { ok: false, error: err };
  }

  if ("attributes" in body) {
    const raw = body.attributes;
    if (raw === null) {
      data.attributes = {};
    } else if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const attrs: Record<string, string[]> = {};
      for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        if (!key.trim()) continue;
        if (Array.isArray(val)) {
          attrs[key] = val
            .map((item) => String(item).trim())
            .filter(Boolean);
        } else if (typeof val === "string" && val.trim()) {
          attrs[key] = [val.trim()];
        }
      }
      data.attributes = attrs;
    } else {
      return { ok: false, error: "Invalid attributes." };
    }
  }

  const crmParsed = parseSpaceCrmLinkInput(body);
  if (!crmParsed.ok) {
    return { ok: false, error: crmParsed.error };
  }
  if (crmParsed.data.crm_organisation_id !== undefined) {
    data.crm_organisation_id = crmParsed.data.crm_organisation_id;
  }
  if (crmParsed.data.crm_contact_id !== undefined) {
    data.crm_contact_id = crmParsed.data.crm_contact_id;
  }

  const pricingParsed = parseSpacePricingInput(body);
  if (!pricingParsed.ok) {
    return { ok: false, error: pricingParsed.error };
  }
  if (pricingParsed.data) {
    data.price_amount = pricingParsed.data.price_amount;
    data.price_unit = pricingParsed.data.price_unit;
    data.deposit_required = pricingParsed.data.deposit_required;
    data.deposit_amount = pricingParsed.data.deposit_amount;
    data.booking_unit = pricingParsed.data.booking_unit;
  }

  const minBookingParsed = parseMinBookingInput(body);
  if (!minBookingParsed.ok) {
    return { ok: false, error: minBookingParsed.error };
  }
  if (minBookingParsed.data) {
    data.min_booking_hours = minBookingParsed.data.min_booking_hours;
    data.min_booking_days = minBookingParsed.data.min_booking_days;
    data.min_booking_months = minBookingParsed.data.min_booking_months;
  }

  if (pricingParsed.data || minBookingParsed.data) {
    const periodFields = normalizeSpacePricingPeriodDbFields({
      booking_unit: data.booking_unit ?? null,
      price_unit: data.price_unit ?? null,
      min_booking_hours: data.min_booking_hours ?? null,
      min_booking_days: data.min_booking_days ?? null,
      min_booking_months: data.min_booking_months ?? null,
    });

    const periodAssert = assertSpacePricingPeriodDbFields(periodFields);
    if (!periodAssert.ok) {
      return { ok: false, error: periodAssert.error };
    }

    data.booking_unit = periodFields.booking_unit;
    data.price_unit = periodFields.price_unit;
    data.min_booking_hours = periodFields.min_booking_hours;
    data.min_booking_days = periodFields.min_booking_days;
    data.min_booking_months = periodFields.min_booking_months;
  }

  return { ok: true, data };
}

/** Apply parsed admin space fields to a DB patch without clobbering unrelated columns. */
export function applyUnclaimedSpaceUpdatePatch(
  patch: Record<string, unknown>,
  d: UnclaimedSpaceInput,
  options?: { propertyId?: string }
): void {
  if (options?.propertyId) {
    patch.property_id = options.propertyId;
  }

  if (d.title !== undefined) patch.title = d.title?.trim() || "Untitled listing";
  if (d.description !== undefined) patch.description = d.description;
  if (d.space_type !== undefined) patch.space_type = d.space_type;
  if (d.city !== undefined) patch.city = d.city;
  if (d.suburb !== undefined) patch.suburb = d.suburb;
  if (d.province !== undefined) patch.province = d.province;
  if (d.postal_code !== undefined) patch.postal_code = d.postal_code;
  if (d.country !== undefined) patch.country = d.country ?? "South Africa";
  if (d.latitude !== undefined) patch.latitude = d.latitude;
  if (d.longitude !== undefined) patch.longitude = d.longitude;
  if (d.min_group_size !== undefined) patch.min_group_size = d.min_group_size;
  if (d.max_group_size !== undefined) patch.max_group_size = d.max_group_size;
  if (d.crm_organisation_id !== undefined) {
    patch.crm_organisation_id = d.crm_organisation_id;
  }
  if (d.crm_contact_id !== undefined) patch.crm_contact_id = d.crm_contact_id;
  if (d.min_booking_hours !== undefined) patch.min_booking_hours = d.min_booking_hours;
  if (d.min_booking_days !== undefined) patch.min_booking_days = d.min_booking_days;
  if (d.min_booking_months !== undefined) {
    patch.min_booking_months = d.min_booking_months;
  }

  if (d.booking_unit !== undefined) patch.booking_unit = d.booking_unit;
  if (d.price_unit !== undefined) patch.price_unit = d.price_unit;

  const street = d.street_address ?? d.address_line_1;
  if (street !== undefined || d.address_line_1 !== undefined) {
    patch.street_address = street ?? null;
    patch.address_line_1 = street ?? null;
  }

  const hasPricingField =
    d.price_amount !== undefined ||
    d.price_unit !== undefined ||
    d.deposit_required !== undefined ||
    d.deposit_amount !== undefined ||
    d.booking_unit !== undefined;

  if (hasPricingField) {
    if (d.price_amount !== undefined) patch.price_amount = d.price_amount;
    if (d.price_unit !== undefined) patch.price_unit = d.price_unit;
    if (d.deposit_required !== undefined) patch.deposit_required = d.deposit_required;
    if (d.deposit_amount !== undefined) patch.deposit_amount = d.deposit_amount;

    const pricingParsed = parseSpacePricingInput({
      price_amount: d.price_amount,
      price_unit: d.price_unit,
      deposit_required: d.deposit_required ?? false,
      deposit_amount: d.deposit_amount ?? null,
    });
    if (pricingParsed.ok && pricingParsed.data) {
      patch.booking_unit = pricingParsed.data.booking_unit;
      patch.price_per_hour = pricingParsed.data.price_per_hour;
      patch.price_per_day = pricingParsed.data.price_per_day;
      patch.price_per_month = pricingParsed.data.price_per_month;
    }
  }

  finalizeSpacePricingLegacyFields(patch);
}

/** Keep rental-period booking_unit and legacy price columns aligned with price_unit. */
export function finalizeSpacePricingLegacyFields(patch: Record<string, unknown>): void {
  const unitRaw = patch.price_unit;
  if (typeof unitRaw !== "string" || !isSpacePriceUnit(unitRaw.trim())) return;

  const unit = unitRaw.trim() as SpacePriceUnit;
  const amount =
    patch.price_amount === null || patch.price_amount === undefined
      ? null
      : typeof patch.price_amount === "number" && Number.isFinite(patch.price_amount)
        ? patch.price_amount
        : null;

  const legacy = syncLegacyPriceFields(amount, unit);
  patch.booking_unit = legacy.booking_unit;
  patch.price_per_hour = legacy.price_per_hour;
  patch.price_per_day = legacy.price_per_day;
  patch.price_per_month = legacy.price_per_month;
}

export function buildUnclaimedSpaceRow(
  input: UnclaimedSpaceInput,
  adminUserId: string,
  status: AdminUnclaimedStatus,
  options?: { propertyId?: string | null }
): Record<string, unknown> {
  const street = input.street_address ?? input.address_line_1 ?? null;
  const priceUnit = (input.price_unit as SpacePriceUnit | null) ?? null;
  const legacy = syncLegacyPriceFields(input.price_amount ?? null, priceUnit);

  return {
    owner_id: null,
    created_by_admin: true,
    created_by_admin_id: adminUserId,
    property_id: options?.propertyId ?? null,
    status,
    title: input.title?.trim() || "Untitled listing",
    description: input.description ?? null,
    space_type: input.space_type ?? null,
    booking_unit: input.booking_unit ?? legacy.booking_unit,
    city: input.city ?? null,
    suburb: input.suburb ?? null,
    street_address: street,
    province: input.province ?? null,
    postal_code: input.postal_code ?? null,
    country: input.country ?? "South Africa",
    address_line_1: street,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    price_per_hour: legacy.price_per_hour,
    price_per_day: legacy.price_per_day,
    price_per_month: legacy.price_per_month,
    verification_status: "pending",
    ownership_proof_status: "pending",
    crm_organisation_id: input.crm_organisation_id ?? null,
    crm_contact_id: input.crm_contact_id ?? null,
    min_group_size: isGroupSizeApplicable(input.space_type)
      ? (input.min_group_size ?? null)
      : null,
    max_group_size: isGroupSizeApplicable(input.space_type)
      ? (input.max_group_size ?? null)
      : null,
    price_amount: input.price_amount ?? null,
    price_unit: input.price_unit ?? null,
    deposit_required: input.deposit_required ?? false,
    deposit_amount: input.deposit_amount ?? null,
    min_booking_hours: input.min_booking_hours ?? null,
    min_booking_days: input.min_booking_days ?? null,
    min_booking_months: input.min_booking_months ?? null,
  };
}

export async function syncSpaceAttributes(
  admin: SupabaseClient,
  spaceId: string,
  attributes: Record<string, string[]> | undefined
) {
  if (attributes === undefined) return null;

  const { error: delErr } = await admin
    .from("space_attributes")
    .delete()
    .eq("space_id", spaceId);
  if (delErr) return delErr.message;

  const rows = Object.entries(attributes).flatMap(([attribute_key, values]) =>
    values.map((attribute_value) => ({
      space_id: spaceId,
      attribute_key,
      attribute_value,
    }))
  );

  if (rows.length === 0) return null;

  const { error: insErr } = await admin.from("space_attributes").insert(rows);
  return insErr?.message ?? null;
}

export async function fetchAdminCreatedListing(
  admin: SupabaseClient,
  spaceId: string,
  options: { allowOwnerClaimed?: boolean } = {}
) {
  const { data, error } = await admin
    .from("spaces")
    .select("*")
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !data) return { error: error?.message || "Listing not found." };

  const row = data as { status: string | null; created_by_admin?: boolean };
  if (!row.created_by_admin) {
    return { error: "Not an admin-created listing." };
  }

  const allowed: readonly string[] = options.allowOwnerClaimed
    ? ADMIN_CREATED_VIEW_STATUSES
    : ADMIN_UNCLAIMED_STATUSES;

  if (!allowed.includes(row.status || "")) {
    return {
      error: "Listing is no longer in the admin unclaimed workflow.",
    };
  }

  return { space: data, readOnly: row.status === "owner_claimed" };
}

export async function fetchAdminPropertySpace(
  admin: SupabaseClient,
  propertyId: string,
  spaceId: string
) {
  const { data, error } = await admin
    .from("spaces")
    .select("*")
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message || "Space not found." };
  }

  const row = data as {
    property_id: string | null;
    status: string | null;
  };

  if (row.property_id !== propertyId) {
    return { error: "This space does not belong to the selected property." };
  }

  const status = row.status || "";
  const readOnly = status === "deleted";

  return { space: data, readOnly };
}

/** Any non-deleted space a platform admin may manage (images, etc.). */
export async function fetchAdminManageableSpace(
  admin: SupabaseClient,
  spaceId: string
) {
  const { data, error } = await admin
    .from("spaces")
    .select("id, status, property_id, created_by_admin")
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message || "Space not found." };
  }

  const status = (data as { status: string | null }).status || "";
  if (status === "deleted") {
    return { error: "This space has been deleted." };
  }

  return { space: data };
}

export async function fetchAdminUnclaimedSpace(
  admin: SupabaseClient,
  spaceId: string
) {
  return fetchAdminCreatedListing(admin, spaceId, { allowOwnerClaimed: false });
}

export type PublishValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function validateReadyToPublishUnclaimed(
  admin: SupabaseClient,
  spaceId: string
): Promise<PublishValidationResult> {
  const { space, error } = await fetchAdminUnclaimedSpace(admin, spaceId);
  if (error || !space) {
    return { ok: false, error: error || "Listing not found." };
  }

  return validateMinimumPublicContent(admin, spaceId);
}

export function isAdminUnclaimedStatus(
  status: string | null | undefined
): status is AdminUnclaimedStatus {
  return ADMIN_UNCLAIMED_STATUSES.includes(status as AdminUnclaimedStatus);
}

export { UNCLAIMED_LISTING_STATUS };
