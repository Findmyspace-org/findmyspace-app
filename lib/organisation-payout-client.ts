import { adminApiFetch } from "@/lib/admin-api-client";
import { ownerApiFetch } from "@/lib/owner-api-client";
import type {
  OrganisationPayoutBundle,
  OrganisationPayoutHistoryRow,
} from "@/lib/organisation-payout";

export async function fetchOrganisationPayouts(organisationId: string) {
  return ownerApiFetch(
    `/api/organisations/${organisationId}/payouts`
  ) as Promise<Omit<OrganisationPayoutBundle, "can_record">>;
}

export async function fetchAdminOrganisationPayouts(organisationId: string) {
  return adminApiFetch(
    `/api/admin/organisations/${organisationId}/payouts`
  ) as Promise<OrganisationPayoutBundle>;
}

export async function recordAdminOrganisationPayout(
  organisationId: string,
  body: {
    booking_ids: string[];
    reference: string;
    paid_at?: string | null;
    notes?: string | null;
  }
) {
  return adminApiFetch(`/api/admin/organisations/${organisationId}/payouts`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<{
    payout: OrganisationPayoutHistoryRow;
    totals: { gross: number; fee: number; net: number };
  }>;
}
