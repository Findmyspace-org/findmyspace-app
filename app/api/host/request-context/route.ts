import { NextRequest, NextResponse } from "next/server";
import { resolveRequestHostingContext } from "@/lib/access/hosting-context";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { loadHostRequestContext } from "@/lib/host-request-context-server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  let body: { bookingIds?: unknown };
  try {
    body = (await req.json()) as { bookingIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const bookingIds = Array.isArray(body.bookingIds)
    ? body.bookingIds.filter((id): id is string => typeof id === "string")
    : [];

  const requestedOrganisationId = req.nextUrl.searchParams.get(
    ORGANISATION_QUERY_PARAM
  );
  const { summary, context } = await resolveRequestHostingContext(
    auth.admin,
    auth.userId,
    requestedOrganisationId
  );

  try {
    const payload = await loadHostRequestContext(
      auth.admin,
      auth.userId,
      context,
      bookingIds,
      { isGlobalAdmin: summary.isGlobalAdmin }
    );
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load request details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
