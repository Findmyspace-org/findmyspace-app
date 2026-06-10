import {
  adminListingReviewHref,
  adminUnclaimedEditHref,
  isLiveListingStatus,
  needsReviewWorkflow,
} from "@/lib/admin-listing-routing";
import {
  isBookableListingStatus,
  isPublicListingStatus,
  isUnclaimedListing,
} from "@/lib/listing-lifecycle";

export type AdminSpaceVisibilityInfo = {
  visibilityLabel: string;
  bookabilityLabel: string;
  visibilityBadgeClass: string;
  bookabilityBadgeClass: string;
};

/** Admin table labels for public visibility and bookability (no lifecycle bypass). */
export function getAdminSpaceVisibilityInfo(
  status: string | null | undefined
): AdminSpaceVisibilityInfo {
  const visibilityBadgeClass =
    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold";
  const bookabilityBadgeClass =
    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold";

  if (status === "draft") {
    return {
      visibilityLabel: "Hidden",
      bookabilityLabel: "Not bookable",
      visibilityBadgeClass: `${visibilityBadgeClass} bg-gray-100 text-gray-700`,
      bookabilityBadgeClass: `${bookabilityBadgeClass} bg-gray-100 text-gray-600`,
    };
  }

  if (isUnclaimedListing(status)) {
    return {
      visibilityLabel: "Public enquiry-only",
      bookabilityLabel: "Enquiry only",
      visibilityBadgeClass: `${visibilityBadgeClass} bg-amber-100 text-amber-900`,
      bookabilityBadgeClass: `${bookabilityBadgeClass} bg-amber-50 text-amber-800`,
    };
  }

  if (status === "active") {
    return {
      visibilityLabel: "Live",
      bookabilityLabel: "Bookable",
      visibilityBadgeClass: `${visibilityBadgeClass} bg-green-100 text-green-800`,
      bookabilityBadgeClass: `${bookabilityBadgeClass} bg-green-100 text-green-800`,
    };
  }

  if (status === "paused") {
    return {
      visibilityLabel: "Paused",
      bookabilityLabel: "Not bookable",
      visibilityBadgeClass: `${visibilityBadgeClass} bg-slate-100 text-slate-700`,
      bookabilityBadgeClass: `${bookabilityBadgeClass} bg-gray-100 text-gray-600`,
    };
  }

  if (needsReviewWorkflow(status)) {
    return {
      visibilityLabel: "Hidden",
      bookabilityLabel: "Not bookable",
      visibilityBadgeClass: `${visibilityBadgeClass} bg-violet-100 text-violet-800`,
      bookabilityBadgeClass: `${bookabilityBadgeClass} bg-gray-100 text-gray-600`,
    };
  }

  return {
    visibilityLabel: "Hidden",
    bookabilityLabel: "Not bookable",
    visibilityBadgeClass: `${visibilityBadgeClass} bg-gray-100 text-gray-700`,
    bookabilityBadgeClass: `${bookabilityBadgeClass} bg-gray-100 text-gray-600`,
  };
}

export function adminSpaceEditHref(space: {
  id: string;
  status?: string | null;
  property_id?: string | null;
}): string {
  const status = space.status;
  const propertyId = space.property_id;

  if (
    propertyId &&
    (status === "draft" || status === "unclaimed" || status === "owner_claimed")
  ) {
    return `/admin/properties/${propertyId}/spaces/${space.id}/edit`;
  }

  if (needsReviewWorkflow(status)) {
    return adminListingReviewHref(space.id);
  }

  if (status === "draft" || status === "unclaimed") {
    return adminUnclaimedEditHref(space.id);
  }

  if (isLiveListingStatus(status)) {
    return `/admin/listings`;
  }

  return adminUnclaimedEditHref(space.id);
}

export function adminSpacePublicViewHref(space: {
  id: string;
  status?: string | null;
}): string | null {
  if (isPublicListingStatus(space.status)) {
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
}): string {
  if (needsReviewWorkflow(space.status)) {
    return adminListingReviewHref(space.id);
  }

  if (isLiveListingStatus(space.status)) {
    return `/admin/spaces`;
  }

  if (space.status === "draft" || space.status === "unclaimed") {
    return adminUnclaimedEditHref(space.id);
  }

  return `/admin/spaces/all`;
}

export function canAdminToggleLiveStatus(status: string | null | undefined): boolean {
  return isLiveListingStatus(status);
}

export function canAdminEditSpaceInTable(status: string | null | undefined): boolean {
  if (isLiveListingStatus(status)) return false;
  if (isBookableListingStatus(status)) return false;
  return true;
}
