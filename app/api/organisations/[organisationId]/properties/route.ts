import { NextRequest, NextResponse } from "next/server";
import { requireOrgPropertyCreateApi } from "@/lib/access/require-org-property-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import {
  parseOrganisationPropertyWriteBody,
  stripForbiddenOrganisationPropertyWriteKeys,
} from "@/lib/organisation-property";
import {
  createOrganisationProperty,
  listOrganisationProperties,
} from "@/lib/organisation-property-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgPropertyCreateApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const properties = await listOrganisationProperties(
      auth.admin,
      organisationId
    );
    return NextResponse.json({ properties });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgPropertyCreateApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const body = stripForbiddenOrganisationPropertyWriteKeys(raw);
    const parsed = parseOrganisationPropertyWriteBody(body, { requireName: true });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const property = await createOrganisationProperty(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      isGlobalAdmin: auth.access.isGlobalAdmin,
      fields: {
        ...parsed.fields,
        name: parsed.fields.name as string,
      },
    });
    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
