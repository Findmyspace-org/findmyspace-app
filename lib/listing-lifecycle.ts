import {
  isEnquiryListingMode,
  isLiveBookableMode,
  isPublicListingMode,
  isSpacePubliclyVisible,
  PUBLIC_LISTING_MODE_ENQUIRY,
  PUBLIC_LISTING_MODE_LIVE,
  PUBLIC_LISTING_MODE_OFF,
  PUBLIC_LISTING_MODES,
  type PublicListingMode,
  type SpaceListingModeFields,
} from "@/lib/public-listing-mode";

export {
  PUBLIC_LISTING_MODES,
  PUBLIC_LISTING_MODE_OFF,
  PUBLIC_LISTING_MODE_ENQUIRY,
  PUBLIC_LISTING_MODE_LIVE,
  type PublicListingMode,
  type SpaceListingModeFields,
  isPublicListingMode,
  isEnquiryListingMode,
  isLiveBookableMode,
  isSpacePubliclyVisible,
  publicListingModeLabel,
  canAdminSetEnquiryMode,
} from "@/lib/public-listing-mode";

/** @deprecated Use public_listing_mode filters — kept for migration compatibility. */
export const PUBLIC_LISTING_STATUSES = ["active", "unclaimed"] as const;

export type PublicListingStatus = (typeof PUBLIC_LISTING_STATUSES)[number];

export const BOOKABLE_LISTING_STATUS = "active" as const;

export const UNCLAIMED_LISTING_STATUS = "unclaimed" as const;

export const OWNER_CLAIMED_STATUS = "owner_claimed" as const;

export const NEEDS_CHANGES_STATUS = "needs_changes" as const;

export const PENDING_VERIFICATION_STATUS = "pending_verification" as const;

/** Statuses where owners may save listing content (not lifecycle transitions). */
export const OWNER_EDITABLE_LISTING_STATUSES = [
  NEEDS_CHANGES_STATUS,
  BOOKABLE_LISTING_STATUS,
  "paused",
  "pending",
] as const;

/** Claim onboarding — verification steps only, no full listing edit. */
export const OWNER_CLAIM_ONBOARDING_STATUSES = [
  OWNER_CLAIMED_STATUS,
  PENDING_VERIFICATION_STATUS,
] as const;

export function canOwnerEditListing(
  status: string | null | undefined
): boolean {
  return OWNER_EDITABLE_LISTING_STATUSES.includes(
    (status || "") as (typeof OWNER_EDITABLE_LISTING_STATUSES)[number]
  );
}

export function isOwnerClaimOnboardingStatus(
  status: string | null | undefined
): boolean {
  return OWNER_CLAIM_ONBOARDING_STATUSES.includes(
    (status || "") as (typeof OWNER_CLAIM_ONBOARDING_STATUSES)[number]
  );
}

export function isOwnerListingLockedForEdit(
  status: string | null | undefined
): boolean {
  return (
    isOwnerClaimOnboardingStatus(status) ||
    status === "rejected" ||
    status === "draft" ||
    status === UNCLAIMED_LISTING_STATUS
  );
}

export function getOwnerListingClaimHref(spaceId: string): string {
  return `/dashboard/listings/${spaceId}/claim`;
}

export type SpaceBookabilityInput =
  | string
  | null
  | undefined
  | (SpaceListingModeFields & { is_bookable?: boolean | null });

function resolveBookabilityFields(
  input: SpaceBookabilityInput
): SpaceListingModeFields & { is_bookable?: boolean | null } {
  if (typeof input === "string" || input === null || input === undefined) {
    return { status: input ?? null, public_listing_mode: PUBLIC_LISTING_MODE_LIVE };
  }
  return input;
}

function resolveIsBookableFlag(
  input: SpaceBookabilityInput,
  publicListingMode: string | null | undefined
): boolean {
  if (typeof input === "object" && input !== null && "is_bookable" in input) {
    return Boolean(input.is_bookable);
  }
  return (
    isLiveBookableMode(publicListingMode ?? PUBLIC_LISTING_MODE_LIVE)
  );
}

export function isSpaceBookable(input: SpaceBookabilityInput): boolean {
  const { status, public_listing_mode } = resolveBookabilityFields(input);
  return (
    status === BOOKABLE_LISTING_STATUS &&
    isLiveBookableMode(public_listing_mode ?? PUBLIC_LISTING_MODE_LIVE) &&
    resolveIsBookableFlag(input, public_listing_mode)
  );
}

