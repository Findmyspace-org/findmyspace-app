export type OrganisationPayoutReadinessCode =
  | "ready"
  | "organisation_archived"
  | "organisation_unverified"
  | "bank_not_submitted"
  | "bank_pending"
  | "bank_rejected";

export type OrganisationPayoutReadiness = {
  code: OrganisationPayoutReadinessCode;
  ready: boolean;
  label: string;
  explanation: string;
};

export type OrganisationPayoutReadinessInput = {
  organisationStatus: string | null;
  organisationArchivedAt?: string | null;
  verificationStatus: string | null;
  currentBankStatus: string | null;
};

const LABELS: Record<
  OrganisationPayoutReadinessCode,
  { label: string; explanation: string }
> = {
  ready: {
    label: "Payout ready",
    explanation:
      "The organisation is verified and the current bank account is verified. FindMySpace does not transfer funds automatically yet.",
  },
  organisation_archived: {
    label: "Organisation archived",
    explanation: "This organisation is archived, so it is not payout ready.",
  },
  organisation_unverified: {
    label: "Waiting for organisation verification",
    explanation:
      "FindMySpace must verify the organisation before payout readiness can be assessed.",
  },
  bank_not_submitted: {
    label: "Waiting for bank details",
    explanation:
      "The organisation is verified. Submit bank details and proof of bank to continue.",
  },
  bank_pending: {
    label: "Waiting for bank verification",
    explanation:
      "The organisation is verified. Bank verification is pending with FindMySpace.",
  },
  bank_rejected: {
    label: "Bank details need attention",
    explanation:
      "The current bank submission was rejected. Resubmit bank details and proof of bank.",
  },
};

export function resolveOrganisationPayoutReadiness(
  input: OrganisationPayoutReadinessInput
): OrganisationPayoutReadiness {
  let code: OrganisationPayoutReadinessCode;

  if (
    input.organisationStatus === "archived" ||
    Boolean(input.organisationArchivedAt)
  ) {
    code = "organisation_archived";
  } else if (input.verificationStatus !== "verified") {
    code = "organisation_unverified";
  } else if (!input.currentBankStatus) {
    code = "bank_not_submitted";
  } else if (input.currentBankStatus === "pending") {
    code = "bank_pending";
  } else if (input.currentBankStatus === "rejected") {
    code = "bank_rejected";
  } else if (input.currentBankStatus === "verified") {
    code = "ready";
  } else {
    code = "bank_not_submitted";
  }

  const copy = LABELS[code];
  return {
    code,
    ready: code === "ready",
    label: copy.label,
    explanation: copy.explanation,
  };
}
