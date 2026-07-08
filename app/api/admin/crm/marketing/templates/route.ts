import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  createMarketingTemplate,
  listMarketingTemplates,
} from "@/lib/crm-marketing/template-mutations";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const templates = await listMarketingTemplates(auth.adminClient);
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load templates." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();
    const template = await createMarketingTemplate(auth.adminClient, body, auth.userId);
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template." },
      { status: 400 }
    );
  }
}
