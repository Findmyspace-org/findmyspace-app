import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { resolveRequestHostingContext } from "@/lib/access/hosting-context";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { loadHostingOrganisationNames } from "@/lib/access/load-hosting-access";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const requestedOrganisationId = req.nextUrl.searchParams.get(
    ORGANISATION_QUERY_PARAM
  );
  const { summary } = await resolveRequestHostingContext(
    auth.admin,
    auth.userId,
    requestedOrganisationId
  );
  let organisations: Array<{ id: string; name: string }> = [];
  try {
    organisations = await loadHostingOrganisationNames(
      auth.admin,
      summary.organisationIds
    );
  } catch {
    organisations = [];
  }
  return NextResponse.json({ summary, organisations });
}
