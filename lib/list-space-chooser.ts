export type ListSpaceOrganisationOption = {
  id: string;
  name: string;
};

export type ListSpaceChooserInput = {
  organisations: ListSpaceOrganisationOption[];
};

export const ORGANISATION_LISTING_DENIED_PARAM = "denied";
export const ORGANISATION_LISTING_DENIED_VALUE = "organisation-context";

export function listSpaceChooserOptions(input: ListSpaceChooserInput): {
  myself: true;
  organisations: ListSpaceOrganisationOption[];
  createOrganisation: true;
} {
  return {
    myself: true,
    organisations: input.organisations,
    createOrganisation: true,
  };
}

export function organisationListingHref(
  organisationId: string,
  propertyId?: string | null
): string {
  const params = new URLSearchParams();
  params.set("organisation", organisationId);
  if (propertyId) params.set("property", propertyId);
  return `/dashboard/new-space?${params.toString()}`;
}

export function personalListingHref(isHost: boolean): string {
  return isHost ? "/dashboard/new-space" : "/dashboard/become-host";
}

/**
 * Organisation listing context is OA of that Organisation, or active Global Admin.
 * SM/PM/personal host/authenticated-only never qualify merely by role.
 * `allowedOrganisationIds` must come from the existing OA/active-GA organisation list.
 */
export function canOpenOrganisationListingContext(input: {
  requestedOrganisationId: string | null | undefined;
  allowedOrganisationIds: readonly string[];
}): boolean {
  const requested = input.requestedOrganisationId?.trim() || "";
  if (!requested) return false;
  return input.allowedOrganisationIds.includes(requested);
}

export function organisationListingDeniedHref(): string {
  return `/dashboard/list-space?${ORGANISATION_LISTING_DENIED_PARAM}=${ORGANISATION_LISTING_DENIED_VALUE}`;
}

export function listSpaceDeniedMessage(
  denied: string | null | undefined
): string | null {
  if (denied === ORGANISATION_LISTING_DENIED_VALUE) {
    return "You don't have access to list a space for that organisation. Choose a listing context below.";
  }
  return null;
}
