import { NextRequest, NextResponse } from "next/server";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";
import { rematchEmailMessage } from "@/lib/space-place/crm-email-rematch";
import { fetchCrmEmailDetail } from "@/lib/space-place/crm-email-detail";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await rematchEmailMessage(auth.adminClient, {
    emailId: id,
    actorId: auth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const detail = await fetchCrmEmailDetail(auth.adminClient, id);
  return NextResponse.json({
    ok: true,
    changed: result.changed,
    matchStatus: result.matchStatus,
    explanation: result.explanation,
    email: result.email,
    matchedContacts: result.matchedContacts,
    detail: detail.ok ? detail.email : null,
  });
}
