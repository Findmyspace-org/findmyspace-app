import { NextRequest, NextResponse } from "next/server";
import { requireActivePlatformAdminApi } from "@/lib/access/require-active-platform-admin-api";
import { isUuid } from "@/lib/access/organisation-access-policy";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import {
  parseRecordOrganisationPayoutBody,
  payoutHistoryExposesFullAccountNumber,
  stripForbiddenOrganisationPayoutWriteKeys,
} from "@/lib/organisation-payout";
import {
  loadOrganisationPayoutBundle,
  recordOrganisationPayout,
} from "@/lib/organisation-payout-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  if (!isUuid(organisationId)) {
    return NextResponse.json({ error: "Invalid organisation id." }, { status: 400 });
  }

  const auth = await requireActivePlatformAdminApi(req);
  if ("response" in auth) return auth.response;

  try {
    const bundle = await loadOrganisationPayoutBundle(auth.admin, organisationId);
    if (bundle.history.some((row) => payoutHistoryExposesFullAccountNumber(row))) {
      return NextResponse.json(
        { error: "Payout history cannot include full bank account numbers." },
        { status: 500 }
      );
    }
    return NextResponse.json(bundle);
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  if (!isUuid(organisationId)) {
    return NextResponse.json({ error: "Invalid organisation id." }, { status: 400 });
  }

  const auth = await requireActivePlatformAdminApi(req);
  if ("response" in auth) return auth.response;

  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const body = stripForbiddenOrganisationPayoutWriteKeys(raw);
    const parsed = parseRecordOrganisationPayoutBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await recordOrganisationPayout(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      fields: parsed.input,
    });
    return NextResponse.json(result);
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
