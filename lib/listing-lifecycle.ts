/** Listing statuses that appear on public browse and detail pages. */
export const PUBLIC_LISTING_STATUSES = ["active", "unclaimed"] as const;

export type PublicListingStatus = (typeof PUBLIC_LISTING_STATUSES)[number];

export const BOOKABLE_LISTING_STATUS = "active" as const;

export const UNCLAIMED_LISTING_STATUS = "unclaimed" as const;

export const OWNER_CLAIMED_STATUS = "owner_claimed" as const;

export const LISTING_ENQUIRY_STATUSES = [
  "new",
  "contacted",
  "owner_contacted",
  "converted",
  "closed",
] as const;

export type ListingEnquiryStatus = (typeof LISTING_ENQUIRY_STATUSES)[number];

export const LISTING_ENQUIRY_DURATION_TYPES = [
  "hourly",
  "daily",
  "monthly",
] as const;

export type ListingEnquiryDurationType =
  (typeof LISTING_ENQUIRY_DURATION_TYPES)[number];

export function isPublicListingStatus(
  status: string | null | undefined
): status is PublicListingStatus {
  return PUBLIC_LISTING_STATUSES.includes(
    (status || "") as PublicListingStatus
  );
}

export function isBookableListingStatus(status: string | null | undefined): boolean {
  return status === BOOKABLE_LISTING_STATUS;
}

export function isUnclaimedListing(status: string | null | undefined): boolean {
  return status === UNCLAIMED_LISTING_STATUS;
}

export function shouldHideListingPricing(status: string | null | undefined): boolean {
  return isUnclaimedListing(status);
}

export const UNCLAIMED_LISTING_BADGE =
  "Space profile prepared by FindMySpace. Availability to be confirmed.";

export const UNCLAIMED_PRICING_LABEL = "Pricing to be confirmed";
