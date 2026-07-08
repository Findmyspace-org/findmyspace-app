import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  getMarketingCampaign,
  listMarketingCampaigns,
  saveMarketingCampaignDraft,
} from "@/lib/crm-marketing/campaign-mutations";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const campaigns = await listMarketingCampaigns(auth.adminClient);
    return NextResponse.json({ ok: true, campaigns });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load campaigns." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();
    const result = await saveMarketingCampaignDraft(auth.adminClient, body, auth.userId);
    return NextResponse.json({ ok: true, campaignId: result.campaign.id, campaign: result.campaign, preview: result.preview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save campaign draft." },
      { status: 400 }
    );
  }
}
