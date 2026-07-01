import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateAdminPublicListingModeChange,
  validateMinimumPublicContent,
} from "@/lib/admin-public-listing-mode";
import { countPersistedSpacePhotos } from "@/lib/space-image-persistence";
import { isLiveListingStatus } from "@/lib/admin-listing-routing";
import {
  PUBLIC_LISTING_MODE_OFF,
  normalizePublicListingMode,
  type PublicListingMode,
} from "@/lib/public-listing-mode";
import {
  applyAdminArchiveSpace,
  applyAdminRestoreSpace,
  isArchivedSpace,
  validateAdminArchiveSpace,
  validateAdminRestoreSpace,
} from "@/lib/space-archive";
import {
  spaceHasLocation,
  spaceHasPhotos,
  spaceHasPricing,
} from "@/lib/property-space-ops";

export const MATRIX_STATUS_VALUES = [
  "hidden",
  "live",
  "paused",
  "enquiry",
  "archived",
] as const;
export type MatrixStatusValue = (typeof MATRIX_STATUS_VALUES)[number];

export type MatrixStatusDisplay = MatrixStatusValue;

export const PAUSED_STATUS_ERROR =
  "Only active live listings can be paused. Approve the listing first.";

export const ENQUIRY_READINESS_ERROR =
  "Space cannot be set to enquiry until photos and location are complete.";

export const LIVE_READINESS_ERROR =
  "Space cannot be made live until photos, pricing and location are complete.";

export const BOOKABLE_ERROR =
  "Space must have pricing and not be archived before it can be bookable.";

export function resolveMatrixStatus(space: {
  status: string | null;
  public_listing_mode: string | null;
}): MatrixStatusDisplay {
  if (isArchivedSpace(space.status)) return "archived";
  if ((space.status || "") === "paused") return "paused";
  const mode = normalizePublicListingMode(space.public_listing_mode);
  if (mode === "live") return "live";
  if (mode === "enquiry") return "enquiry";
  return "hidden";
}

export function matrixStatusSelectValue(
  display: MatrixStatusDisplay
): MatrixStatusValue {
  return display;
}

export function matrixStatusLabel(status: MatrixStatusDisplay): string {
  switch (status) {
    case "live":
      return "Live";
    case "paused":
      return "Paused";
    case "enquiry":
      return "Enquiry";
    case "archived":
      return "Archived";
    default:
      return "Hidden";
  }
}

