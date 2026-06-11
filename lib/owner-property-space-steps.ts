import type { ListingCompletionResult, ChecklistItemState } from "@/lib/listing-completion";
import {
  BOOKABLE_LISTING_STATUS,
  getOwnerListingClaimHref,
  NEEDS_CHANGES_STATUS,
  OWNER_CLAIMED_STATUS,
  PENDING_VERIFICATION_STATUS,
} from "@/lib/listing-lifecycle";
import {
  PUBLIC_LISTING_MODE_ENQUIRY,
  PUBLIC_LISTING_MODE_LIVE,
  PUBLIC_LISTING_MODE_OFF,
} from "@/lib/public-listing-mode";

export type OwnerSpaceStepState =
  | "completed"
  | "required"
  | "pending_review"
  | "needs_attention"
  | "upcoming"
  | "info";

export type OwnerSpaceStep = {
  id: string;
  label: string;
  state: OwnerSpaceStepState;
  href: string | null;
  detail?: string;
};

function mapItemState(state: ChecklistItemState): OwnerSpaceStepState {
  switch (state) {
    case "done":
      return "completed";
    case "missing":
      return "required";
    case "pending_review":
      return "pending_review";
    case "rejected":
      return "needs_attention";
    default:
      return "upcoming";
  }
}

function itemById(
  completion: ListingCompletionResult | null,
  id: string
) {
  return completion?.items.find((item) => item.id === id) ?? null;
}

export function buildOwnerPropertySpaceSteps(input: {
  spaceId: string;
  status: string | null;
  completion: ListingCompletionResult | null;
}): OwnerSpaceStep[] {
  const { spaceId, completion } = input;
  const status = input.status || "";
  const claimHref = getOwnerListingClaimHref(spaceId);
  const inherited = completion?.inheritedOwnership ?? false;
  const contactComplete = completion?.contactComplete ?? false;
  const canSubmit = completion?.canSubmit ?? false;
  const publicMode = completion?.publicListingMode ?? null;

  const identityItem = itemById(completion, "identity");
  const bankItem = itemById(completion, "bank");
  const ownershipItem = itemById(completion, "ownership");

  const steps: OwnerSpaceStep[] = [
    {
      id: "details",
      label: "Claim details",
      state: contactComplete ? "completed" : "required",
      href: contactComplete ? null : `${claimHref}?step=details`,
      detail: contactComplete ? "Contact details saved" : "Confirm your contact details",
    },
    {
      id: "ownership",
      label: "Ownership verification",
      state: inherited
        ? "completed"
        : mapItemState(ownershipItem?.state ?? "missing"),
      href:
        inherited || ownershipItem?.state === "done"
          ? null
          : `${claimHref}?step=ownership`,
      detail: inherited
        ? "Verified through property ownership."
        : ownershipItem?.description,
    },
    {
      id: "identity",
      label: "Identity verification",
      state: mapItemState(identityItem?.state ?? "missing"),
      href:
        identityItem?.state === "done"
          ? null
          : `${claimHref}?step=identity`,
      detail: identityItem?.description,
    },
    {
      id: "bank",
      label: "Bank / payouts",
      state:
        bankItem?.state === "done"
          ? "completed"
          : bankItem?.state === "pending_review"
            ? "pending_review"
            : bankItem?.state === "rejected"
              ? "needs_attention"
              : "upcoming",
      href:
        bankItem?.state === "done" ? null : "/dashboard/verification?step=bank",
      detail: "Required before payouts — optional before claim submission.",
    },
    {
      id: "submit",
      label: "Submit for review",
      state:
        status === PENDING_VERIFICATION_STATUS || status === "pending"
          ? "completed"
          : status === OWNER_CLAIMED_STATUS && canSubmit
            ? "required"
            : status === OWNER_CLAIMED_STATUS
              ? "upcoming"
              : status === NEEDS_CHANGES_STATUS || status === "rejected"
                ? "needs_attention"
                : "completed",
      href:
        status === OWNER_CLAIMED_STATUS && canSubmit
          ? `${claimHref}?step=submit`
          : null,
      detail:
        status === PENDING_VERIFICATION_STATUS
          ? "Submitted — awaiting admin review"
          : canSubmit
            ? "All required steps complete"
            : undefined,
    },
    {
      id: "admin_review",
      label: "Admin review",
      state:
        status === PENDING_VERIFICATION_STATUS || status === "pending"
          ? "pending_review"
          : status === NEEDS_CHANGES_STATUS || status === "rejected"
            ? "needs_attention"
            : status === BOOKABLE_LISTING_STATUS || status === "paused"
              ? "completed"
              : "upcoming",
      href:
        status === NEEDS_CHANGES_STATUS
          ? `/spaces/${spaceId}/edit`
          : status === "rejected"
            ? `${claimHref}?step=submit`
            : status === PENDING_VERIFICATION_STATUS
              ? `${claimHref}?step=submit`
              : null,
      detail:
        status === NEEDS_CHANGES_STATUS
          ? "Admin requested changes"
          : status === "rejected"
            ? "Claim rejected — review admin note"
            : undefined,
    },
    {
      id: "live",
      label: "Live",
      state:
        status === BOOKABLE_LISTING_STATUS && publicMode === PUBLIC_LISTING_MODE_LIVE
          ? "completed"
          : status === BOOKABLE_LISTING_STATUS && publicMode === PUBLIC_LISTING_MODE_ENQUIRY
            ? "info"
            : status === BOOKABLE_LISTING_STATUS && publicMode === PUBLIC_LISTING_MODE_OFF
              ? "info"
              : "upcoming",
      href: status === BOOKABLE_LISTING_STATUS ? `/spaces/${spaceId}/edit` : null,
      detail:
        status === BOOKABLE_LISTING_STATUS && publicMode === PUBLIC_LISTING_MODE_ENQUIRY
          ? "Visible — enquiry only (not bookable)"
          : status === BOOKABLE_LISTING_STATUS && publicMode === PUBLIC_LISTING_MODE_OFF
            ? "Not publicly visible"
            : status === BOOKABLE_LISTING_STATUS
              ? "Listing is live"
              : undefined,
    },
  ];

  return steps;
}
