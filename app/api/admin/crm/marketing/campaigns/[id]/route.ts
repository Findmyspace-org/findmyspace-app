import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  getMarketingCampaign,
  saveMarketingCampaignDraft,
  sendMarketingCampaignTestEmail,
} from "@/lib/crm-marketing/campaign-mutations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    const campaign = await getMarketingCampaign(auth.adminClient, id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load campaign." },
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
    if (body.action === "test_send") {
      const result = await sendMarketingCampaignTestEmail(
        auth.adminClient,
        id,
        Array.isArray(body.testEmails) ? body.testEmails : [],
        auth.userId
      );
      return NextResponse.json(result);
    }
    const result = await saveMarketingCampaignDraft(
      auth.adminClient,
      body,
      auth.userId,
      id
    );
    return NextResponse.json({ ok: true, campaign: result.campaign, preview: result.preview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update campaign." },
      { status: 400 }
    );
  }
}
