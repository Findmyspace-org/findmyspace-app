import { NextRequest, NextResponse } from "next/server";
import { requireActivePlatformAdminApi } from "@/lib/access/require-active-platform-admin-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import { decideOrganisationBankVerification } from "@/lib/organisation-commercial-server";
import { isUuid } from "@/lib/access/organisation-access-policy";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  if (!isUuid(organisationId)) {
    return NextResponse.json({ error: "Invalid organisation id." }, { status: 400 });
  }

  const auth = await requireActivePlatformAdminApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const decision = body.decision === "reject" ? "reject" : body.decision === "verify" ? "verify" : null;
    if (!decision) {
      return NextResponse.json({ error: "Decision must be verify or reject." }, { status: 400 });
    }

    const { data: organisation } = await auth.admin
      .from("organisations")
      .select("id, name")
      .eq("id", organisationId)
      .maybeSingle();
    if (!organisation) {
      return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
    }

    const bank = await decideOrganisationBankVerification(auth.admin, {
      organisationId,
      organisationName: (organisation as { name: string }).name,
      actorUserId: auth.userId,
      decision,
      reason: typeof body.reason === "string" ? body.reason : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return NextResponse.json({ bank });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
