/**
 * Commercial beneficiary is who is economically entitled to a booking.
 * It is not login identity and not operational booking authority.
 *
 * Precedence:
 * 1. property.organisation_id → Organisation
 * 2. else space.owner_id → personal host
 * 3. else none
 *
 * Never use property.owner_id when an Organisation exists.
 * Never use Space Manager / Property Manager / Organisation Admin / Global Admin
 * / the current logged-in user as fallback.
 */

export type CommercialBeneficiary =
  | {
      type: "personal";
      userId: string;
      organisationId: null;
    }
  | {
      type: "organisation";
      userId: null;
      organisationId: string;
    }
  | {
      type: "none";
      userId: null;
      organisationId: null;
    };

export type CommercialBeneficiaryInput = {
  propertyOrganisationId?: string | null;
  spaceOwnerId?: string | null;
  /** Ignored when propertyOrganisationId is set. Never a commercial fallback. */
  propertyOwnerId?: string | null;
};

export function resolveCommercialBeneficiary(
  input: CommercialBeneficiaryInput
): CommercialBeneficiary {
  const organisationId = input.propertyOrganisationId?.trim() || null;
  if (organisationId) {
    return {
      type: "organisation",
      userId: null,
      organisationId,
    };
  }

  const spaceOwnerId = input.spaceOwnerId?.trim() || null;
  if (spaceOwnerId) {
    return {
      type: "personal",
      userId: spaceOwnerId,
      organisationId: null,
    };
  }

  return { type: "none", userId: null, organisationId: null };
}

export function snapshotBookingBeneficiary(beneficiary: CommercialBeneficiary): {
  commercial_beneficiary_type: "personal" | "organisation" | null;
  commercial_beneficiary_user_id: string | null;
  commercial_beneficiary_organisation_id: string | null;
} {
  if (beneficiary.type === "personal") {
    return {
      commercial_beneficiary_type: "personal",
      commercial_beneficiary_user_id: beneficiary.userId,
      commercial_beneficiary_organisation_id: null,
    };
  }
  if (beneficiary.type === "organisation") {
    return {
      commercial_beneficiary_type: "organisation",
      commercial_beneficiary_user_id: null,
      commercial_beneficiary_organisation_id: beneficiary.organisationId,
    };
  }
  return {
    commercial_beneficiary_type: null,
    commercial_beneficiary_user_id: null,
    commercial_beneficiary_organisation_id: null,
  };
}

export const NO_COMMERCIAL_BENEFICIARY_ERROR =
  "This listing cannot accept paid bookings because no commercial beneficiary is assigned.";
