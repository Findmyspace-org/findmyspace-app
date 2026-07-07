import type {
  MarketingConsentStatus,
  MarketingContactStatus,
  MarketingLawfulBasis,
} from "./constants";

export type MarketingEligibilityInput = {
  email: string | null | undefined;
  status: MarketingContactStatus | string;
  consentStatus: MarketingConsentStatus | string;
  lawfulBasis: MarketingLawfulBasis | string;
  unsubscribeAt?: string | null;
  suppressedAt?: string | null;
  bounceType?: string | null;
  pipelineStage?: string | null;
};

export type MarketingEligibilityResult = {
  sendable: boolean;
  notSendable: boolean;
  reason: string;
  status: MarketingContactStatus | string;
  lawfulBasis: MarketingLawfulBasis | string;
};

export function normaliseMarketingEmail(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim().toLowerCase();
  const angle = trimmed.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : trimmed).trim();
  return addr.includes("@") ? addr : null;
}

export function evaluateMarketingEligibility(
  input: MarketingEligibilityInput
): MarketingEligibilityResult {
  const email = normaliseMarketingEmail(input.email);

  if (!email) {
    return {
      sendable: false,
      notSendable: true,
      reason: "Missing or invalid email",
      status: "invalid_email",
      lawfulBasis: input.lawfulBasis || "review_required",
    };
  }

  if (input.unsubscribeAt) {
    return {
      sendable: false,
      notSendable: true,
      reason: "Unsubscribed",
      status: "unsubscribed",
      lawfulBasis: input.lawfulBasis || "none",
    };
  }

  if (input.suppressedAt) {
    return {
      sendable: false,
      notSendable: true,
      reason: "Suppressed",
      status: "suppressed",
      lawfulBasis: input.lawfulBasis || "none",
    };
  }

  if (input.status === "suppressed" || input.status === "unsubscribed") {
    return {
      sendable: false,
      notSendable: true,
      reason: `Status is ${input.status}`,
      status: input.status,
      lawfulBasis: input.lawfulBasis || "none",
    };
  }

  if (input.status === "invalid_email") {
    return {
      sendable: false,
      notSendable: true,
      reason: "Invalid email",
      status: "invalid_email",
      lawfulBasis: input.lawfulBasis || "review_required",
    };
  }

  if (input.consentStatus === "withdrawn") {
    return {
      sendable: false,
      notSendable: true,
      reason: "Consent withdrawn",
      status: "unsubscribed",
      lawfulBasis: "none",
    };
  }

  if (input.status === "subscribed" && input.consentStatus === "granted") {
    return {
      sendable: true,
      notSendable: false,
      reason: "Subscribed with consent",
      status: "subscribed",
      lawfulBasis: "consent",
    };
  }

  if (
    input.status === "eligible_customer" &&
    input.lawfulBasis === "existing_customer_similar_services"
  ) {
    return {
      sendable: true,
      notSendable: false,
      reason: "Existing customer similar services basis",
      status: "eligible_customer",
      lawfulBasis: "existing_customer_similar_services",
    };
  }

  if (["signed_up", "listed"].includes(input.pipelineStage || "")) {
    return {
      sendable: false,
      notSendable: true,
      reason: "Existing customer basis may apply — manual review required before send",
      status: input.status || "pending_consent",
      lawfulBasis: "review_required",
    };
  }

  return {
    sendable: false,
    notSendable: true,
    reason: "Pending consent or review required",
    status: input.status || "pending_consent",
    lawfulBasis: input.lawfulBasis || "review_required",
  };
}

/** Default marketing status for a new audience record from pipeline close. Never auto-subscribes. */
export function defaultMarketingStatusForPipelineClose(existing?: {
  status?: string | null;
  consent_status?: string | null;
  lawful_basis?: string | null;
  unsubscribe_at?: string | null;
  suppressed_at?: string | null;
}): {
  status: MarketingContactStatus;
  consentStatus: MarketingConsentStatus;
  lawfulBasis: MarketingLawfulBasis;
} {
  if (existing?.unsubscribe_at || existing?.status === "unsubscribed") {
    return {
      status: "unsubscribed",
      consentStatus: "withdrawn",
      lawfulBasis: "none",
    };
  }
  if (existing?.suppressed_at || existing?.status === "suppressed") {
    return {
      status: "suppressed",
      consentStatus: existing.consent_status === "granted" ? "withdrawn" : "unknown",
      lawfulBasis: "none",
    };
  }
  if (existing?.status === "subscribed" && existing.consent_status === "granted") {
    return {
      status: "subscribed",
      consentStatus: "granted",
      lawfulBasis: (existing.lawful_basis as MarketingLawfulBasis) || "consent",
    };
  }
  if (
    existing?.status === "eligible_customer" &&
    existing.lawful_basis === "existing_customer_similar_services"
  ) {
    return {
      status: "eligible_customer",
      consentStatus: "not_required",
      lawfulBasis: "existing_customer_similar_services",
    };
  }
  return {
    status: "pending_consent",
    consentStatus: "unknown",
    lawfulBasis: "review_required",
  };
}
