import { NextRequest, NextResponse } from "next/server";
import { linkEmailToContact } from "@/lib/space-place/email-import-server";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";

export const runtime = "nodejs";

type LinkBody = { contactId?: string };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  let body: LinkBody;
  try {
    body = (await req.json()) as LinkBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const contactId = body.contactId?.trim();
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required." }, { status: 400 });
  }

  const result = await linkEmailToContact(
    auth.adminClient,
    id,
    contactId,
    auth.userId
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
