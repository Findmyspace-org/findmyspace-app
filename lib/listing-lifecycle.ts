/** Listing statuses that appear on public browse and detail pages. */
export const PUBLIC_LISTING_STATUSES = ["active", "unclaimed"] as const;

export type PublicListingStatus = (typeof PUBLIC_LISTING_STATUSES)[number];

export const BOOKABLE_LISTING_STATUS = "active" as const;

export const UNCLAIMED_LISTING_STATUS = "unclaimed" as const;

export const OWNER_CLAIMED_STATUS = "owner_claimed" as const;

export const NEEDS_CHANGES_STATUS = "needs_changes" as const;

export const PENDING_VERIFICATION_STATUS = "pending_verification" as const;

/** Statuses where owners may save listing content (not lifecycle transitions). */
export const OWNER_EDITABLE_LISTING_STATUSES = [
  OWNER_CLAIMED_STATUS,
  NEEDS_CHANGES_STATUS,
  BOOKABLE_LISTING_STATUS,
  "paused",
  "pending",
] as const;

export function canOwnerEditListing(
  status: string | null | undefined
): boolean {
  return OWNER_EDITABLE_LISTING_STATUSES.includes(
    (status || "") as (typeof OWNER_EDITABLE_LISTING_STATUSES)[number]
  );
}

export function isOwnerListingLockedForEdit(
  status: string | null | undefined
): boolean {
  return (
    status === PENDING_VERIFICATION_STATUS ||
    status === "rejected" ||
    status === "draft" ||
    status === UNCLAIMED_LISTING_STATUS
  );
}

export function isSpaceBookable(status: string | null | undefined): boolean {
  return status === BOOKABLE_LISTING_STATUS;
}

export function bookableSpaceError(
  status: string | null | undefined
): string | null {
  if (isSpaceBookable(status)) return null;
  return "This listing is not available for booking.";
}


/** Owner dashboard: claimed listings moving through completion → review → live. */
export const OWNER_COMPLETION_FLOW_STATUSES = [
  OWNER_CLAIMED_STATUS,
  NEEDS_CHANGES_STATUS,
  PENDING_VERIFICATION_STATUS,
  "rejected",
] as const;

export type OwnerCompletionFlowStatus =
  (typeof OWNER_COMPLETION_FLOW_STATUSES)[number];

export function isOwnerCompletionFlowStatus(
  status: string | null | undefined
): status is OwnerCompletionFlowStatus {
  return OWNER_COMPLETION_FLOW_STATUSES.includes(
    (status || "") as OwnerCompletionFlowStatus
  );
}

export function getOwnerListingCompletionHref(spaceId: string): string {
  return `/dashboard/listings/${spaceId}/complete`;
}

export function getOwnerListingStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case OWNER_CLAIMED_STATUS:
      return "Setup required";
    case NEEDS_CHANGES_STATUS:
      return "Changes requested";
    case PENDING_VERIFICATION_STATUS:
      return "Under review";
    case "rejected":
      return "Rejected";
    case BOOKABLE_LISTING_STATUS:
      return "Live";
    case "paused":
      return "Paused";
    case "pending":
      return "Pending review";
    default:
      return (status || "pending").replace(/_/g, " ");
  }
}

export function getOwnerListingStatusBadgeClass(
  status: string | null | undefined
): string {
  switch (status) {
    case BOOKABLE_LISTING_STATUS:
      return "bg-green-100 text-green-800";
    case "paused":
      return "bg-gray-200 text-gray-800";
    case NEEDS_CHANGES_STATUS:
      return "bg-amber-100 text-amber-900";
    case PENDING_VERIFICATION_STATUS:
      return "bg-blue-100 text-blue-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case OWNER_CLAIMED_STATUS:
      return "bg-violet-100 text-violet-800";
    case "pending":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-yellow-100 text-yellow-800";
  }
}

export type OwnerListingNextAction = {
  label: string;
  href: string;
  urgent: boolean;
  muted: boolean;
};

