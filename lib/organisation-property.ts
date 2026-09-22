import { parsePropertyInput } from "@/lib/admin-property";
import type { HostingContextKind } from "@/lib/access/hosting-context";
import type { ResolvedAccess } from "@/lib/access/roles";

export const ORGANISATION_PROPERTY_AUDIT = {
  created: "organisation.property.created",
  updated: "organisation.property.updated",
} as const;

export type OrganisationPropertyFields = {
  name: string;
  description: string | null;
  address_line1: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

const PROPERTY_FIELD_KEYS = [
  "name",
  "description",
  "address_line1",
  "suburb",
  "city",
  "province",
  "postal_code",
  "country",
  "latitude",
  "longitude",
] as const;

const FORBIDDEN_WRITE_KEYS = [
  "owner_id",
  "organisation_id",
  "created_by_admin",
  "created_by_admin_id",
  "owner_email",
  "crm_organisation_id",
  "id",
  "user_id",
  "actor_id",
] as const;

export function canCreateOrganisationProperty(access: Pick<
  ResolvedAccess,
  "canManagePeopleAccess"
>): boolean {
  return access.canManagePeopleAccess;
}

export function canShowOrganisationAddProperty(input: {
  contextKind: HostingContextKind;
  showOrganisationCommercial: boolean;
}): boolean {
  return (
    input.contextKind === "organisation" && input.showOrganisationCommercial
  );
}

export function normalizeOrganisationPropertyName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function organisationPropertyNamesClash(
  candidate: string,
  existingNames: string[]
): boolean {
  const normalized = normalizeOrganisationPropertyName(candidate);
  if (!normalized) return false;
  return existingNames.some(
    (name) => normalizeOrganisationPropertyName(name) === normalized
  );
}

export type OrganisationListingPropertyChoice =
  | { kind: "use"; propertyId: string }
  | { kind: "create_first" }
  | { kind: "required" }
  | { kind: "invalid" };

export function resolveOrganisationListingPropertyChoice(input: {
  organisationPropertyIds: string[];
  requestedPropertyId?: string | null;
}): OrganisationListingPropertyChoice {
  const requested = input.requestedPropertyId?.trim() || "";
  if (requested) {
    if (input.organisationPropertyIds.includes(requested)) {
      return { kind: "use", propertyId: requested };
    }
    return { kind: "invalid" };
  }
  if (input.organisationPropertyIds.length === 0) {
    return { kind: "create_first" };
  }
  if (input.organisationPropertyIds.length === 1) {
    return { kind: "use", propertyId: input.organisationPropertyIds[0] };
  }
  return { kind: "required" };
}

export function parseOrganisationPropertyWriteBody(
  body: Record<string, unknown>,
  options: { requireName?: boolean } = {}
):
  | { ok: true; fields: Partial<OrganisationPropertyFields> & { name?: string } }
  | { ok: false; error: string } {
  const parsed = parsePropertyInput(body, { requireName: options.requireName });
  if (!parsed.ok) return parsed;

  const fields: Partial<OrganisationPropertyFields> & { name?: string } = {};
  for (const key of PROPERTY_FIELD_KEYS) {
    if (key in parsed.data && parsed.data[key] !== undefined) {
      (fields as Record<string, unknown>)[key] = parsed.data[key];
    }
  }

  if (options.requireName && !fields.name?.trim()) {
    return { ok: false, error: "Property name is required." };
  }

  return { ok: true, fields };
}

export function organisationPropertyInsertRow(
  organisationId: string,
  fields: Partial<OrganisationPropertyFields> & { name: string }
): Record<string, unknown> {
  return {
    name: fields.name.trim().replace(/\s+/g, " "),
    description: fields.description ?? null,
    address_line1: fields.address_line1 ?? null,
    suburb: fields.suburb ?? null,
    city: fields.city ?? null,
    province: fields.province ?? null,
    postal_code: fields.postal_code ?? null,
    country: fields.country ?? "South Africa",
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    organisation_id: organisationId,
    owner_id: null,
    created_by_admin: false,
  };
}

export function organisationPropertyPatchRow(
  fields: Partial<OrganisationPropertyFields>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of PROPERTY_FIELD_KEYS) {
    if (key === "name") {
      if (typeof fields.name === "string") {
        patch.name = fields.name.trim().replace(/\s+/g, " ");
      }
      continue;
    }
    if (fields[key] !== undefined) patch[key] = fields[key];
  }
  return patch;
}

export function hasForbiddenOrganisationPropertyWriteKeys(
  body: Record<string, unknown>
): boolean {
  return FORBIDDEN_WRITE_KEYS.some((key) => key in body);
}

export function stripForbiddenOrganisationPropertyWriteKeys(
  body: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...body };
  for (const key of FORBIDDEN_WRITE_KEYS) {
    delete next[key];
  }
  return next;
}
