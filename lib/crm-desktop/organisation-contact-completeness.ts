import type { CrmOrganisationContactSummary } from "./types";

export type OrganisationContactCompletenessInput = {
  contact_count: number;
  primary_contact_id: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  additional_contacts?: CrmOrganisationContactSummary[];
};

function usableEmail(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function usablePhone(
  phone: string | null | undefined,
  whatsapp?: string | null | undefined
): boolean {
  return Boolean(phone?.trim() || whatsapp?.trim());
}

export function organisationHasContacts(
  input: Pick<OrganisationContactCompletenessInput, "contact_count">
): boolean {
  return (input.contact_count ?? 0) > 0;
}

export function organisationHasAnyEmail(
  input: OrganisationContactCompletenessInput
): boolean {
  if (!organisationHasContacts(input)) return false;
  if (usableEmail(input.primary_contact_email)) return true;
  return (input.additional_contacts ?? []).some((contact) =>
    usableEmail(contact.email)
  );
}

export function organisationHasAnyPhone(
  input: OrganisationContactCompletenessInput
): boolean {
  if (!organisationHasContacts(input)) return false;
  if (usablePhone(input.primary_contact_phone)) return true;
  return (input.additional_contacts ?? []).some((contact) =>
    usablePhone(contact.phone)
  );
}

export function resolveNoEmailOrganisationIds(
  allOrgIds: Iterable<string>,
  contacts: Array<{ organisation_id: string; email: string | null }>
): Set<string> {
  const all = new Set(allOrgIds);
  const withEmail = new Set<string>();
  const withContacts = new Set<string>();
  for (const contact of contacts) {
    withContacts.add(contact.organisation_id);
    if (usableEmail(contact.email)) withEmail.add(contact.organisation_id);
  }
  return new Set(
    [...all].filter((id) => !withContacts.has(id) || !withEmail.has(id))
  );
}

export function resolveNoPhoneOrganisationIds(
  allOrgIds: Iterable<string>,
  contacts: Array<{
    organisation_id: string;
    phone: string | null;
    whatsapp: string | null;
  }>
): Set<string> {
  const all = new Set(allOrgIds);
  const withPhone = new Set<string>();
  const withContacts = new Set<string>();
  for (const contact of contacts) {
    withContacts.add(contact.organisation_id);
    if (usablePhone(contact.phone, contact.whatsapp)) {
      withPhone.add(contact.organisation_id);
    }
  }
  return new Set(
    [...all].filter((id) => !withContacts.has(id) || !withPhone.has(id))
  );
}
