import { ownerApiFetch } from "@/lib/owner-api-client";
import type { OrganisationCommercialBundle } from "@/lib/organisation-commercial-dto";

export async function fetchOrganisationCommercial(organisationId: string) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/commercial`
  ) as Promise<OrganisationCommercialBundle>;
}

export async function patchOrganisationCommercial(
  organisationId: string,
  body: Record<string, unknown>
) {
  return ownerApiFetch(`/api/organisations/${organisationId}/commercial`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function submitOrganisationVerificationRequest(
  organisationId: string
) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/commercial/submit`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function uploadOrganisationDocumentRequest(
  organisationId: string,
  form: FormData
) {
  return ownerApiFetch(`/api/organisations/${organisationId}/documents`, {
    method: "POST",
    body: form,
  });
}

export async function submitOrganisationBankRequest(
  organisationId: string,
  form: FormData
) {
  return ownerApiFetch(`/api/organisations/${organisationId}/bank`, {
    method: "POST",
    body: form,
  });
}

export async function createOrganisationRequest(body: {
  name: string;
  organisation_type?: string | null;
  registration_number?: string | null;
}) {
  return ownerApiFetch("/api/organisations", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<{ organisation: { id: string; name: string; slug: string } }>;
}

export async function createOrganisationListingRequest(
  organisationId: string,
  payload: Record<string, unknown>
) {
  return ownerApiFetch(`/api/organisations/${organisationId}/listings`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{ listing: { id: string; propertyId: string } }>;
}
