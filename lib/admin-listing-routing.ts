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

export function ownerCompletionHref(spaceId: string): string {
  return `/dashboard/listings/${spaceId}/complete`;
}
