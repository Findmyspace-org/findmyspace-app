import { NextRequest, NextResponse } from "next/server";
import { requireOrgPeopleApi } from "@/lib/access/require-org-people-api";
import { resendOrganisationAccessInvitation } from "@/lib/access/organisation-access-server";
import { organisationAccessErrorResponse } from "@/lib/access/organisation-access-http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string; accessId: string }> }
) {
  const { organisationId, accessId } = await params;
  const auth = await requireOrgPeopleApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const result = await resendOrganisationAccessInvitation(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      actorKind: auth.access.isGlobalAdmin
        ? "global_admin"
        : "organisation_admin",
      accessId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return organisationAccessErrorResponse(error);
  }
}