export function matrixStatusPillClass(status: MatrixStatusDisplay): string {
  const base = "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold";
  switch (status) {
    case "live":
      return `${base} bg-green-100 text-green-800`;
    case "paused":
      return `${base} bg-amber-100 text-amber-900`;
    case "enquiry":
      return `${base} bg-amber-100 text-amber-900`;
    case "archived":
      return `${base} bg-slate-200 text-slate-800`;
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
}

export function bookablePillClass(isBookable: boolean): string {
  const base = "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold";
  return isBookable
    ? `${base} bg-green-100 text-green-800`
    : `${base} bg-gray-100 text-gray-600`;
}

export type SpaceReadinessSnapshot = {
  has_photos: boolean;
  has_pricing: boolean;
  has_location: boolean;
};

export type SpacePricingLocationRow = {
  price_amount: number | null;
  price_unit: string | null;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  booking_unit: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  suburb: string | null;
};

export async function loadSpaceReadinessSnapshot(
  admin: SupabaseClient,
  spaceId: string,
  space?: SpacePricingLocationRow
): Promise<SpaceReadinessSnapshot> {
  let row = space;
  if (!row) {
    const { data, error } = await admin
      .from("spaces")
      .select(
        "price_amount, price_unit, deposit_required, deposit_amount, price_per_hour, price_per_day, price_per_month, booking_unit, latitude, longitude, city, suburb"
      )
      .eq("id", spaceId)
      .maybeSingle();
    if (error || !data) {
      return { has_photos: false, has_pricing: false, has_location: false };
    }
    row = data as SpacePricingLocationRow;
  }

  const { count, error } = await countPersistedSpacePhotos(admin, spaceId);
  if (error) {
    return { has_photos: false, has_pricing: false, has_location: false };
  }

  return {
    has_photos: spaceHasPhotos(count),
    has_pricing: spaceHasPricing(row),
    has_location: spaceHasLocation(row),
  };
}

export function assertLiveReadiness(readiness: SpaceReadinessSnapshot): string | null {
  if (readiness.has_photos && readiness.has_pricing && readiness.has_location) {
    return null;
  }
  return LIVE_READINESS_ERROR;
}

export type MatrixStatusPatchResult =
  | {
      ok: true;
      status: string | null;
      public_listing_mode: PublicListingMode;
      is_bookable: boolean;
      matrix_status: MatrixStatusDisplay;
    }
  | { ok: false; error: string; blockers?: string[] };

export async function applyAdminMatrixStatusChange(
  admin: SupabaseClient,
  spaceId: string,
  status: MatrixStatusValue,
  actorUserId: string
): Promise<MatrixStatusPatchResult> {
  const { data: space, error } = await admin
    .from("spaces")
    .select(
      "id, status, public_listing_mode, is_bookable, price_amount, price_unit, deposit_required, deposit_amount, price_per_hour, price_per_day, price_per_month, booking_unit, latitude, longitude, city, suburb"
    )
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) {
    return { ok: false, error: error?.message || "Space not found." };
  }

  const row = space as {
    status: string | null;
    public_listing_mode: string | null;
    is_bookable: boolean | null;
    price_amount: number | null;
    price_unit: string | null;
    deposit_required: boolean | null;
    deposit_amount: number | null;
    price_per_hour: number | null;
    price_per_day: number | null;
    price_per_month: number | null;
    booking_unit: string | null;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    suburb: string | null;
  };

  const archived = isArchivedSpace(row.status);

  if (status === "archived") {
    if (archived) {
      return {
        ok: true,
        status: row.status,
        public_listing_mode: PUBLIC_LISTING_MODE_OFF,
        is_bookable: false,
        matrix_status: "archived",
      };
    }

    const validation = await validateAdminArchiveSpace(admin, spaceId, actorUserId);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    const applied = await applyAdminArchiveSpace(admin, spaceId, validation.patch);
    if (!applied.ok) {
      return { ok: false, error: applied.error };
    }

    await admin.from("spaces").update({ is_bookable: false }).eq("id", spaceId);

    return {
      ok: true,
      status: applied.status,
      public_listing_mode: applied.public_listing_mode,
      is_bookable: false,
      matrix_status: "archived",
    };
  }

  if (archived) {
    const restoreValidation = await validateAdminRestoreSpace(admin, spaceId);
    if (!restoreValidation.ok) {
      return { ok: false, error: restoreValidation.error };
    }
    const restored = await applyAdminRestoreSpace(
      admin,
      spaceId,
      restoreValidation.patch
    );
    if (!restored.ok) {
      return { ok: false, error: restored.error };
    }
  }

  if (status === "hidden") {
    const { error: updateErr } = await admin
      .from("spaces")
      .update({
        public_listing_mode: PUBLIC_LISTING_MODE_OFF,
        is_bookable: false,
      })
      .eq("id", spaceId);

    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }

    const { data: updated } = await admin
      .from("spaces")
      .select("status, public_listing_mode, is_bookable")
      .eq("id", spaceId)
      .maybeSingle();

    const next = updated as {
      status: string | null;
      public_listing_mode: string | null;
      is_bookable: boolean | null;
    };

    return {
      ok: true,
      status: next?.status ?? row.status,
      public_listing_mode: PUBLIC_LISTING_MODE_OFF,
      is_bookable: Boolean(next?.is_bookable),
      matrix_status: "hidden",
    };
  }

  if (status === "enquiry") {
    const content = await validateMinimumPublicContent(admin, spaceId);
    if (!content.ok) {
      return { ok: false, error: ENQUIRY_READINESS_ERROR };
    }

    const validation = await validateAdminPublicListingModeChange(
      admin,
      spaceId,
      "enquiry"
    );
    if (!validation.ok) {
      return { ok: false, error: validation.error, blockers: validation.blockers };
    }

    const { error: updateErr } = await admin
      .from("spaces")
      .update({ ...validation.patch, is_bookable: false })
      .eq("id", spaceId);

    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }

    const { data: updated } = await admin
      .from("spaces")
      .select("status, public_listing_mode, is_bookable")
      .eq("id", spaceId)
      .maybeSingle();

    const next = updated as {
      status: string | null;
      public_listing_mode: string | null;
      is_bookable: boolean | null;
    };

    return {
      ok: true,
      status: next?.status ?? validation.patch.status ?? row.status,
      public_listing_mode: "enquiry",
      is_bookable: false,
      matrix_status: "enquiry",
    };
  }

  if (status === "paused") {
    if (!isLiveListingStatus(row.status) && row.status !== "paused") {
      return { ok: false, error: PAUSED_STATUS_ERROR };
    }

    const { error: updateErr } = await admin
      .from("spaces")
      .update({
        status: "paused",
        public_listing_mode: PUBLIC_LISTING_MODE_OFF,
        is_bookable: false,
      })
      .eq("id", spaceId);

    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }

    return {
      ok: true,
      status: "paused",
      public_listing_mode: PUBLIC_LISTING_MODE_OFF,
      is_bookable: false,
      matrix_status: "paused",
    };
  }

  if (status === "live") {
    const readiness = await loadSpaceReadinessSnapshot(admin, spaceId, row);
    const readinessError = assertLiveReadiness(readiness);
    if (readinessError) {
      return { ok: false, error: readinessError };
    }

    const validation = await validateAdminPublicListingModeChange(
      admin,
      spaceId,
      "live"
    );
    if (!validation.ok) {
      const blockers = validation.blockers;
      if (
        validation.error.includes("photo") ||
        validation.error.includes("pricing") ||
        validation.error.includes("location") ||
        validation.error.includes("map pin") ||
        validation.error.includes("City")
      ) {
        return { ok: false, error: LIVE_READINESS_ERROR, blockers };
      }
      return { ok: false, error: validation.error, blockers };
    }

    const { error: updateErr } = await admin
      .from("spaces")
      .update(validation.patch)
      .eq("id", spaceId);

    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }

    const { data: updated } = await admin
      .from("spaces")
      .select("status, public_listing_mode, is_bookable")
      .eq("id", spaceId)
      .maybeSingle();

    const next = updated as {
      status: string | null;
      public_listing_mode: string | null;
      is_bookable: boolean | null;
    };

    return {
      ok: true,
      status: next?.status ?? validation.patch.status ?? row.status,
      public_listing_mode: "live",
      is_bookable: Boolean(next?.is_bookable),
      matrix_status: "live",
    };
  }

  return { ok: false, error: "Invalid status." };
}

