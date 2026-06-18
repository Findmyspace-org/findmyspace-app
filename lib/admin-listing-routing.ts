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

export function adminUnclaimedEditHref(spaceId: string): string {
  return `/admin/unclaimed-listings/${spaceId}/edit`;
}

export function adminLiveSpaceEditHref(spaceId: string): string {
  return `/admin/listings?space=${encodeURIComponent(spaceId)}`;
}

export function adminPropertySpaceEditHref(
  propertyId: string,
  spaceId: string
): string {
  return `/admin/properties/${propertyId}/spaces/${spaceId}/edit`;
}

/** Single source of truth for admin Edit links across property hub, matrix, and queues. */
export function adminSpaceEditHref(space: {
  id: string;
  status?: string | null;
  property_id?: string | null;
}): string {
  const status = space.status;
  const propertyId = space.property_id;
  const id = space.id;

  if (propertyId) {
    return adminPropertySpaceEditHref(propertyId, id);
  }

  if (needsReviewWorkflow(status)) {
    return adminListingReviewHref(id);
  }

  if (status === "draft" || status === "unclaimed") {
    return adminUnclaimedEditHref(id);
  }

  if (isLiveListingStatus(status)) {
    return adminLiveSpaceEditHref(id);
  }

  return adminUnclaimedEditHref(id);
}

export function ownerCompletionHref(spaceId: string): string {
  return `/dashboard/listings/${spaceId}/complete`;
}
