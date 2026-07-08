import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  archiveMarketingTemplate,
  duplicateMarketingTemplate,
  getMarketingTemplate,
  updateMarketingTemplate,
} from "@/lib/crm-marketing/template-mutations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    const template = await getMarketingTemplate(auth.adminClient, id);
    if (!template) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load template." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    const body = await req.json();
    if (body.action === "duplicate") {
      const template = await duplicateMarketingTemplate(auth.adminClient, id, auth.userId);
      return NextResponse.json({ ok: true, template });
    }
    if (body.action === "archive") {
      const template = await archiveMarketingTemplate(auth.adminClient, id, auth.userId);
      return NextResponse.json({ ok: true, template });
    }
    const template = await updateMarketingTemplate(auth.adminClient, id, body, auth.userId);
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update template." },
      { status: 400 }
    );
  }
}
