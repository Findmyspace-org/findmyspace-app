import { NextRequest, NextResponse } from "next/server";
import { resolveRequestHostingContext } from "@/lib/access/hosting-context";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { loadHostFinancePayload } from "@/lib/host-finance-server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const requestedOrganisationId = req.nextUrl.searchParams.get(
    ORGANISATION_QUERY_PARAM
  );
  const { summary, context } = await resolveRequestHostingContext(
    auth.admin,
    auth.userId,
    requestedOrganisationId
  );

  if (!summary.showFinance) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = await loadHostFinancePayload(
      auth.admin,
      auth.userId,
      context,
      { isGlobalAdmin: summary.isGlobalAdmin }
    );
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load finance data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
