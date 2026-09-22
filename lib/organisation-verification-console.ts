import type { OrganisationPayoutReadinessCode } from "@/lib/access/organisation-payout-readiness";

export type OrganisationReviewQueueItem = {
  organisation_id: string;
  organisation_name: string;
  organisation_status: string | null;
  verification_status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  bank_status: string;
  bank_submitted_at: string | null;
  bank_last4: string | null;
};

export function organisationVerificationMethodLabel(
  method: string | null | undefined
): string | null {
  if (method === "admin_assisted") return "Admin-assisted";
  if (method === "document_review") return "Document review";
  return null;
}

export function compactPayoutReadinessLabel(
  code: OrganisationPayoutReadinessCode | null | undefined
): string {
  switch (code) {
    case "ready":
      return "Payout ready";
    case "organisation_archived":
      return "Organisation inactive";
    case "organisation_unverified":
      return "Organisation verification required";
    case "bank_not_submitted":
      return "Bank details required";
    case "bank_pending":
      return "Bank verification pending";
    case "bank_rejected":
      return "Bank verification rejected";
    default:
      return "Organisation verification required";
  }
}

export function organisationAwaitingAdminReview(
  item: Pick<
    OrganisationReviewQueueItem,
    "verification_status" | "bank_status"
  >
): boolean {
  return (
    item.verification_status === "pending" || item.bank_status === "pending"
  );
}

export function countOrganisationAwaitingReview(
  items: Array<Pick<OrganisationReviewQueueItem, "verification_status" | "bank_status">>
): number {
  return items.filter(organisationAwaitingAdminReview).length;
}

export function shouldShowPrimaryVerifyActions(
  status: string | null | undefined,
  changingDecision: boolean
): boolean {
  if (changingDecision) return true;
  return status !== "verified";
}

export function formatVerificationTimestamp(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function actorDisplayLabel(input: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const full = (input.full_name || "").trim();
  const joined = `${input.first_name || ""} ${input.last_name || ""}`.trim();
  return full || joined || (input.email || "").trim() || "FindMySpace admin";
}

export function organisationTypeLabel(type: string | null | undefined): string {
  if (!type) return "Not set";
  const labels: Record<string, string> = {
    school: "School",
    municipality: "Municipality",
    company: "Company",
    npo: "NPO",
    church: "Church",
    sports_club: "Sports club",
    other: "Other",
  };
  return labels[type] || type;
}

export function proofPreviewKind(
  pathOrUrl: string | null | undefined,
  contentType?: string | null
): "image" | "pdf" | "unknown" {
  const mime = (contentType || "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  const lower = (pathOrUrl || "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(lower)) return "image";
  if (/\.pdf(\?|$)/i.test(lower)) return "pdf";
  return "unknown";
}
