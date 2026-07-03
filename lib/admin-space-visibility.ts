import {
  adminCanonicalSpaceEditHref,
  adminListingReviewHref,
  adminQuickContentEditHref,
  adminSpaceEditHref,
  adminUnclaimedEditHref,
  isLiveListingStatus,
  needsReviewWorkflow,
} from "@/lib/admin-listing-routing";
import {
  isBookableListingStatus,
  isEnquiryOnlyListing,
  isSpacePubliclyVisible,
  isUnclaimedListing,
} from "@/lib/listing-lifecycle";
import {
  isLiveBookableMode,
  normalizePublicListingMode,
  publicListingModeLabel,
  PUBLIC_LISTING_MODE_OFF,
} from "@/lib/public-listing-mode";
import { isArchivedSpace } from "@/lib/space-archive";

export type AdminSpaceVisibilityInfo = {
  visibilityLabel: string;
  bookabilityLabel: string;
  visibilityBadgeClass: string;
  bookabilityBadgeClass: string;
};

const badgeBase =
  "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold";

/** Admin table labels for public visibility and bookability. */
export function getAdminSpaceVisibilityInfo(
  space: {
    status?: string | null;
    public_listing_mode?: string | null;
  } | string | null | undefined
): AdminSpaceVisibilityInfo {
  const status =
    typeof space === "string" || space === null || space === undefined
      ? space
      : space.status;
  const mode =
    typeof space === "object" && space !== null
      ? normalizePublicListingMode(space.public_listing_mode)
      : PUBLIC_LISTING_MODE_OFF;

  if (isArchivedSpace(status)) {
    return {
      visibilityLabel: "Archived",
      bookabilityLabel: "Not bookable",
      visibilityBadgeClass: `${badgeBase} bg-stone-200 text-stone-800`,
      bookabilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-600`,
    };
  }

  if (status === "paused" && mode === PUBLIC_LISTING_MODE_OFF) {
    return {
      visibilityLabel: "Paused",
      bookabilityLabel: "Not bookable",
      visibilityBadgeClass: `${badgeBase} bg-slate-100 text-slate-700`,
      bookabilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-600`,
    };
  }

  if (isLiveBookableMode(mode)) {
    return {
      visibilityLabel: "Live",
      bookabilityLabel: isBookableListingStatus({
        status,
        public_listing_mode: mode,
      })
        ? "Bookable"
        : "Not bookable",
      visibilityBadgeClass: `${badgeBase} bg-green-100 text-green-800`,
      bookabilityBadgeClass: `${badgeBase} bg-green-100 text-green-800`,
    };
  }

  if (mode === "enquiry") {
    return {
      visibilityLabel: "Public enquiry-only",
      bookabilityLabel: "Enquiry only",
      visibilityBadgeClass: `${badgeBase} bg-amber-100 text-amber-900`,
      bookabilityBadgeClass: `${badgeBase} bg-amber-50 text-amber-800`,
    };
  }

  if (status === "draft") {
    return {
      visibilityLabel: "Hidden",
      bookabilityLabel: "Not bookable",
      visibilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-700`,
      bookabilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-600`,
    };
  }

  if (isUnclaimedListing(status)) {
    return {
      visibilityLabel: "Hidden",
      bookabilityLabel: "Not bookable",
      visibilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-700`,
      bookabilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-600`,
    };
  }

  if (needsReviewWorkflow(status)) {
    return {
      visibilityLabel: "Hidden",
      bookabilityLabel: "Not bookable",
      visibilityBadgeClass: `${badgeBase} bg-violet-100 text-violet-800`,
      bookabilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-600`,
    };
  }

  return {
    visibilityLabel: publicListingModeLabel(mode),
    bookabilityLabel: "Not bookable",
    visibilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-700`,
    bookabilityBadgeClass: `${badgeBase} bg-gray-100 text-gray-600`,
  };
}

export { adminSpaceEditHref } from "@/lib/admin-listing-routing";

export function adminSpacePublicViewHref(space: {
  id: string;
  status?: string | null;
  public_listing_mode?: string | null;
}): string | null {
  if (isSpacePubliclyVisible(space)) {
    return `/spaces/${space.id}`;
  }

  if (space.status === "draft" || space.status === "unclaimed") {
    return `/admin/unclaimed-listings/${space.id}/preview`;
  }

  return null;
}

export function adminSpaceStatusActionHref(space: {
  id: string;
  status?: string | null;
  property_id?: string | null;
}): string {
  if (needsReviewWorkflow(space.status)) {
    return adminListingReviewHref(space.id);
  }

  return adminSpaceEditHref(space);
}

/** @deprecated Use adminQuickContentEditHref */
export { adminQuickContentEditHref as adminLiveSpaceEditHref };

export function canAdminToggleLiveStatus(
  space: {
    status?: string | null;
    public_listing_mode?: string | null;
  } | string | null | undefined
): boolean {
  const status = typeof space === "object" && space ? space.status : space;
  return isLiveListingStatus(status);
}

export function canAdminEditSpaceInTable(status: string | null | undefined): boolean {
  return status !== "deleted";
}

export function isEnquiryPublicSpace(space: {
  public_listing_mode?: string | null;
}): boolean {
  return isEnquiryOnlyListing(space);
}
