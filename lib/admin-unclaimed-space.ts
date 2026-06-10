import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import { UNCLAIMED_LISTING_STATUS } from "@/lib/listing-lifecycle";
import { parseSpaceCrmLinkInput } from "@/lib/space-crm-link";
import { validateMinimumPublicContent } from "@/lib/admin-public-listing-mode";

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
  crm_organisation_id?: string | null;
  crm_contact_id?: string | null;
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

  return { ok: true, data };
}

export function buildUnclaimedSpaceRow(
  input: UnclaimedSpaceInput,
  adminUserId: string,
  status: AdminUnclaimedStatus,
  options?: { propertyId?: string | null }
): Record<string, unknown> {
  const street = input.street_address ?? input.address_line_1 ?? null;
  return {
    owner_id: null,
    created_by_admin: true,
    created_by_admin_id: adminUserId,
    property_id: options?.propertyId ?? null,
    status,
    title: input.title?.trim() || "Untitled listing",
    description: input.description ?? null,
    space_type: input.space_type ?? null,
    booking_unit: input.booking_unit ?? "day",
    city: input.city ?? null,
    suburb: input.suburb ?? null,
    street_address: street,
    province: input.province ?? null,
    postal_code: input.postal_code ?? null,
    country: input.country ?? "South Africa",
    address_line_1: street,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    price_per_hour: null,
    price_per_day: null,
    price_per_month: null,
    verification_status: "pending",
    ownership_proof_status: "pending",
    crm_organisation_id: input.crm_organisation_id ?? null,
    crm_contact_id: input.crm_contact_id ?? null,
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
