import { NextRequest, NextResponse } from "next/server";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";
import { fetchCrmEmailDetail } from "@/lib/space-place/crm-email-detail";
import { applyEmailLinkAction } from "@/lib/space-place/crm-email-link";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await fetchCrmEmailDetail(auth.adminClient, id);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, email: result.email });
}

type PatchBody = {
  action?: "link" | "relink" | "unlink";
  contactId?: string | null;
  organisationId?: string | null;
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action || "link";
  if (!["link", "relink", "unlink"].includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const result = await applyEmailLinkAction(auth.adminClient, {
    emailId: id,
    action,
    contactId: body.contactId,
    organisationId: body.organisationId,
    actorId: auth.userId,
    source: "crm_desktop",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const detail = await fetchCrmEmailDetail(auth.adminClient, id);
  return NextResponse.json({
    ok: true,
    email: result.email,
    detail: detail.ok ? detail.email : null,
  });
}
