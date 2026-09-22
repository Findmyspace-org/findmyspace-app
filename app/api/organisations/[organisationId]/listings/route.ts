import { NextRequest, NextResponse } from "next/server";
import { requireOrgCommercialApi } from "@/lib/access/require-org-commercial-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import { createOrganisationListing } from "@/lib/organisation-commercial-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const propertyId =
      typeof body.property_id === "string" ? body.property_id : null;
    const { owner_id: _ignoredOwner, organisation_id: _ignoredOrg, ...payload } =
      body;
    const listing = await createOrganisationListing(auth.admin, {
      organisationId,
      propertyId,
      payload,
    });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
