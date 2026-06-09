import type { ClaimStepUiState } from "@/app/components/ClaimStepStatusCard";

export type ClaimItemDisplay = {
  uiState: ClaimStepUiState;
  statusLabel: string;
};

export type ClaimReadiness = {
  contactComplete: boolean;
  ownershipUploaded: boolean;
  identitySubmitted: boolean;
  ownershipVerified: boolean;
  identityVerified: boolean;
  ownershipRejected: boolean;
  identityRejected: boolean;
};

/** Build claim readiness from raw upload/contact signals (client + server). */
export function buildClaimReadiness(input: {
  contactComplete: boolean;
  hasOwnershipProof: boolean;
  hasIdFront: boolean;
  hasIdBack: boolean;
  ownershipVerified?: boolean;
  identityVerified?: boolean;
  ownershipRejected?: boolean;
  identityRejected?: boolean;
}): ClaimReadiness {
  return {
    contactComplete: input.contactComplete,
    ownershipUploaded: input.hasOwnershipProof,
    identitySubmitted: input.hasIdFront && input.hasIdBack,
    ownershipVerified: input.ownershipVerified ?? false,
    identityVerified: input.identityVerified ?? false,
    ownershipRejected: input.ownershipRejected ?? false,
    identityRejected: input.identityRejected ?? false,
  };
}

export function isClaimReadyToSubmit(readiness: ClaimReadiness): boolean {
  return (
    readiness.contactComplete &&
    readiness.ownershipUploaded &&
    readiness.identitySubmitted
  );
}

export function claimSubmitBlockers(readiness: ClaimReadiness): string[] {
  const blockers: string[] = [];
  if (!readiness.contactComplete) blockers.push("Contact details");
  if (!readiness.ownershipUploaded) blockers.push("Ownership proof");
  if (!readiness.identitySubmitted) blockers.push("Identity documents");
  return blockers;
}

export function contactClaimDisplay(
  contactComplete: boolean
): ClaimItemDisplay {
  if (!contactComplete) {
    return { uiState: "required", statusLabel: "Required" };
  }
  return { uiState: "completed", statusLabel: "Completed" };
}

export function ownershipClaimDisplay(
  readiness: Pick<
    ClaimReadiness,
    "ownershipUploaded" | "ownershipVerified" | "ownershipRejected"
  >
): ClaimItemDisplay {
  if (!readiness.ownershipUploaded) {
    return { uiState: "required", statusLabel: "Required" };
  }
  if (readiness.ownershipRejected) {
    return { uiState: "needs_attention", statusLabel: "Needs attention" };
  }
  if (readiness.ownershipVerified) {
    return { uiState: "completed", statusLabel: "Verified" };
  }
  return {
    uiState: "pending_review",
    statusLabel: "Uploaded — awaiting admin verification",
  };
}

export function identityClaimDisplay(
  readiness: Pick<
    ClaimReadiness,
    "identitySubmitted" | "identityVerified" | "identityRejected"
  >
): ClaimItemDisplay {
  if (!readiness.identitySubmitted) {
    return { uiState: "required", statusLabel: "Required" };
  }
  if (readiness.identityRejected) {
    return { uiState: "needs_attention", statusLabel: "Needs attention" };
  }
  if (readiness.identityVerified) {
    return { uiState: "completed", statusLabel: "Verified" };
  }
  return {
    uiState: "pending_review",
    statusLabel: "Submitted — awaiting admin verification",
  };
}

export type ClaimStepProgressState = "incomplete" | "complete" | "pending_review";

export function claimStepProgress(
  readiness: ClaimReadiness
): {
  details: ClaimStepProgressState;
  ownership: ClaimStepProgressState;
  identity: ClaimStepProgressState;
} {
  return {
    details: readiness.contactComplete ? "complete" : "incomplete",
    ownership: !readiness.ownershipUploaded
      ? "incomplete"
      : readiness.ownershipVerified
        ? "complete"
        : "pending_review",
    identity: !readiness.identitySubmitted
      ? "incomplete"
      : readiness.identityVerified
        ? "complete"
        : "pending_review",
  };
}
