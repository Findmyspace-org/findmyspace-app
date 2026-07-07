import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { fetchOrgMarketingSummary } from "@/lib/crm-marketing/queries";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const organisationId = req.nextUrl.searchParams.get("organisationId");
  if (!organisationId) {
    return NextResponse.json({ error: "organisationId required" }, { status: 400 });
  }

  try {
    const summary = await fetchOrgMarketingSummary(auth.adminClient, organisationId);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load summary." },
      { status: 500 }
    );
  }
}
