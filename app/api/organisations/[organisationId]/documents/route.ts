import { NextRequest, NextResponse } from "next/server";
import { requireOrgCommercialApi } from "@/lib/access/require-org-commercial-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import {
  addOrganisationVerificationDocument,
  loadOrganisationCommercialBundle,
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
    return NextResponse.json({ documents: bundle.documents });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A document file is required." }, { status: 400 });
    }
    const document = await addOrganisationVerificationDocument(auth.admin, {
      organisationId,
      actorUserId: auth.userId,
      isGlobalAdmin: auth.access.isGlobalAdmin,
      kind: String(form.get("document_kind") || "other"),
      label: form.get("label") ? String(form.get("label")) : null,
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        buffer: Buffer.from(await file.arrayBuffer()),
      },
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
