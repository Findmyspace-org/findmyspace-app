import type { CommercialBeneficiary } from "@/lib/access/commercial-beneficiary";

export type OrganisationBookingReadiness =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type OrganisationBookingReadinessInput = {
  organisationId: string | null;
  organisationStatus: string | null;
  organisationArchivedAt?: string | null;
  verificationStatus: string | null;
  commercialProfileExists: boolean;
  beneficiary: CommercialBeneficiary;
};

/**
 * New paid Organisation booking gate.
 * Bank verification is intentionally not required.
 */
export function resolveOrganisationBookingReadiness(
  input: OrganisationBookingReadinessInput
): OrganisationBookingReadiness {
  if (!input.organisationId) {
    return { ok: true };
  }

  if (
    input.organisationStatus === "archived" ||
    Boolean(input.organisationArchivedAt)
  ) {
    return {
      ok: false,
      code: "organisation_archived",
      message: "This organisation is no longer available for booking.",
    };
  }

  if (input.organisationStatus !== "active") {
    return {
      ok: false,
      code: "organisation_inactive",
      message: "This organisation is no longer available for booking.",
    };
  }

  if (!input.commercialProfileExists) {
    return {
      ok: false,
      code: "organisation_unverified",
      message:
        "This organisation cannot accept paid bookings until FindMySpace verifies it.",
    };
  }

  if (input.verificationStatus !== "verified") {
    return {
      ok: false,
      code: "organisation_unverified",
      message:
        "This organisation cannot accept paid bookings until FindMySpace verifies it.",
    };
  }

  if (
    input.beneficiary.type !== "organisation" ||
    input.beneficiary.organisationId !== input.organisationId
  ) {
    return {
      ok: false,
      code: "organisation_beneficiary_mismatch",
      message:
        "This listing cannot accept paid bookings because the organisation is not the commercial beneficiary.",
    };
  }

  return { ok: true };
}
