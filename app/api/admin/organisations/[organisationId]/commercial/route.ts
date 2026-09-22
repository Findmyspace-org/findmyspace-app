import { NextRequest, NextResponse } from "next/server";
import { requireActivePlatformAdminApi } from "@/lib/access/require-active-platform-admin-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import {
  loadAdminOrganisationBank,
  loadOrganisationCommercialBundle,
} from "@/lib/organisation-commercial-server";
import { isUuid } from "@/lib/access/organisation-access-policy";

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
    const [bundle, bank] = await Promise.all([
      loadOrganisationCommercialBundle(auth.admin, organisationId),
      loadAdminOrganisationBank(auth.admin, organisationId),
    ]);
    return NextResponse.json({ ...bundle, admin_bank: bank });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
