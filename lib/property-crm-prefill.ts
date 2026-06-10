import type { AdminLocationValue } from "@/app/components/AdminLocationSection";
import type { CrmOrganisationOption } from "@/app/components/AdminCrmOrganisationPicker";

/** Apply CRM organisation details to blank property fields only. */
export function applyCrmOrgToPropertyFields(
  org: CrmOrganisationOption,
  current: {
    name: string;
    location: AdminLocationValue;
  }
): { name?: string; location?: Partial<AdminLocationValue> } {
  const patch: { name?: string; location?: Partial<AdminLocationValue> } = {};

  if (!current.name.trim()) {
    patch.name = org.name;
  }

  const locationPatch: Partial<AdminLocationValue> = {};
  if (!current.location.streetAddress.trim() && org.address?.trim()) {
    locationPatch.streetAddress = org.address.trim();
  }

  if (Object.keys(locationPatch).length > 0) {
    patch.location = locationPatch;
  }

  return patch;
}
