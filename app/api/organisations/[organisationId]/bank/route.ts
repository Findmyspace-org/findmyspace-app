import { NextRequest, NextResponse } from "next/server";
import { requireOrgCommercialApi } from "@/lib/access/require-org-commercial-api";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import {
  loadMaskedOrganisationBank,
  submitOrganisationBankAccount,
} from "@/lib/organisation-commercial-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const { organisationId } = await params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const bank = await loadMaskedOrganisationBank(auth.admin, organisationId);
    return NextResponse.json({ bank });
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
    const proof = form.get("proof");
    if (!(proof instanceof File)) {
      return NextResponse.json(
        { error: "Proof of bank is required before banking can be submitted for verification." },
        { status: 400 }
      );
    }

    const { data: organisation } = await auth.admin
      .from("organisations")
      .select("name")
      .eq("id", organisationId)
      .maybeSingle();

    const bank = await submitOrganisationBankAccount(auth.admin, {
      organisationId,
      organisationName:
        (organisation as { name?: string } | null)?.name || "Organisation",
      actorUserId: auth.userId,
      isGlobalAdmin: auth.access.isGlobalAdmin,
      accountHolderName: String(form.get("account_holder_name") || ""),
      bankName: String(form.get("bank_name") || ""),
      accountType: String(form.get("account_type") || ""),
      branchCode: String(form.get("branch_code") || ""),
      accountNumber: String(form.get("account_number") || ""),
      proofFile: {
        name: proof.name,
        type: proof.type,
        size: proof.size,
        buffer: Buffer.from(await proof.arrayBuffer()),
      },
    });
    return NextResponse.json({ bank });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
