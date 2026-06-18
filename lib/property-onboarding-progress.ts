import type { PropertySpacesHealth, PropertySpacesSummary } from "@/lib/property-space-ops";
import { isArchivedSpace } from "@/lib/space-archive";
import { OWNER_CLAIMED_STATUS, PENDING_VERIFICATION_STATUS } from "@/lib/listing-lifecycle";
import { normalizePublicListingMode } from "@/lib/public-listing-mode";

export type PropertyOnboardingChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  warning?: boolean;
  detail?: string;
};

export type PropertyOnboardingProgress = {
  completionPercent: number;
  checklist: {
    property: PropertyOnboardingChecklistItem[];
    spaces: PropertyOnboardingChecklistItem[];
    ownership: PropertyOnboardingChecklistItem[];
    review: PropertyOnboardingChecklistItem[];
    visibility: PropertyOnboardingChecklistItem[];
  };
  nextAction: string;
};

type SpaceInput = {
  id: string;
  status: string | null;
  public_listing_mode: string | null;
  has_photos: boolean;
  has_pricing: boolean;
  has_location: boolean;
  is_archived: boolean;
};

type PropertyInput = {
  crm_organisation_id: string | null;
  owner_id: string | null;
  owner_invited_at: string | null;
  owner_accepted_at: string | null;
};

