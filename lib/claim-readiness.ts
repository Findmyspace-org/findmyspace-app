import type { ClaimStepUiState } from "@/app/components/ClaimStepStatusCard";
import {
  deriveVerificationUi,
  verificationUiToClaimStepState,
  type VerificationDecision,
} from "@/lib/workflow-state";

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
  ownershipInheritedFromProperty?: boolean;
  ownershipVerified?: boolean;
  identityVerified?: boolean;
  ownershipRejected?: boolean;
  identityRejected?: boolean;
}): ClaimReadiness {
  const inherited = Boolean(input.ownershipInheritedFromProperty);
  return {
    contactComplete: input.contactComplete,
    ownershipUploaded: inherited || input.hasOwnershipProof,
    identitySubmitted: input.hasIdFront && input.hasIdBack,
    ownershipVerified: inherited || (input.ownershipVerified ?? false),
    identityVerified: input.identityVerified ?? false,
    ownershipRejected: inherited ? false : (input.ownershipRejected ?? false),
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

export function hasOwnershipProofUploaded(
  ownershipProofStatus: string | null | undefined,
  hasOwnershipDocument = false
): boolean {
  if (hasOwnershipDocument) return true;
  return (
    ownershipProofStatus === "pending" || ownershipProofStatus === "verified"
  );
}

export function ownerClaimCanSubmitForSpace(input: {
  contactComplete: boolean;
  hasIdFront: boolean;
  hasIdBack: boolean;
  ownershipProofStatus: string | null | undefined;
  hasOwnershipDocument?: boolean;
  ownershipInheritedFromProperty?: boolean;
}): boolean {
  return isClaimReadyToSubmit(
    buildClaimReadiness({
      contactComplete: input.contactComplete,
      hasOwnershipProof: hasOwnershipProofUploaded(
        input.ownershipProofStatus,
        input.hasOwnershipDocument
      ),
      hasIdFront: input.hasIdFront,
      hasIdBack: input.hasIdBack,
      ownershipInheritedFromProperty: input.ownershipInheritedFromProperty,
    })
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

export function ownershipClaimDisplay(input: {
  hasOwnershipProof: boolean;
  ownershipProofStatus: VerificationDecision;
  inheritedFromProperty?: boolean;
}): ClaimItemDisplay {
  const ui = deriveVerificationUi(
    {
      submitted: input.hasOwnershipProof,
      profileStatus:
        input.ownershipProofStatus === "verified"
          ? "verified"
          : input.ownershipProofStatus === "rejected"
            ? "rejected"
            : input.hasOwnershipProof
              ? "pending"
              : null,
      inheritedFromProperty: input.inheritedFromProperty,
    },
    "Ownership"
  );
  return {
    uiState: verificationUiToClaimStepState(ui),
    statusLabel: ui.shortLabel,
  };
}

export function identityClaimDisplay(input: {
  hasIdFront: boolean;
  hasIdBack: boolean;
  ownerVerificationStatus: VerificationDecision;
}): ClaimItemDisplay {
  const ui = deriveVerificationUi(
    {
      submitted: input.hasIdFront && input.hasIdBack,
      profileStatus: input.ownerVerificationStatus,
    },
    "Identity"
  );
  return {
    uiState: verificationUiToClaimStepState(ui),
    statusLabel: ui.shortLabel,
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
