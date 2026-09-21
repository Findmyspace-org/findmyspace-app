import { NextRequest, NextResponse } from "next/server";
import { requireOrgPeopleApi } from "@/lib/access/require-org-people-api";
import {
  grantOrganisationAccess,
  listOrganisationAccess,
} from "@/lib/access/organisation-access-server";
import { organisationAccessErrorResponse } from "@/lib/access/organisation-access-http";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgPeopleApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const payload = await listOrganisationAccess(auth.admin, organisationId);
    return NextResponse.json(payload);
  } catch (error) {
    return organisationAccessErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgPeopleApi(req, organisationId);
  if ("response" in auth) return auth.response;

  let body: {
    email?: string;
    role?: string;
    propertyId?: string | null;
    spaceId?: string | null;
    isPrimary?: boolean;
    notifyAllBookings?: boolean;
    userId?: string;
    actorUserId?: string;
    organisationId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const result = await grantOrganisationAccess(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      actorKind: auth.access.isGlobalAdmin
        ? "global_admin"
        : "organisation_admin",
      grant: {
        email: body.email ?? "",
        role: body.role ?? "",
        propertyId: body.propertyId ?? null,
        spaceId: body.spaceId ?? null,
        isPrimary: Boolean(body.isPrimary),
        notifyAllBookings: Boolean(body.notifyAllBookings),
      },
    });
    return NextResponse.json(
      {
        grant: result.grant,
        invitationCreated: result.invitationCreated,
        invitationSent: result.invitationSent,
      },
      { status: 201 }
    );
  } catch (error) {
    return organisationAccessErrorResponse(error);
  }
}
