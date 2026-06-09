import {
  getOwnerListingClaimHref,
  NEEDS_CHANGES_STATUS,
  OWNER_CLAIMED_STATUS,
  OWNER_COMPLETION_FLOW_STATUSES,
  PENDING_VERIFICATION_STATUS,
} from "@/lib/listing-lifecycle";

export type HostActionStatus =
  | "required"
  | "submitted"
  | "pending_review"
  | "approved"
  | "needs_attention";

export type HostActionCard = {
  id: string;
  title: string;
  description: string;
  status: HostActionStatus;
  statusLabel: string;
  href: string;
  visible: boolean;
  /** Host must act — surface in header bell. */
  notify: boolean;
};

export type HostSpaceRow = {
  id: string;
  title: string | null;
  ownership_proof_status: string | null;
  status: string | null;
};

export type HostActionInput = {
  profile: {
    owner_verification_status: string | null;
    bank_verification_status: string | null;
  } | null;
  hasIdFront: boolean;
  hasIdBack: boolean;
  bankProofExists: boolean;
  spaces: HostSpaceRow[];
  ownershipDocSpaceIds: Set<string>;
};

const STATUS_LABEL: Record<HostActionStatus, string> = {
  required: "Required",
  submitted: "Submitted",
  pending_review: "Pending review",
  approved: "Approved",
  needs_attention: "Needs attention",
};

