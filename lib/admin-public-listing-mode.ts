import type { SupabaseClient } from "@supabase/supabase-js";
import { spaceHasPersistedPhotos } from "@/lib/space-image-persistence";
import { spaceHasLegacyBookablePrice } from "@/lib/space-pricing";
import { computeListingCompletion } from "@/lib/listing-completion";
import {
  canAdminSetEnquiryMode,
  PUBLIC_LISTING_MODE_ENQUIRY,
  PUBLIC_LISTING_MODE_LIVE,
  PUBLIC_LISTING_MODE_OFF,
  type PublicListingMode,
} from "@/lib/public-listing-mode";

export type MinimumPublicContentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function validateMinimumPublicContent(
  admin: SupabaseClient,
  spaceId: string
): Promise<MinimumPublicContentResult> {
  const { data: space, error } = await admin
    .from("spaces")
    .select(
      "id, title, space_type, city, suburb, latitude, longitude, status"
    )
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) {
    return { ok: false, error: error?.message || "Listing not found." };
  }

  const row = space as {
    title: string | null;
    space_type: string | null;
    city: string | null;
    suburb: string | null;
    latitude: number | null;
    longitude: number | null;
  };

  if (!row.title?.trim() || row.title.trim() === "Untitled listing") {
    return { ok: false, error: "Title is required before going public." };
  }
  if (!row.space_type?.trim()) {
    return { ok: false, error: "Category is required before going public." };
  }
  if (!row.city?.trim() && !row.suburb?.trim()) {
    return {
      ok: false,
      error: "City or suburb is required before going public.",
    };
  }
  if (
    row.latitude === null ||
    row.longitude === null ||
    !Number.isFinite(row.latitude) ||
    !Number.isFinite(row.longitude)
  ) {
    return {
      ok: false,
      error:
        "A map pin is required before going public. Place the pin on the map.",
    };
  }

  const photos = await spaceHasPersistedPhotos(admin, spaceId);
  if (!photos.ok) {
    return { ok: false, error: photos.error };
  }

  return { ok: true };
}

function hasBookablePricing(space: {
  booking_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
}): boolean {
  return spaceHasLegacyBookablePrice(space);
}

export type AdminListingModeValidation =
  | {
      ok: true;
      patch: { public_listing_mode: PublicListingMode; status?: string };
    }
  | { ok: false; error: string; blockers?: string[] };

export async function validateAdminPublicListingModeChange(
  admin: SupabaseClient,
  spaceId: string,
  mode: PublicListingMode,
  options?: { overrideNeedsChanges?: boolean }
): Promise<AdminListingModeValidation> {
  const { data: space, error } = await admin
    .from("spaces")
    .select(
      "id, status, owner_id, created_by_admin, booking_unit, price_per_hour, price_per_day, price_per_month"
    )
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) {
    return { ok: false, error: error?.message || "Listing not found." };
  }

  const row = space as {
    status: string | null;
    owner_id: string | null;
    created_by_admin: boolean | null;
    booking_unit: string | null;
    price_per_hour: number | null;
    price_per_day: number | null;
    price_per_month: number | null;
  };

  const status = row.status || "";

  if (mode === PUBLIC_LISTING_MODE_OFF) {
    return { ok: true, patch: { public_listing_mode: PUBLIC_LISTING_MODE_OFF } };
  }

  if (mode === PUBLIC_LISTING_MODE_ENQUIRY) {
    if (
      !canAdminSetEnquiryMode(status, {
        overrideNeedsChanges: options?.overrideNeedsChanges,
      })
    ) {
      return {
        ok: false,
        error:
          status === "needs_changes"
            ? "Needs-changes listings require explicit admin override to go public enquiry-only."
            : "This listing status cannot be set to public enquiry-only.",
      };
    }

    const content = await validateMinimumPublicContent(admin, spaceId);
    if (!content.ok) {
      return { ok: false, error: content.error };
    }

    return {
      ok: true,
      patch: { public_listing_mode: PUBLIC_LISTING_MODE_ENQUIRY },
    };
  }

  if (mode === PUBLIC_LISTING_MODE_LIVE) {
    if (status === "rejected" || status === "deleted") {
      return {
        ok: false,
        error: "Rejected or deleted listings cannot go live.",
      };
    }

    if (row.owner_id) {
      const completion = await computeListingCompletion(admin, spaceId);

      if (!completion) {
        return { ok: false, error: "Could not evaluate listing completion." };
      }

      if (status === "pending_verification" || status === "pending") {
        if (!completion.canApprove) {
          return {
            ok: false,
            error: "Cannot go live until approval requirements are met.",
            blockers: completion.approvalBlockers,
          };
        }
        return {
          ok: true,
          patch: {
            status: "active",
            public_listing_mode: PUBLIC_LISTING_MODE_LIVE,
          },
        };
      }

      if (status === "needs_changes" || status === "owner_claimed") {
        return {
          ok: false,
          error:
            "Listing must complete review and be approved before going live.",
          blockers: completion.approvalBlockers,
        };
      }

      if (status === "active" || status === "paused") {
        if (!hasBookablePricing(row)) {
          return {
            ok: false,
            error: "Valid pricing is required before going live.",
          };
        }
        if (status === "paused") {
          return {
            ok: false,
            error: "Resume the listing before setting it live/bookable.",
          };
        }
        return {
          ok: true,
          patch: {
            status: "active",
            public_listing_mode: PUBLIC_LISTING_MODE_LIVE,
          },
        };
      }

      return {
        ok: false,
        error: "This listing must be approved before going live.",
        blockers: completion.approvalBlockers,
      };
    }

    const content = await validateMinimumPublicContent(admin, spaceId);
    if (!content.ok) {
      return { ok: false, error: content.error };
    }
    if (!hasBookablePricing(row)) {
      return {
        ok: false,
        error: "Valid pricing is required before going live.",
      };
    }

    if (status !== "active") {
      return {
        ok: true,
        patch: {
          status: "active",
          public_listing_mode: PUBLIC_LISTING_MODE_LIVE,
        },
      };
    }

    return {
      ok: true,
      patch: {
        status: "active",
        public_listing_mode: PUBLIC_LISTING_MODE_LIVE,
      },
    };
  }

  return { ok: false, error: "Invalid public listing mode." };
}

export function adminPublicListingModeAuditAction(
  mode: PublicListingMode
): string {
  switch (mode) {
    case PUBLIC_LISTING_MODE_ENQUIRY:
      return "listing_mode_enquiry";
    case PUBLIC_LISTING_MODE_LIVE:
      return "listing_mode_live";
    default:
      return "listing_mode_hidden";
  }
}
