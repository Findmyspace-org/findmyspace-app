/**
 * Single source of truth for workflow UI states across owner claim,
 * verification, property onboarding, admin verification, and comms.
 */

import type { ChecklistItemState } from "@/lib/listing-completion";

/** Profile-level verification decision (profiles.owner_verification_status, etc.). */
export type VerificationDecision =
  | "pending"
  | "verified"
  | "rejected"
  | string
  | null
  | undefined;

/** Document row status when present (owner_verification_documents.status). */
export type DocumentRowStatus = "pending" | "verified" | "rejected" | null;

/** Unified verification UI state for identity, bank, ownership proof. */
export type VerificationUiState =
  | "not_started"
  | "required"
  | "submitted"
  | "pending_review"
  | "verified"
  | "rejected";

/** Property / claim checklist step presentation. */
export type ChecklistUiState =
  | "not_started"
  | "required"
  | "pending_review"
  | "verified"
  | "completed"
  | "needs_attention"
  | "info"
  | "upcoming";

/** Comms inbox presentation derived from notification + workflow. */
export type CommsWorkflowState =
  | "unread"
  | "action_required"
  | "completed"
  | "archived";

export type VerificationUiInput = {
  /** Both ID sides uploaded, bank proof on file, ownership doc exists, etc. */
  submitted: boolean;
  /** profiles.owner_verification_status or equivalent profile field. */
  profileStatus: VerificationDecision;
  /** Optional per-document status — secondary to profile when both sides submitted. */
  documentStatus?: DocumentRowStatus;
  /** Property invite accepted — ownership inherited, no per-space upload. */
  inheritedFromProperty?: boolean;
};

export type VerificationUiPresentation = {
  state: VerificationUiState;
  label: string;
  shortLabel: string;
  badgeClass: string;
  description: string;
};

const VERIFIED_PRESENTATION: VerificationUiPresentation = {
  state: "verified",
  label: "Verified",
  shortLabel: "Verified",
  badgeClass: "bg-emerald-100 text-emerald-800",
  description: "Verification approved.",
};

const REJECTED_PRESENTATION: VerificationUiPresentation = {
  state: "rejected",
  label: "Rejected",
  shortLabel: "Rejected",
  badgeClass: "bg-red-100 text-red-800",
  description: "Verification needs attention — please re-upload.",
};

function pendingPresentation(kind: string): VerificationUiPresentation {
  return {
    state: "pending_review",
    label: "Pending review",
    shortLabel: "Pending review",
    badgeClass: "bg-blue-100 text-blue-800",
    description: `${kind} submitted — awaiting admin review.`,
  };
}

/** Derive unified verification UI from upload + profile decision. */
export function deriveVerificationUi(
  input: VerificationUiInput,
  kind: "Identity" | "Bank" | "Ownership" = "Identity"
): VerificationUiPresentation {
  if (input.inheritedFromProperty) {
    return {
      state: "verified",
      label: "Verified through property ownership",
      shortLabel: "Verified",
      badgeClass: "bg-emerald-100 text-emerald-800",
      description: "Ownership confirmed through venue invitation.",
    };
  }

  if (!input.submitted) {
    return {
      state: kind === "Ownership" ? "required" : "required",
      label: "Required",
      shortLabel: "Required",
      badgeClass: "bg-amber-100 text-amber-900",
      description: `${kind} verification required.`,
    };
  }

  if (input.profileStatus === "verified") {
    return VERIFIED_PRESENTATION;
  }

  if (input.profileStatus === "rejected") {
    return REJECTED_PRESENTATION;
  }

  if (input.documentStatus === "rejected") {
    return REJECTED_PRESENTATION;
  }

  if (input.documentStatus === "verified" && input.profileStatus !== "pending") {
    return VERIFIED_PRESENTATION;
  }

  return pendingPresentation(kind);
}

/** Map unified verification UI → claim step card state. */
export function verificationUiToClaimStepState(
  ui: VerificationUiPresentation
): "required" | "completed" | "pending_review" | "needs_attention" {
  switch (ui.state) {
    case "verified":
      return "completed";
    case "rejected":
      return "needs_attention";
    case "pending_review":
    case "submitted":
      return "pending_review";
    default:
      return "required";
  }
}

