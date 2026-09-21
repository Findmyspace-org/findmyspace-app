import { ownerApiFetch } from "@/lib/owner-api-client";
import type { PublicAccessGrantView } from "@/lib/access/organisation-access-policy";

export async function fetchManageableOrganisations() {
  return ownerApiFetch("/api/organisations") as Promise<{
    organisations: Array<{ id: string; name: string; status: string }>;
  }>;
}

export async function fetchOrganisationAccess(organisationId: string) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/access`
  ) as Promise<{
    organisation: { id: string; name: string; status: string };
    grants: PublicAccessGrantView[];
    properties: Array<{ id: string; name: string }>;
    spaces: Array<{ id: string; title: string | null; propertyId: string }>;
  }>;
}

export async function grantOrganisationAccessRequest(
  organisationId: string,
  body: {
    email: string;
    role: string;
    propertyId?: string | null;
    spaceId?: string | null;
    isPrimary?: boolean;
    notifyAllBookings?: boolean;
  }
) {
  return ownerApiFetch(`/api/organisations/${organisationId}/access`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<{
    grant: PublicAccessGrantView;
    invitationCreated: boolean;
    invitationSent: boolean;
  }>;
}

export async function revokeOrganisationAccessRequest(
  organisationId: string,
  accessId: string,
  reason?: string
) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/access/${accessId}/revoke`,
    {
      method: "POST",
      body: JSON.stringify({ reason: reason || null }),
    }
  ) as Promise<{ grant: PublicAccessGrantView }>;
}

export async function setPrimarySpaceManagerRequest(
  organisationId: string,
  accessId: string,
  isPrimary: boolean
) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/access/${accessId}/primary`,
    {
      method: "POST",
      body: JSON.stringify({ isPrimary }),
    }
  ) as Promise<{
    previousPrimaryId: string | null;
    grant: PublicAccessGrantView;
  }>;
}

export async function setNotifyAllBookingsRequest(
  organisationId: string,
  accessId: string,
  notifyAllBookings: boolean
) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/access/${accessId}/notify`,
    {
      method: "POST",
      body: JSON.stringify({ notifyAllBookings }),
    }
  ) as Promise<{ grant: PublicAccessGrantView }>;
}

export async function reassignOrganisationAccessRequest(
  organisationId: string,
  accessId: string,
  body: { propertyId?: string | null; spaceId?: string | null }
) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/access/${accessId}/reassign`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  ) as Promise<{ grant: PublicAccessGrantView }>;
}

export async function resendOrganisationAccessInvitationRequest(
  organisationId: string,
  accessId: string
) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/access/${accessId}/resend-invite`,
    {
      method: "POST",
      body: "{}",
    }
  ) as Promise<{ grant: PublicAccessGrantView; invitationSent: boolean }>;
}

