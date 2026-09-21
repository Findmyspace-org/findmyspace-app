import { NextRequest, NextResponse } from "next/server";
import { requireOrgPeopleApi } from "@/lib/access/require-org-people-api";
import { revokeOrganisationAccess } from "@/lib/access/organisation-access-server";
import { organisationAccessErrorResponse } from "@/lib/access/organisation-access-http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string; accessId: string }> }
) {
  const { organisationId, accessId } = await params;
  const auth = await requireOrgPeopleApi(req, organisationId);
  if ("response" in auth) return auth.response;

  let body: { reason?: string | null; userId?: string; actorUserId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const grant = await revokeOrganisationAccess(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      actorKind: auth.access.isGlobalAdmin
        ? "global_admin"
        : "organisation_admin",
      accessId,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ grant });
  } catch (error) {
    return organisationAccessErrorResponse(error);
  }
}
