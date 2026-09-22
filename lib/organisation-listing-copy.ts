import { organisationWorkspaceHref } from "@/lib/access/organisation-workspace";

/**
 * Listing-form verification copy follows commercial listing context
 * (`?organisation=` / property.organisation_id), not the operator's
 * personal host profile.
 */

export const PERSONAL_LISTING_VERIFICATION_BANNER =
  "Listings stay pending until identity, bank, and ownership proof are approved.";

export const PERSONAL_LISTING_VERIFICATION_ACTION = "Verification & payouts";

export const PERSONAL_LISTING_VERIFICATION_HREF =
  "/dashboard/verification?step=overview";

export const ORGANISATION_LISTING_VERIFICATION_HEADING =
  "Organisation verification";

export const ORGANISATION_LISTING_VERIFICATION_BODY =
  "Paid bookings become available once FindMySpace verifies the organisation. Bank verification is required for payout readiness.";

export const ORGANISATION_LISTING_VERIFICATION_ACTION =
  "Organisation verification";

export function listingFormVerificationNoticeKind(
  organisationId: string | null | undefined
): "organisation" | "personal" {
  return organisationId ? "organisation" : "personal";
}

export function organisationListingCommercialHref(organisationId: string): string {
  return organisationWorkspaceHref("/dashboard/organisation", organisationId);
}

export function listingFormBackHref(
  organisationId: string | null | undefined
): string {
  return organisationId
    ? "/dashboard/list-space"
    : PERSONAL_LISTING_VERIFICATION_HREF;
}

export function listingFormBackLabel(
  organisationId: string | null | undefined
): string {
  return organisationId ? "Back to listing options" : "Back to host dashboard";
}

export function listingDraftRestoreNote(
  organisationId: string | null | undefined
): string {
  return organisationId
    ? "Text fields were restored; add photos again if needed."
    : "Text fields were restored; add photos and ownership proof again if needed.";
}
