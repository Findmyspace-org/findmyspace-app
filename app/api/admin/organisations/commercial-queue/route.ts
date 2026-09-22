import { NextRequest, NextResponse } from "next/server";
import { requireActivePlatformAdminApi } from "@/lib/access/require-active-platform-admin-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import { loadOrganisationCommercialBundle } from "@/lib/organisation-commercial-server";

export async function GET(req: NextRequest) {
  const auth = await requireActivePlatformAdminApi(req);
  if ("response" in auth) return auth.response;

  try {
    const { data: profiles, error } = await auth.admin
      .from("organisation_commercial_profiles")
      .select("organisation_id, legal_name, verification_status, submitted_at, rejection_reason")
      .order("submitted_at", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: banks } = await auth.admin
      .from("organisation_bank_accounts")
      .select("organisation_id, status, submitted_at, account_number_last4")
      .eq("is_current", true);

    const bankByOrg = new Map(
      ((banks || []) as Array<{
        organisation_id: string;
        status: string;
        submitted_at: string;
        account_number_last4: string;
      }>).map((row) => [row.organisation_id, row])
    );

    const { data: organisations } = await auth.admin
      .from("organisations")
      .select("id, name, status");
    const orgById = new Map(
      ((organisations || []) as Array<{ id: string; name: string; status: string }>).map(
        (row) => [row.id, row]
      )
    );

    const items = ((profiles || []) as Array<{
      organisation_id: string;
      legal_name: string;
      verification_status: string;
      submitted_at: string | null;
      rejection_reason: string | null;
    }>).map((profile) => {
      const organisation = orgById.get(profile.organisation_id);
      const bank = bankByOrg.get(profile.organisation_id);
      return {
        organisation_id: profile.organisation_id,
        organisation_name: organisation?.name || profile.legal_name,
        organisation_status: organisation?.status || null,
        verification_status: profile.verification_status,
        submitted_at: profile.submitted_at,
        rejection_reason: profile.rejection_reason,
        bank_status: bank?.status ?? "not_submitted",
        bank_submitted_at: bank?.submitted_at ?? null,
        bank_last4: bank?.account_number_last4 ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
