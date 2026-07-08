import { NextRequest, NextResponse } from "next/server";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";
import { applyEmailLinkAction } from "@/lib/space-place/crm-email-link";

export const runtime = "nodejs";

type LinkBody = {
  contactId?: string;
  organisationId?: string;
  action?: "link" | "relink";
};

/**
 * Legacy POST link endpoint (contact-required).
 * Prefer PATCH /api/space-place/email-messages/[id] for desktop flows.
 */
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
  if (!contactId && !body.organisationId?.trim()) {
    return NextResponse.json(
      { error: "contactId or organisationId is required." },
      { status: 400 }
    );
  }

  const result = await applyEmailLinkAction(auth.adminClient, {
    emailId: id,
    action: body.action === "relink" ? "relink" : "link",
    contactId: contactId || null,
    organisationId: body.organisationId?.trim() || null,
    actorId: auth.userId,
    source: "legacy_link_endpoint",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email: result.email });
}
