import type { OrganisationPayoutReadiness } from "@/lib/access/organisation-payout-readiness";
import { compactPayoutReadinessLabel } from "@/lib/organisation-verification-console";
import { organisationListingCommercialHref } from "@/lib/organisation-listing-copy";

export type HostingOverviewVerificationKind = "organisation" | "personal" | "none";

export type HostingOverviewVerificationTool = {
  href: string;
  label: string;
};

export type OrganisationOverviewCardTone = "ready" | "action" | "attention" | "neutral";

export type OrganisationOverviewCardModel = {
  title: string;
  value: string;
  subtitle: string;
  highlight: boolean;
  ready: boolean;
  tone: OrganisationOverviewCardTone;
  href: string;
  ticks: string[];
};

/**
 * Overview commercial card follows the active Hosting organisation context,
 * not the logged-in user's personal verification profile.
 *
 * Organisation + commercial capability (OA / active GA) → organisation card.
 * Organisation without commercial capability (SM / PM) → no card, no bank UI.
 * Personal hosting context (no organisationId) + legacy host → personal card.
 */
export function hostingOverviewVerificationKind(input: {
  organisationId: string | null;
  showOrganisationCommercial: boolean;
  isLegacyHost: boolean;
}): HostingOverviewVerificationKind {
  if (input.organisationId) {
    return input.showOrganisationCommercial ? "organisation" : "none";
  }
  return input.isLegacyHost ? "personal" : "none";
}

export function hostingOverviewVerificationTool(input: {
  organisationId: string | null;
  showOrganisationCommercial: boolean;
  showVerification: boolean;
}): HostingOverviewVerificationTool | null {
  if (input.organisationId && input.showOrganisationCommercial) {
    return {
      href: organisationListingCommercialHref(input.organisationId),
      label: "Verification & payouts",
    };
  }
  if (!input.organisationId && input.showVerification) {
    return {
      href: "/dashboard/verification",
      label: "Verification & settings",
    };
  }
  return null;
}

export function organisationOverviewCard(input: {
  organisationId: string;
  payout: OrganisationPayoutReadiness;
  verificationStatus: string | null;
  verificationSubmittedAt?: string | null;
  verificationRejectionReason?: string | null;
}): OrganisationOverviewCardModel {
  const href = organisationListingCommercialHref(input.organisationId);
  const title = "Organisation & payouts";

  if (input.payout.ready) {
    return {
      title,
      value: "Ready",
      subtitle: "",
      highlight: false,
      ready: true,
      tone: "ready",
      href,
      ticks: [
        "Organisation verified",
        "Bank account verified",
        compactPayoutReadinessLabel("ready"),
      ],
    };
  }

  if (input.verificationStatus === "rejected") {
    const reason = input.verificationRejectionReason?.trim() || "";
    return {
      title,
      value: "Organisation verification needs attention",
      subtitle: reason || "Organisation verification was not approved.",
      highlight: true,
      ready: false,
      tone: "attention",
      href,
      ticks: [],
    };
  }

  if (input.payout.code === "organisation_unverified") {
    const awaitingReview = Boolean(input.verificationSubmittedAt);
    return {
      title,
      value: compactPayoutReadinessLabel("organisation_unverified"),
      subtitle: awaitingReview
        ? "Organisation verification is awaiting review."
        : "Organisation verification needs submission.",
      highlight: false,
      ready: false,
      tone: "action",
      href,
      ticks: [],
    };
  }

  if (input.payout.code === "bank_not_submitted") {
    return {
      title,
      value: compactPayoutReadinessLabel("bank_not_submitted"),
      subtitle:
        "Organisation verified. Add bank details and proof of bank for payout readiness.",
      highlight: false,
      ready: false,
      tone: "action",
      href,
      ticks: [],
    };
  }

  if (input.payout.code === "bank_pending") {
    return {
      title,
      value: compactPayoutReadinessLabel("bank_pending"),
      subtitle: "Organisation verified. Bank details are awaiting review.",
      highlight: false,
      ready: false,
      tone: "action",
      href,
      ticks: [],
    };
  }

  if (input.payout.code === "bank_rejected") {
    return {
      title,
      value: "Bank verification needs attention",
      subtitle: "Organisation verified. Bank details require attention.",
      highlight: true,
      ready: false,
      tone: "attention",
      href,
      ticks: [],
    };
  }

  return {
    title,
    value: compactPayoutReadinessLabel(input.payout.code),
    subtitle: input.payout.explanation,
    highlight: false,
    ready: false,
    tone: "neutral",
    href,
    ticks: [],
  };
}