export function hostActionStatusPillClass(status: HostActionStatus): string {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending_review":
    case "submitted":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "needs_attention":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

function hasOwnershipUploaded(
  space: HostSpaceRow,
  ownershipDocSpaceIds: Set<string>
): boolean {
  if (ownershipDocSpaceIds.has(space.id)) return true;
  const proofStatus = space.ownership_proof_status;
  return proofStatus === "pending" || proofStatus === "verified";
}

function identityCard(input: HostActionInput): HostActionCard | null {
  const profile = input.profile;
  if (!profile) return null;

  const identitySubmitted = input.hasIdFront && input.hasIdBack;
  const status = profile.owner_verification_status;

  if (status === "verified") return null;

  if (!identitySubmitted) {
    return {
      id: "identity",
      title: "Identity verification",
      description: "Complete identity verification.",
      status: "required",
      statusLabel: STATUS_LABEL.required,
      href: "/dashboard/verification?step=identity",
      visible: true,
      notify: true,
    };
  }

  if (status === "rejected") {
    return {
      id: "identity",
      title: "Identity verification",
      description: "Identity verification needs attention — please re-upload your ID.",
      status: "needs_attention",
      statusLabel: STATUS_LABEL.needs_attention,
      href: "/dashboard/verification?step=identity",
      visible: true,
      notify: true,
    };
  }

  return {
    id: "identity",
    title: "Identity verification",
    description: "Identity verification is pending review.",
    status: "pending_review",
    statusLabel: STATUS_LABEL.pending_review,
    href: "/dashboard/verification?step=identity",
    visible: true,
    notify: false,
  };
}

function bankCard(input: HostActionInput): HostActionCard | null {
  const profile = input.profile;
  if (!profile) return null;

  const status = profile.bank_verification_status;
  if (status === "verified") return null;

  if (!input.bankProofExists) {
    return {
      id: "bank",
      title: "Bank verification",
      description: "Add bank details before payouts can be processed.",
      status: "required",
      statusLabel: STATUS_LABEL.required,
      href: "/dashboard/verification?step=bank",
      visible: true,
      notify: true,
    };
  }

  if (status === "rejected") {
    return {
      id: "bank",
      title: "Bank verification",
      description: "Bank verification needs attention — please update your details.",
      status: "needs_attention",
      statusLabel: STATUS_LABEL.needs_attention,
      href: "/dashboard/verification?step=bank",
      visible: true,
      notify: true,
    };
  }

  return {
    id: "bank",
    title: "Bank verification",
    description: "Bank details submitted — pending review.",
    status: "pending_review",
    statusLabel: STATUS_LABEL.pending_review,
    href: "/dashboard/verification?step=bank",
    visible: true,
    notify: false,
  };
}

function ownershipCard(input: HostActionInput): HostActionCard | null {
  const relevantSpaces = input.spaces.filter(
    (space) =>
      (space.status || "") !== "deleted" &&
      (space.status || "") !== "unclaimed" &&
      OWNER_COMPLETION_FLOW_STATUSES.includes(
        (space.status || "") as (typeof OWNER_COMPLETION_FLOW_STATUSES)[number]
      )
  );

  if (relevantSpaces.length === 0) return null;

  const needsUpload = relevantSpaces.filter(
    (space) =>
      !hasOwnershipUploaded(space, input.ownershipDocSpaceIds) &&
      space.ownership_proof_status !== "pending"
  );
  const pendingReview = relevantSpaces.filter(
    (space) =>
      hasOwnershipUploaded(space, input.ownershipDocSpaceIds) &&
      space.ownership_proof_status !== "verified" &&
      space.ownership_proof_status !== "rejected"
  );
  const rejected = relevantSpaces.filter(
    (space) => space.ownership_proof_status === "rejected"
  );

  if (
    needsUpload.length === 0 &&
    pendingReview.length === 0 &&
    rejected.length === 0
  ) {
    return null;
  }

  if (rejected.length > 0) {
    const href =
      rejected.length === 1
        ? getOwnerListingClaimHref(rejected[0].id) + "?step=ownership"
        : "/dashboard/listings";
    return {
      id: "ownership",
      title: "Ownership proof",
      description:
        rejected.length === 1
          ? "Ownership proof needs attention — upload a new document."
          : `Ownership proof needs attention for ${rejected.length} listings.`,
      status: "needs_attention",
      statusLabel: STATUS_LABEL.needs_attention,
      href,
      visible: true,
      notify: true,
    };
  }

  if (needsUpload.length > 0) {
    const href =
      needsUpload.length === 1
        ? getOwnerListingClaimHref(needsUpload[0].id) + "?step=ownership"
        : "/dashboard/listings";
    return {
      id: "ownership",
      title: "Ownership proof",
      description:
        needsUpload.length === 1
          ? "Upload ownership proof for your listing."
          : `Upload ownership proof for ${needsUpload.length} listings.`,
      status: "required",
      statusLabel: STATUS_LABEL.required,
      href,
      visible: true,
      notify: true,
    };
  }

  const href =
    pendingReview.length === 1
      ? getOwnerListingClaimHref(pendingReview[0].id) + "?step=ownership"
      : "/dashboard/listings";

  return {
    id: "ownership",
    title: "Ownership proof",
    description:
      pendingReview.length === 1
        ? "Ownership proof is pending review."
        : `Ownership proof is pending review for ${pendingReview.length} listings.`,
    status: "pending_review",
    statusLabel: STATUS_LABEL.pending_review,
    href,
    visible: true,
    notify: false,
  };
}

function listingReviewCard(input: HostActionInput): HostActionCard | null {
  const reviewListings = input.spaces.filter((space) => {
    const status = space.status || "";
    return (
      status === OWNER_CLAIMED_STATUS ||
      status === PENDING_VERIFICATION_STATUS ||
      status === NEEDS_CHANGES_STATUS ||
      status === "rejected"
    );
  });

  if (reviewListings.length === 0) return null;

  const needsAction = reviewListings.filter(
    (s) =>
      s.status === OWNER_CLAIMED_STATUS ||
      s.status === NEEDS_CHANGES_STATUS ||
      s.status === "rejected"
  );
  const pending = reviewListings.filter(
    (s) => s.status === PENDING_VERIFICATION_STATUS
  );

  if (needsAction.length > 0) {
    const urgent = needsAction.find(
      (s) => s.status === NEEDS_CHANGES_STATUS || s.status === "rejected"
    );
    const target = urgent || needsAction[0];
    const href =
      target.status === NEEDS_CHANGES_STATUS
        ? `/spaces/${target.id}/edit`
        : getOwnerListingClaimHref(target.id);

    let description = "Complete your listing claim.";
    if (target.status === NEEDS_CHANGES_STATUS) {
      description = "Review requested changes on your listing.";
    } else if (target.status === "rejected") {
      description = "Your listing claim was rejected — view details.";
    } else if (needsAction.length > 1) {
      description = `${needsAction.length} listings need your attention.`;
    }

    return {
      id: "listing_review",
      title: "Listing review",
      description,
      status:
        target.status === NEEDS_CHANGES_STATUS || target.status === "rejected"
          ? "needs_attention"
          : "required",
      statusLabel:
        target.status === NEEDS_CHANGES_STATUS || target.status === "rejected"
          ? STATUS_LABEL.needs_attention
          : STATUS_LABEL.required,
      href,
      visible: true,
      notify: true,
    };
  }

  if (pending.length > 0) {
    const href =
      pending.length === 1
        ? getOwnerListingClaimHref(pending[0].id)
        : "/dashboard/listings";
    return {
      id: "listing_review",
      title: "Listing review",
      description:
        pending.length === 1
          ? "Your claim is pending review."
          : `${pending.length} listings are pending review.`,
      status: "pending_review",
      statusLabel: STATUS_LABEL.pending_review,
      href,
      visible: true,
      notify: false,
    };
  }

  return null;
}

export function computeHostActionCards(input: HostActionInput): HostActionCard[] {
  return [
    identityCard(input),
    bankCard(input),
    ownershipCard(input),
    listingReviewCard(input),
  ].filter((card): card is HostActionCard => card !== null && card.visible);
}

export function hostActionNotificationItems(
  cards: HostActionCard[]
): Pick<HostActionCard, "id" | "title" | "description" | "href">[] {
  return cards
    .filter((card) => card.notify)
    .map(({ id, title, description, href }) => ({
      id,
      title,
      description,
      href,
    }));
}
