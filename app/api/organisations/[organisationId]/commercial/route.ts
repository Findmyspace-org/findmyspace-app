import { NextRequest, NextResponse } from "next/server";
import { requireOrgCommercialApi } from "@/lib/access/require-org-commercial-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import {
  loadOrganisationCommercialBundle,
  updateOrganisationCommercialProfile,
} from "@/lib/organisation-commercial-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const bundle = await loadOrganisationCommercialBundle(auth.admin, organisationId);
    return NextResponse.json(bundle);
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const commercial = await updateOrganisationCommercialProfile(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      isGlobalAdmin: auth.access.isGlobalAdmin,
      body,
    });
    return NextResponse.json({ commercial });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