/** Map unified verification UI → listing completion checklist item state. */
export function verificationUiToChecklistState(
  ui: VerificationUiPresentation
): ChecklistItemState {
  switch (ui.state) {
    case "verified":
      return "done";
    case "rejected":
      return "rejected";
    case "pending_review":
    case "submitted":
      return "pending_review";
    default:
      return "missing";
  }
}

/** Map checklist item state → property step pill state. */
export function checklistStateToPropertyStep(
  state: ChecklistItemState
): ChecklistUiState {
  switch (state) {
    case "done":
      return "verified";
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

/** Admin queue summary for a host record. */
export type AdminVerificationQueueFlags = {
  identityPending: boolean;
  identityRejected: boolean;
  bankPending: boolean;
  bankRejected: boolean;
  fullyVerified: boolean;
  attentionRequired: boolean;
};

export function deriveAdminVerificationQueueFlags(input: {
  ownerVerificationStatus: VerificationDecision;
  bankVerificationStatus: VerificationDecision;
  hasIdFront: boolean;
  hasIdBack: boolean;
  hasBankProof: boolean;
}): AdminVerificationQueueFlags {
  const identitySubmitted = input.hasIdFront && input.hasIdBack;
  const bankSubmitted = input.hasBankProof;

  const identityPending =
    identitySubmitted && input.ownerVerificationStatus === "pending";
  const identityRejected = input.ownerVerificationStatus === "rejected";
  const bankPending =
    bankSubmitted && input.bankVerificationStatus === "pending";
  const bankRejected = input.bankVerificationStatus === "rejected";

  const fullyVerified =
    input.ownerVerificationStatus === "verified" &&
    input.bankVerificationStatus === "verified";

  return {
    identityPending,
    identityRejected,
    bankPending,
    bankRejected,
    fullyVerified,
    attentionRequired:
      identityRejected || bankRejected || identityPending || bankPending,
  };
}

export function adminQueueSummaryLabel(
  flags: AdminVerificationQueueFlags
): string {
  if (flags.fullyVerified) return "Fully verified";
  const parts: string[] = [];
  if (flags.identityPending || flags.identityRejected) {
    parts.push(flags.identityRejected ? "Identity needs attention" : "Identity pending");
  }
  if (flags.bankPending || flags.bankRejected) {
    parts.push(flags.bankRejected ? "Bank needs attention" : "Bank pending");
  }
  if (parts.length === 0) return "Awaiting documents";
  return parts.join(" · ");
}

/** Notification types that are unresolved admin queue items while unread. */
export const ADMIN_SUBMITTED_NOTIFICATION_TYPES = new Set([
  "identity_submitted",
  "bank_submitted",
  "listing_submitted",
  "listing_pending",
]);

/** Outcome types that represent completed workflow for comms. */
export const COMMS_COMPLETED_NOTIFICATION_TYPES = new Set([
  "identity_verified",
  "bank_verified",
  "listing_activated",
  "ownership_proof_verified",
  "booking_confirmed",
  "booking_paid",
  "payment_received",
  "listing_question_answered",
]);

export function deriveCommsWorkflowState(input: {
  unread: boolean;
  archived: boolean;
  notificationType: string;
  role?: string | null;
}): CommsWorkflowState {
  if (input.archived) return "archived";
  if (COMMS_COMPLETED_NOTIFICATION_TYPES.has(input.notificationType)) {
    return "completed";
  }
  if (
    input.unread &&
    (ADMIN_SUBMITTED_NOTIFICATION_TYPES.has(input.notificationType) ||
      input.notificationType === "identity_rejected" ||
      input.notificationType === "bank_rejected" ||
      input.notificationType === "listing_needs_changes" ||
      input.notificationType === "payment_needed" ||
      input.notificationType === "booking_request")
  ) {
    return "action_required";
  }
  if (input.unread) return "unread";
  if (ADMIN_SUBMITTED_NOTIFICATION_TYPES.has(input.notificationType)) {
    return "completed";
  }
  return "completed";
}
