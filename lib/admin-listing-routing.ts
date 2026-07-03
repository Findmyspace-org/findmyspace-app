/** Admin UI routing for canonical listing lifecycle flows. */

export const LIVE_LISTING_STATUSES = ["active", "paused"] as const;

export const REVIEW_WORKFLOW_STATUSES = [
  "pending_verification",
  "needs_changes",
  "owner_claimed",
  "rejected",
  "pending",
] as const;

export function isLiveListingStatus(status: string | null | undefined): boolean {
  return LIVE_LISTING_STATUSES.includes(
    (status || "") as (typeof LIVE_LISTING_STATUSES)[number]
  );
}

export function needsReviewWorkflow(status: string | null | undefined): boolean {
  return REVIEW_WORKFLOW_STATUSES.includes(
    (status || "") as (typeof REVIEW_WORKFLOW_STATUSES)[number]
  );
}

export function adminListingReviewHref(spaceId: string): string {
  return `/admin/listing-reviews/${spaceId}`;
}

export function adminUnclaimedEditHref(
  spaceId: string,
  options?: { returnTo?: string }
): string {
  return adminCanonicalSpaceEditHref(spaceId, {
    returnTo: options?.returnTo ?? "/admin/unclaimed-listings",
  });
}

/** Inline quick content edit on Marketplace → Listings (not the main Edit action). */
export function adminQuickContentEditHref(spaceId: string): string {
  return `/admin/listings?space=${encodeURIComponent(spaceId)}`;
}

/** @deprecated Use adminCanonicalSpaceEditHref — kept for quick-content panel deep links. */
export function adminLiveSpaceEditHref(spaceId: string): string {
  return adminQuickContentEditHref(spaceId);
}

export function adminPropertySpaceEditHref(
  propertyId: string,
  spaceId: string,
  options?: { returnTo?: string }
): string {
  return adminCanonicalSpaceEditHref(spaceId, {
    returnTo: options?.returnTo ?? `/admin/properties/${propertyId}`,
  });
}

/** Canonical full admin space edit — all admin Edit actions should use this. */
export function adminCanonicalSpaceEditHref(
  spaceId: string,
  options?: { returnTo?: string }
): string {
  const path = `/admin/spaces/${spaceId}/edit`;
  const returnTo = options?.returnTo?.trim();
  if (!returnTo) return path;
  return `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Single source of truth for admin Edit links across property hub, matrix, and queues. */
export function adminSpaceEditHref(
  space: {
    id: string;
    status?: string | null;
    property_id?: string | null;
  },
  options?: { returnTo?: string }
): string {
  if (options?.returnTo) {
    return adminCanonicalSpaceEditHref(space.id, options);
  }

  if (space.property_id) {
    return adminCanonicalSpaceEditHref(space.id, {
      returnTo: `/admin/properties/${space.property_id}`,
    });
  }

  if (isLiveListingStatus(space.status)) {
    return adminCanonicalSpaceEditHref(space.id, { returnTo: "/admin/listings" });
  }

  if (space.status === "draft" || space.status === "unclaimed") {
    return adminCanonicalSpaceEditHref(space.id, {
      returnTo: "/admin/unclaimed-listings",
    });
  }

  return adminCanonicalSpaceEditHref(space.id, { returnTo: "/admin/spaces/all" });
}

export function ownerCompletionHref(spaceId: string): string {
  return `/dashboard/listings/${spaceId}/complete`;
}
