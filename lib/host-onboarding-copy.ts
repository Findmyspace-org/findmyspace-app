/**
 * Canonical strings for host onboarding (verification → first listing).
 * Import from dashboard verification, new-space, and related surfaces to avoid drift.
 */

/** Shown when a listing exists but admin gates (identity, bank, ownership) are not all approved yet. */
export const LISTING_PENDING_UNTIL_GATES_APPROVED =
  "Your listing stays pending until identity, bank, and ownership proof are approved by our team.";

/** Shorter line for stepper card footnotes and tight layouts. */
export const LISTING_PENDING_SHORT =
  "Listing stays pending until identity, bank, and ownership proof are approved.";

/** Host Admin overview footer / new-space context. */
export const LISTING_GOES_LIVE_AFTER_APPROVALS =
  "You can create a listing now. It goes live once identity, bank, and ownership proof are approved.";

/** When host profile checks are still in progress but listing creation is allowed. */
export const HOST_VERIFICATION_IN_PROGRESS_NOTE =
  "Your host verification is still in progress. You can still create a listing; it will only go live after all required checks are approved.";

/** Bank step subtitle (neutral, trust-focused). */
export const BANK_STEP_SUBTITLE = "Payout account & proof of bank";

export type HostProfileStatusKind = "owner" | "bank";

/** Maps profile verification strings to compact DecisionSuggestion props (labels only; variants for UI). */
export function hostProfileStatusSuggestion(
  kind: HostProfileStatusKind,
  status: string | null | undefined
): {
  variant: "success" | "warning" | "danger" | "info";
  text: string;
  tooltip?: string;
} {
  const s = (status || "pending").toLowerCase();
  const title = kind === "owner" ? "Identity verification" : "Bank verification";
  if (s === "verified") {
    return { variant: "success", text: `${title}: verified` };
  }
  if (s === "rejected") {
    return {
      variant: "danger",
      text: `${title}: rejected — update and resubmit`,
      tooltip: "Upload new documents or details from the relevant step.",
    };
  }
  return {
    variant: "info",
    text: `${title}: pending admin review`,
    tooltip: "We will notify you when review is complete.",
  };
}
