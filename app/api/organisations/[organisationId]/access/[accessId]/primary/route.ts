import { NextRequest, NextResponse } from "next/server";
import { requireOrgPeopleApi } from "@/lib/access/require-org-people-api";
import { setOrganisationAccessPrimary } from "@/lib/access/organisation-access-server";
import { organisationAccessErrorResponse } from "@/lib/access/organisation-access-http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string; accessId: string }> }
) {
  const { organisationId, accessId } = await params;
  const auth = await requireOrgPeopleApi(req, organisationId);
  if ("response" in auth) return auth.response;

  let body: { isPrimary?: boolean; userId?: string; actorUserId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const result = await setOrganisationAccessPrimary(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      actorKind: auth.access.isGlobalAdmin
        ? "global_admin"
        : "organisation_admin",
      accessId,
      isPrimary: Boolean(body.isPrimary),
    });
    return NextResponse.json(result);
  } catch (error) {
    return organisationAccessErrorResponse(error);
  }
}
