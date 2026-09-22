import { NextRequest, NextResponse } from "next/server";
import { requireOrgCommercialApi } from "@/lib/access/require-org-commercial-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import { payoutHistoryExposesFullAccountNumber } from "@/lib/organisation-payout";
import { loadOrganisationPayoutBundle } from "@/lib/organisation-payout-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const bundle = await loadOrganisationPayoutBundle(auth.admin, organisationId);
    if (bundle.history.some((row) => payoutHistoryExposesFullAccountNumber(row))) {
      return NextResponse.json(
        { error: "Payout history cannot include full bank account numbers." },
        { status: 500 }
      );
    }
    return NextResponse.json({
      organisation: bundle.organisation,
      payout_readiness: bundle.payout_readiness,
      current_bank: bundle.current_bank,
      eligible: bundle.eligible,
      history: bundle.history,
      totals: bundle.totals,
    });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