export type MatrixBookablePatchResult =
  | {
      ok: true;
      is_bookable: boolean;
    }
  | { ok: false; error: string };

export async function applyAdminMatrixBookableChange(
  admin: SupabaseClient,
  spaceId: string,
  isBookable: boolean
): Promise<MatrixBookablePatchResult> {
  const { data: space, error } = await admin
    .from("spaces")
    .select(
      "id, status, public_listing_mode, price_amount, price_unit, deposit_required, deposit_amount, price_per_hour, price_per_day, price_per_month, booking_unit"
    )
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) {
    return { ok: false, error: error?.message || "Space not found." };
  }

  const row = space as {
    status: string | null;
    public_listing_mode: string | null;
    price_amount: number | null;
    price_unit: string | null;
    deposit_required: boolean | null;
    deposit_amount: number | null;
    price_per_hour: number | null;
    price_per_day: number | null;
    price_per_month: number | null;
    booking_unit: string | null;
  };

  if (isArchivedSpace(row.status)) {
    return { ok: false, error: BOOKABLE_ERROR };
  }

  if (isBookable) {
    if (!spaceHasPricing(row)) {
      return { ok: false, error: BOOKABLE_ERROR };
    }
  }

  const { error: updateErr } = await admin
    .from("spaces")
    .update({ is_bookable: isBookable })
    .eq("id", spaceId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  return { ok: true, is_bookable: isBookable };
}

export function adminSpaceEditSectionHref(
  baseUrl: string,
  section: "photos" | "pricing" | "location" | "ai"
): string {
  const hash = section === "ai" ? "ai-information" : section;
  return `${baseUrl.split("#")[0]}#${hash}`;
}