export function computePropertyOnboardingProgress(input: {
  property: PropertyInput;
  spaces: SpaceInput[];
  archivedSpaces: SpaceInput[];
  summary: PropertySpacesSummary;
  health: PropertySpacesHealth;
  propertyImageCount: number;
}): PropertyOnboardingProgress {
  const { property, spaces, archivedSpaces, summary, health, propertyImageCount } =
    input;

  const activeSpaces = [...spaces, ...archivedSpaces.filter((s) => !s.is_archived)];
  const nonArchived = spaces.filter((s) => !s.is_archived);
  const spaceCount = nonArchived.length;

  const notOwnerClaimedCount = nonArchived.filter(
    (s) =>
      s.status !== OWNER_CLAIMED_STATUS &&
      s.status !== PENDING_VERIFICATION_STATUS &&
      s.status !== "needs_changes" &&
      s.status !== "active" &&
      s.status !== "paused" &&
      s.status !== "rejected"
  ).length;

  const awaitingReviewCount = nonArchived.filter(
    (s) => s.status === PENDING_VERIFICATION_STATUS
  ).length;
  const approvedCount = nonArchived.filter(
    (s) => s.status === "active" || s.status === "paused"
  ).length;

  const ownerInvited = Boolean(
    property.owner_invited_at || property.owner_accepted_at || property.owner_id
  );
  const ownerAccepted = Boolean(property.owner_accepted_at || property.owner_id);

  const crmLinked = Boolean(property.crm_organisation_id);
  const hasPropertyPhotos = propertyImageCount > 0;

  const propertyItems: PropertyOnboardingChecklistItem[] = [
    { id: "created", label: "Property created", done: true },
    { id: "crm", label: "CRM linked", done: crmLinked },
    {
      id: "gallery",
      label: "Property photos",
      done: hasPropertyPhotos,
      warning: !hasPropertyPhotos,
    },
  ];

  const spacesItems: PropertyOnboardingChecklistItem[] = [
    {
      id: "spaces-created",
      label:
        spaceCount === 1
          ? "1 space created"
          : `${spaceCount} spaces created`,
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

  const ownershipItems: PropertyOnboardingChecklistItem[] = [
    {
      id: "invite-sent",
      label: "Owner invited",
      done: ownerInvited,
      warning: !ownerInvited && spaceCount > 0,
    },
    {
      id: "invite-accepted",
      label: "Owner accepted",
      done: ownerAccepted,
      warning: ownerInvited && !ownerAccepted,
    },
    {
      id: "owner-claimed",
      label:
        notOwnerClaimedCount === 0
          ? "All spaces owner claimed"
          : `${notOwnerClaimedCount} space${notOwnerClaimedCount === 1 ? "" : "s"} not owner claimed`,
      done: spaceCount > 0 && notOwnerClaimedCount === 0,
      warning: notOwnerClaimedCount > 0 && ownerAccepted,
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

  const visibilityItems: PropertyOnboardingChecklistItem[] = [
    {
      id: "hidden",
      label: `${summary.hidden} hidden`,
      done: true,
      detail: summary.hidden > 0 ? "Some spaces are hidden" : undefined,
    },
    {
      id: "enquiry",
      label: `${summary.enquiry} enquiry`,
      done: summary.enquiry > 0,
      warning: summary.enquiry === 0 && spaceCount > 0,
    },
    {
      id: "live",
      label: `${summary.live} live`,
      done: summary.live > 0,
    },
  ];

  const allItems = [
    ...propertyItems,
    ...spacesItems,
    ...ownershipItems,
    ...reviewItems,
    ...visibilityItems.filter((item) => item.id !== "hidden" || summary.hidden > 0),
  ];

  const scorableItems = allItems.filter((item) => item.id !== "hidden");
  const completedCount = scorableItems.filter((item) => item.done && !item.warning).length;
  const completionPercent =
    scorableItems.length === 0
      ? 0
      : Math.round((completedCount / scorableItems.length) * 100);

  const nextAction = pickNextAction({
    spaceCount,
    health,
    crmLinked,
    hasPropertyPhotos,
    ownerInvited,
    ownerAccepted,
    notOwnerClaimedCount,
    awaitingReviewCount,
    summary,
    nonArchived,
  });

  return {
    completionPercent,
    checklist: {
      property: propertyItems,
      spaces: spacesItems,
      ownership: ownershipItems,
      review: reviewItems,
      visibility: visibilityItems,
    },
    nextAction,
  };
}

function pickNextAction(input: {
  spaceCount: number;
  health: PropertySpacesHealth;
  crmLinked: boolean;
  hasPropertyPhotos: boolean;
  ownerInvited: boolean;
  ownerAccepted: boolean;
  notOwnerClaimedCount: number;
  awaitingReviewCount: number;
  summary: PropertySpacesSummary;
  nonArchived: SpaceInput[];
}): string {
  if (input.spaceCount === 0) {
    return "Next action: Add the first space";
  }
  if (input.health.missingPhotos > 0) {
    return `Next action: Upload photos for ${input.health.missingPhotos} space${input.health.missingPhotos === 1 ? "" : "s"}`;
  }
  if (input.health.missingPricing > 0) {
    return `Next action: Add pricing for ${input.health.missingPricing} space${input.health.missingPricing === 1 ? "" : "s"}`;
  }
  if (input.health.missingLocation > 0) {
    return `Next action: Set location for ${input.health.missingLocation} space${input.health.missingLocation === 1 ? "" : "s"}`;
  }
  if (input.health.missingAiInformation > 0) {
    return `Next action: Add AI information for ${input.health.missingAiInformation} space${input.health.missingAiInformation === 1 ? "" : "s"}`;
  }
  if (!input.hasPropertyPhotos) {
    return "Next action: Upload property photos";
  }
  if (!input.crmLinked) {
    return "Next action: Link a CRM organisation";
  }
  if (!input.ownerInvited) {
    return "Next action: Send owner invite";
  }
  if (!input.ownerAccepted) {
    return "Next action: Wait for owner to accept invite";
  }
  if (input.notOwnerClaimedCount > 0) {
    return `Next action: ${input.notOwnerClaimedCount} space${input.notOwnerClaimedCount === 1 ? "" : "s"} still need owner claim status`;
  }
  if (input.awaitingReviewCount > 0) {
    return `Next action: Review ${input.awaitingReviewCount} owner submission${input.awaitingReviewCount === 1 ? "" : "s"}`;
  }
  const readyForPublic = input.nonArchived.filter((space) => {
    if (isArchivedSpace(space.status)) return false;
    const mode = normalizePublicListingMode(space.public_listing_mode);
    return mode === "off" && space.has_photos && space.has_pricing && space.has_location;
  }).length;
  if (readyForPublic > 0 && input.summary.enquiry + input.summary.live === 0) {
    return "Next action: Set visibility to enquiry or live";
  }
  if (input.summary.live === 0 && input.summary.enquiry === 0) {
    return "Next action: Set visibility to enquiry or live";
  }
  return "Next action: Property onboarding is in good shape — monitor review and visibility";
}
