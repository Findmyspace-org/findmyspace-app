/**
 * Verification display follows listing commercial context, not the operator's
 * role in isolation.
 *
 * personal_host          — spaces.owner_id is the current user, no organisation
 * organisation_managed   — properties.organisation_id is set
 * none                   — operator has no personal-host responsibility here
 *
 * Organisation-managed does NOT mean the Organisation is verified. It means
 * the operator's personal identity/bank/proof must not be shown as this
 * listing's requirements. Organisation commercial copy uses listing
 * organisationId / property.organisation_id, not the operator's personal
 * host profile.
 */

export const VERIFICATION_DISPLAY_PERSONAL_HOST = "personal_host";
export const VERIFICATION_DISPLAY_ORGANISATION_MANAGED = "organisation_managed";
export const VERIFICATION_DISPLAY_NONE = "none";

export type VerificationDisplayContext =
  | typeof VERIFICATION_DISPLAY_PERSONAL_HOST
  | typeof VERIFICATION_DISPLAY_ORGANISATION_MANAGED
  | typeof VERIFICATION_DISPLAY_NONE;

export const ORGANISATION_MANAGED_VERIFICATION_LABEL = "Managed by organisation";

export type ListingVerificationDisplayInput = {
  organisationId?: string | null;
  ownerId?: string | null;
  currentUserId?: string | null;
};

export function listingVerificationDisplayContext(
  input: ListingVerificationDisplayInput
): VerificationDisplayContext {
  if (input.organisationId) {
    return VERIFICATION_DISPLAY_ORGANISATION_MANAGED;
  }
  if (
    input.currentUserId &&
    input.ownerId &&
    input.ownerId === input.currentUserId
  ) {
    return VERIFICATION_DISPLAY_PERSONAL_HOST;
  }
  return VERIFICATION_DISPLAY_NONE;
}

export function showsPersonalVerificationUi(
  context: VerificationDisplayContext
): boolean {
  return context === VERIFICATION_DISPLAY_PERSONAL_HOST;
}

/**
 * Workspace-level: personal identity/bank action cards and /dashboard/verification
 * shortcuts. True only when the user has personal-host commercial responsibility.
 * Organisation grants alone must never flip this on.
 */
export function operatorHasPersonalVerificationResponsibility(input: {
  isHostProfile?: boolean | null;
  ownedSpaceCount?: number;
  ownedPropertyCount?: number;
}): boolean {
  return (
    Boolean(input.isHostProfile) ||
    (input.ownedSpaceCount ?? 0) > 0 ||
    (input.ownedPropertyCount ?? 0) > 0
  );
}

export type ListingVerificationDisplayFields = {
  verification_display_context: VerificationDisplayContext;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
  ownership_proof_status: string | null;
};

/**
 * The only supported way to attach verification statuses to a managed listing
 * row. Organisation-managed listings receive nulls — never the operator's
 * profiles.owner_verification_status / bank_verification_status.
 */
export function verificationFieldsForManagedListing(input: {
  organisationId?: string | null;
  ownerId?: string | null;
  currentUserId?: string | null;
  operatorOwnerVerificationStatus?: string | null;
  operatorBankVerificationStatus?: string | null;
  listingOwnershipProofStatus?: string | null;
}): ListingVerificationDisplayFields {
  const context = listingVerificationDisplayContext(input);
  if (!showsPersonalVerificationUi(context)) {
    return {
      verification_display_context: context,
      owner_verification_status: null,
      bank_verification_status: null,
      ownership_proof_status: null,
    };
  }
  return {
    verification_display_context: context,
    owner_verification_status: input.operatorOwnerVerificationStatus || "pending",
    bank_verification_status: input.operatorBankVerificationStatus || "pending",
    ownership_proof_status: input.listingOwnershipProofStatus || "pending",
  };
}
