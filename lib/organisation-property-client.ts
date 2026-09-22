import { ownerApiFetch } from "@/lib/owner-api-client";

export async function listOrganisationPropertiesRequest(organisationId: string) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/properties`
  ) as Promise<{ properties: Array<{ id: string; name: string }> }>;
}

export async function createOrganisationPropertyRequest(
  organisationId: string,
  body: Record<string, unknown>
) {
  return ownerApiFetch(`/api/organisations/${organisationId}/properties`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<{
    property: {
      id: string;
      name: string;
      organisation_id: string;
      owner_id: null;
    };
  }>;
}

export async function patchOwnerPropertyRequest(
  path: string,
  body: Record<string, unknown>
) {
  return ownerApiFetch(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  }) as Promise<{
    property: {
      id: string;
      organisation_id: string | null;
      owner_id: string | null;
    };
  }>;
}
