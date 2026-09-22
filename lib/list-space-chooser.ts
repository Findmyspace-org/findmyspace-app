export type ListSpaceOrganisationOption = {
  id: string;
  name: string;
};

export type ListSpaceChooserInput = {
  organisations: ListSpaceOrganisationOption[];
};

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

export function organisationListingHref(organisationId: string): string {
  return `/dashboard/new-space?organisation=${encodeURIComponent(organisationId)}`;
}

export function personalListingHref(isHost: boolean): string {
  return isHost ? "/dashboard/new-space" : "/dashboard/become-host";
}
