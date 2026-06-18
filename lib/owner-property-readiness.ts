import type {
  PropertyOnboardingChecklistItem,
  PropertyOnboardingProgress,
} from "@/lib/property-onboarding-progress";
import type { PropertySpacesHealth, PropertySpacesSummary } from "@/lib/property-space-ops";
import { isArchivedSpace } from "@/lib/space-archive";
import {
  OWNER_CLAIMED_STATUS,
  PENDING_VERIFICATION_STATUS,
  getOwnerListingClaimHref,
} from "@/lib/listing-lifecycle";
import { normalizePublicListingMode } from "@/lib/public-listing-mode";

type OwnerSpaceInput = {
  id: string;
  status: string | null;
  public_listing_mode: string | null;
  has_photos: boolean;
  has_pricing: boolean;
  has_location: boolean;
  is_archived: boolean;
  can_submit?: boolean;
};

function buildSpacesReadinessItems(
  spaceCount: number,
  health: PropertySpacesHealth
): PropertyOnboardingChecklistItem[] {
  return [
    {
      id: "spaces-created",
      label:
        spaceCount === 1 ? "1 space linked" : `${spaceCount} spaces linked`,
      done: spaceCount > 0,
      warning: spaceCount === 0,
    },
    {
      id: "space-photos",
      label:
        health.missingPhotos === 0
          ? "All spaces have photos"
          : `${health.missingPhotos} space${health.missingPhotos === 1 ? "" : "s"} missing photos`,
      done: spaceCount > 0 && health.missingPhotos === 0,
      warning: health.missingPhotos > 0,
    },
    {
      id: "space-pricing",
      label:
        health.missingPricing === 0
          ? "All spaces have pricing"
          : `${health.missingPricing} space${health.missingPricing === 1 ? "" : "s"} missing pricing`,
      done: spaceCount > 0 && health.missingPricing === 0,
      warning: health.missingPricing > 0,
    },
    {
      id: "space-location",
      label:
        health.missingLocation === 0
          ? "All spaces have location"
          : `${health.missingLocation} space${health.missingLocation === 1 ? "" : "s"} missing location`,
      done: spaceCount > 0 && health.missingLocation === 0,
      warning: health.missingLocation > 0,
    },
    {
      id: "space-ai-info",
      label:
        health.missingAiInformation === 0
          ? "All spaces have AI information"
          : health.withAiInformation === 0
            ? "No spaces have AI information"
            : `${health.missingAiInformation} space${health.missingAiInformation === 1 ? "" : "s"} missing AI information`,
      done: spaceCount > 0 && health.missingAiInformation === 0,
      warning: health.missingAiInformation > 0,
    },
  ];
}

function pickOwnerNextAction(input: {
  spaceCount: number;
  health: PropertySpacesHealth;
  notClaimedCount: number;
  readyToSubmitCount: number;
  awaitingReviewCount: number;
  summary: PropertySpacesSummary;
  nonArchived: OwnerSpaceInput[];
}): string {
  if (input.spaceCount === 0) {
    return "Your spaces will appear here once FindMySpace links them to this property.";
  }
  if (input.health.missingPhotos > 0) {
    return `Next: Upload photos for ${input.health.missingPhotos} space${input.health.missingPhotos === 1 ? "" : "s"}`;
  }
  if (input.health.missingPricing > 0) {
    return `Next: Add pricing for ${input.health.missingPricing} space${input.health.missingPricing === 1 ? "" : "s"}`;
  }
  if (input.health.missingLocation > 0) {
    return `Next: Set location for ${input.health.missingLocation} space${input.health.missingLocation === 1 ? "" : "s"}`;
  }
  if (input.health.missingAiInformation > 0) {
    return `Next: Add AI information for ${input.health.missingAiInformation} space${input.health.missingAiInformation === 1 ? "" : "s"}`;
  }
  if (input.notClaimedCount > 0) {
    return `Next: Complete claim for ${input.notClaimedCount} space${input.notClaimedCount === 1 ? "" : "s"}`;
  }
  if (input.readyToSubmitCount > 0) {
    return `Next: Submit ${input.readyToSubmitCount} space${input.readyToSubmitCount === 1 ? "" : "s"} for admin review`;
  }
  if (input.awaitingReviewCount > 0) {
    return `Next: ${input.awaitingReviewCount} space${input.awaitingReviewCount === 1 ? "" : "s"} awaiting admin review`;
  }
  const readyForPublic = input.nonArchived.filter((space) => {
    if (isArchivedSpace(space.status)) return false;
    const mode = normalizePublicListingMode(space.public_listing_mode);
    return mode === "off" && space.has_photos && space.has_pricing && space.has_location;
  }).length;
  if (readyForPublic > 0 && input.summary.enquiry + input.summary.live === 0) {
    return "Next: Ask FindMySpace to set visibility to enquiry or live";
  }
  if (input.summary.live === 0 && input.summary.enquiry === 0) {
    return "Next: Work with FindMySpace on public visibility";
  }
  return "Your property is in good shape — keep listings up to date.";
}