export function bookableSpaceError(input: SpaceBookabilityInput): string | null {
  if (isSpaceBookable(input)) return null;
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

export function getOwnerListingStatusLabel(
  status: string | null | undefined,
  options?: { canSubmit?: boolean; publicListingMode?: string | null }
): string {
  switch (status) {
    case OWNER_CLAIMED_STATUS:
      return options?.canSubmit ? "Ready to submit" : "Setup required";
    case NEEDS_CHANGES_STATUS:
      return "Needs attention";
    case PENDING_VERIFICATION_STATUS:
      return "Pending review";
    case "rejected":
      return "Rejected";
    case BOOKABLE_LISTING_STATUS:
      if (options?.publicListingMode === "enquiry") return "Enquiry only";
      if (options?.publicListingMode === "off") return "Not visible";
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

/** Property dashboard: next action for a child space (extends owner listing helpers). */
export function getPropertyChildSpaceNextAction(
  spaceId: string,
  status: string | null | undefined,
  options?: { canSubmit?: boolean }
): OwnerListingNextAction | null {
  const existing = getOwnerListingNextAction(spaceId, status, options);
  if (existing) return existing;

  const editHref = `/spaces/${spaceId}/edit`;
  const completionHref = getOwnerListingCompletionHref(spaceId);

  switch (status) {
    case BOOKABLE_LISTING_STATUS:
    case "paused":
      return { label: "Edit listing", href: editHref, urgent: false, muted: false };
    case "draft":
    case UNCLAIMED_LISTING_STATUS:
      return {
        label: "Complete setup",
        href: completionHref,
        urgent: false,
        muted: false,
      };
    case PENDING_VERIFICATION_STATUS:
    case "pending":
      return {
        label: "Pending review",
        href: getOwnerListingClaimHref(spaceId),
        urgent: false,
        muted: true,
      };
    default:
      return null;
  }
}

export function getOwnerListingNextAction(
  spaceId: string,
  status: string | null | undefined,
  options?: { canSubmit?: boolean }
): OwnerListingNextAction | null {
  const claimHref = getOwnerListingClaimHref(spaceId);
  const completionHref = getOwnerListingCompletionHref(spaceId);

  switch (status) {
    case OWNER_CLAIMED_STATUS:
      if (options?.canSubmit) {
        return {
          label: "Submit for review",
          href: `${claimHref}?step=submit`,
          urgent: false,
          muted: false,
        };
      }
      return { label: "Complete your claim", href: claimHref, urgent: false, muted: false };
    case NEEDS_CHANGES_STATUS:
      return {
        label: "Review requested changes",
        href: `/spaces/${spaceId}/edit`,
        urgent: true,
        muted: false,
      };
    case PENDING_VERIFICATION_STATUS:
      return {
        label: "Pending review",
        href: claimHref,
        urgent: false,
        muted: true,
      };
    case "rejected":
      return {
        label: "Rejected — view details",
        href: claimHref,
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

/** @deprecated Use isSpacePubliclyVisible(public_listing_mode). */
export function isPublicListingStatus(
  status: string | null | undefined
): status is PublicListingStatus {
  return PUBLIC_LISTING_STATUSES.includes(
    (status || "") as PublicListingStatus
  );
}

export function isBookableListingStatus(
  input: SpaceBookabilityInput
): boolean {
  return isSpaceBookable(input);
}

export function isUnclaimedListing(status: string | null | undefined): boolean {
  return status === UNCLAIMED_LISTING_STATUS;
}

export function isEnquiryOnlyListing(
  space: SpaceListingModeFields | null | undefined
): boolean {
  if (!space) return false;
  return isEnquiryListingMode(space.public_listing_mode);
}

export function shouldHideListingPricing(
  space: SpaceListingModeFields | string | null | undefined
): boolean {
  if (typeof space === "string") {
    return isUnclaimedListing(space);
  }
  return (
    isEnquiryListingMode(space?.public_listing_mode) ||
    isUnclaimedListing(space?.status)
  );
}

export function acceptsListingEnquiries(
  space: SpaceListingModeFields | null | undefined
): boolean {
  return isEnquiryListingMode(space?.public_listing_mode);
}

export const UNCLAIMED_LISTING_BADGE = "Availability to be confirmed";

export const UNCLAIMED_REQUEST_INTRO =
  "Tell us how you need this space. Availability will be confirmed when you submit this request.";

export const UNCLAIMED_PRICING_LABEL = "Pricing to be confirmed";

export const UNCLAIMED_PRICING_HINT =
  "Please enquire for pricing and availability.";

export const ENQUIRY_LISTING_BADGE = UNCLAIMED_LISTING_BADGE;

export const ENQUIRY_REQUEST_INTRO = UNCLAIMED_REQUEST_INTRO;

export const ENQUIRY_PRICING_LABEL = UNCLAIMED_PRICING_LABEL;

export const ENQUIRY_PRICING_HINT = UNCLAIMED_PRICING_HINT;
