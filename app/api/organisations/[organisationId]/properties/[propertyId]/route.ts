import { NextRequest, NextResponse } from "next/server";
import { requireOrgPropertyCreateApi } from "@/lib/access/require-org-property-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import { isUuid } from "@/lib/access/organisation-access-policy";
import {
  parseOrganisationPropertyWriteBody,
  stripForbiddenOrganisationPropertyWriteKeys,
} from "@/lib/organisation-property";
import { updateOrganisationProperty } from "@/lib/organisation-property-server";

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ organisationId: string; propertyId: string }> }
) {
  const { organisationId, propertyId } = await params;
  if (!isUuid(propertyId)) {
    return NextResponse.json({ error: "Invalid property id." }, { status: 400 });
  }

  const auth = await requireOrgPropertyCreateApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const body = stripForbiddenOrganisationPropertyWriteKeys(raw);
    const parsed = parseOrganisationPropertyWriteBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const property = await updateOrganisationProperty(auth.admin, {
      organisationId,
      propertyId,
      actorUserId: auth.userId,
      isGlobalAdmin: auth.access.isGlobalAdmin,
      fields: parsed.fields,
    });
    return NextResponse.json({ property });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