export function getOwnerListingNextAction(
  spaceId: string,
  status: string | null | undefined
): OwnerListingNextAction | null {
  const href = getOwnerListingCompletionHref(spaceId);

  switch (status) {
    case OWNER_CLAIMED_STATUS:
      return { label: "Complete listing", href, urgent: false, muted: false };
    case NEEDS_CHANGES_STATUS:
      return {
        label: "Review requested changes",
        href,
        urgent: true,
        muted: false,
      };
    case PENDING_VERIFICATION_STATUS:
      return {
        label: "Submitted for review",
        href,
        urgent: false,
        muted: true,
      };
    case "rejected":
      return {
        label: "Rejected — view details",
        href,
        urgent: true,
        muted: false,
      };
    default:
      return null;
  }
}

export const LISTING_ENQUIRY_STATUSES = [
  "new",
  "contacted",
  "owner_contacted",
  "converted",
  "closed",
] as const;

export type ListingEnquiryStatus = (typeof LISTING_ENQUIRY_STATUSES)[number];

export const LISTING_CLAIM_INTEREST_STATUSES = [
  "new",
  "contacted",
  "claim_link_sent",
  "closed",
] as const;

export type ListingClaimInterestStatus =
  (typeof LISTING_CLAIM_INTEREST_STATUSES)[number];

/** Human-readable admin workflow label for listing enquiry status. */
export function getListingEnquiryStatusLabel(
  status: string | null | undefined
): string {
  switch (status) {
    case "new":
      return "New";
    case "contacted":
      return "Contacted";
    case "owner_contacted":
      return "Owner Contacted";
    case "converted":
      return "Converted";
    case "closed":
      return "Closed";
    default:
      return status ? status.replace(/_/g, " ") : "Unknown";
  }
}

/** Human-readable admin workflow label for claim interest status. */
export function getListingClaimInterestStatusLabel(
  status: string | null | undefined
): string {
  switch (status) {
    case "new":
      return "New";
    case "contacted":
      return "Contacted";
    case "claim_link_sent":
      return "Claim Link Sent";
    case "closed":
      return "Closed";
    default:
      return status ? status.replace(/_/g, " ") : "Unknown";
  }
}

export function listingEnquiryStatusPillClass(
  status: string | null | undefined
): string {
  switch (status) {
    case "new":
      return "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
    case "contacted":
      return "border-[#fde68a] bg-[#fef9c3] text-[#854d0e]";
    case "owner_contacted":
      return "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]";
    case "converted":
      return "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]";
    case "closed":
      return "border-[#e2e8f0] bg-[#f8fafb] text-[#64748b]";
    default:
      return "border-[#e2e8f0] bg-[#f8fafb] text-[#64748b]";
  }
}

export function listingClaimInterestStatusPillClass(
  status: string | null | undefined
): string {
  switch (status) {
    case "new":
      return "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
    case "contacted":
      return "border-[#fde68a] bg-[#fef9c3] text-[#854d0e]";
    case "claim_link_sent":
      return "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]";
    case "closed":
      return "border-[#e2e8f0] bg-[#f8fafb] text-[#64748b]";
    default:
      return "border-[#e2e8f0] bg-[#f8fafb] text-[#64748b]";
  }
}

export function isListingEnquiryWorkflowOpen(
  status: string | null | undefined
): boolean {
  return (status || "new") === "new";
}

export function isListingClaimInterestWorkflowOpen(
  status: string | null | undefined
): boolean {
  return (status || "new") === "new";
}

export function isListingEnquiryRequesterWorkflowOpen(
  status: string | null | undefined
): boolean {
  const s = status || "new";
  return s === "new" || s === "contacted" || s === "owner_contacted";
}

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

export const UNCLAIMED_LISTING_BADGE = "Availability to be confirmed";

export const UNCLAIMED_REQUEST_INTRO =
  "Tell us how you need this space. Availability will be confirmed when you submit this request.";

export const UNCLAIMED_PRICING_LABEL = "Pricing to be confirmed";

export const UNCLAIMED_PRICING_HINT =
  "Please enquire for pricing and availability.";
