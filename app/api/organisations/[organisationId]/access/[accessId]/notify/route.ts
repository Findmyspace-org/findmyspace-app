import { NextRequest, NextResponse } from "next/server";
import { requireOrgPeopleApi } from "@/lib/access/require-org-people-api";
import { setOrganisationAccessNotifyPreference } from "@/lib/access/organisation-access-server";
import { organisationAccessErrorResponse } from "@/lib/access/organisation-access-http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string; accessId: string }> }
) {
  const { organisationId, accessId } = await params;
  const auth = await requireOrgPeopleApi(req, organisationId);
  if ("response" in auth) return auth.response;

  let body: {
    notifyAllBookings?: boolean;
    userId?: string;
    actorUserId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const grant = await setOrganisationAccessNotifyPreference(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      actorKind: auth.access.isGlobalAdmin
        ? "global_admin"
        : "organisation_admin",
      accessId,
      notifyAllBookings: Boolean(body.notifyAllBookings),
    });
    return NextResponse.json({ grant });
  } catch (error) {
    return organisationAccessErrorResponse(error);
  }
}