export function computeOwnerPropertyReadinessProgress(input: {
  spaces: OwnerSpaceInput[];
  archivedSpaces: OwnerSpaceInput[];
  summary: PropertySpacesSummary;
  health: PropertySpacesHealth;
}): PropertyOnboardingProgress {
  const { spaces, archivedSpaces, summary, health } = input;
  const nonArchived = spaces.filter((s) => !s.is_archived);
  const spaceCount = nonArchived.length;

  const notClaimedCount = nonArchived.filter(
    (s) =>
      s.status !== OWNER_CLAIMED_STATUS &&
      s.status !== PENDING_VERIFICATION_STATUS &&
      s.status !== "needs_changes" &&
      s.status !== "active" &&
      s.status !== "paused" &&
      s.status !== "rejected"
  ).length;

  const readyToSubmitCount = nonArchived.filter(
    (s) => s.status === OWNER_CLAIMED_STATUS && s.can_submit
  ).length;

  const awaitingReviewCount = nonArchived.filter(
    (s) => s.status === PENDING_VERIFICATION_STATUS
  ).length;

  const approvedCount = nonArchived.filter(
    (s) => s.status === "active" || s.status === "paused"
  ).length;

  const propertyItems: PropertyOnboardingChecklistItem[] = [
    {
      id: "property-linked",
      label: "Property linked to your account",
      done: true,
    },
  ];

  const spacesItems = buildSpacesReadinessItems(spaceCount, health);

  const claimItems: PropertyOnboardingChecklistItem[] = [
    {
      id: "owner-claimed",
      label:
        notClaimedCount === 0
          ? "All spaces claimed"
          : `${notClaimedCount} space${notClaimedCount === 1 ? "" : "s"} need claim completion`,
      done: spaceCount > 0 && notClaimedCount === 0,
      warning: notClaimedCount > 0,
    },
    {
      id: "claim-submit",
      label:
        readyToSubmitCount === 0
          ? "No spaces ready to submit"
          : `${readyToSubmitCount} space${readyToSubmitCount === 1 ? "" : "s"} ready to submit`,
      done: readyToSubmitCount === 0,
      warning: readyToSubmitCount > 0,
    },
  ];

  const reviewItems: PropertyOnboardingChecklistItem[] = [
    {
      id: "awaiting-review",
      label:
        awaitingReviewCount === 0
          ? "No spaces awaiting review"
          : `${awaitingReviewCount} space${awaitingReviewCount === 1 ? "" : "s"} awaiting review`,
      done: awaitingReviewCount === 0,
      warning: awaitingReviewCount > 0,
    },
    {
      id: "approved",
      label:
        approvedCount === 0
          ? "No spaces approved yet"
          : `${approvedCount} space${approvedCount === 1 ? "" : "s"} approved`,
      done: approvedCount > 0,
    },
  ];

  const scorableItems = [
    ...propertyItems,
    ...spacesItems,
    ...claimItems,
    ...reviewItems,
  ];

  const completedCount = scorableItems.filter((item) => item.done && !item.warning).length;
  const completionPercent =
    scorableItems.length === 0
      ? 0
      : Math.round((completedCount / scorableItems.length) * 100);

  return {
    completionPercent,
    checklist: {
      property: propertyItems,
      spaces: spacesItems,
      ownership: claimItems,
      review: reviewItems,
      visibility: [],
    },
    nextAction: pickOwnerNextAction({
      spaceCount,
      health,
      notClaimedCount,
      readyToSubmitCount,
      awaitingReviewCount,
      summary,
      nonArchived,
    }),
  };
}

export function buildOwnerReadinessAttentionHrefs(
  spaces: OwnerSpaceInput[]
): Record<string, string> {
  const active = spaces.filter((s) => !s.is_archived);
  const hrefs: Record<string, string> = {};

  const notClaimed = active.find(
    (s) =>
      s.status !== OWNER_CLAIMED_STATUS &&
      s.status !== PENDING_VERIFICATION_STATUS &&
      s.status !== "needs_changes" &&
      s.status !== "active" &&
      s.status !== "paused" &&
      s.status !== "rejected"
  );
  if (notClaimed) {
    hrefs["owner-claimed"] = getOwnerListingClaimHref(notClaimed.id);
  }

  const readyToSubmit = active.find(
    (s) => s.status === OWNER_CLAIMED_STATUS && s.can_submit
  );
  if (readyToSubmit) {
    hrefs["claim-submit"] = `${getOwnerListingClaimHref(readyToSubmit.id)}?step=submit`;
  }

  const awaitingReview = active.find((s) => s.status === PENDING_VERIFICATION_STATUS);
  if (awaitingReview) {
    hrefs["awaiting-review"] = `${getOwnerListingClaimHref(awaitingReview.id)}?step=submit`;
  }

  return hrefs;
}
