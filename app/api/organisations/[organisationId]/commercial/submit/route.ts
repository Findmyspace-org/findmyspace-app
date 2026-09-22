import { NextRequest, NextResponse } from "next/server";
import { requireOrgCommercialApi } from "@/lib/access/require-org-commercial-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import { submitOrganisationVerification } from "@/lib/organisation-commercial-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const { data: organisation } = await auth.admin
      .from("organisations")
      .select("name")
      .eq("id", organisationId)
      .maybeSingle();
    const commercial = await submitOrganisationVerification(auth.admin, {
      organisationId,
      organisationName:
        (organisation as { name?: string } | null)?.name || "Organisation",
      actorUserId: auth.userId,
      isGlobalAdmin: auth.access.isGlobalAdmin,
    });
    return NextResponse.json({ commercial });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
