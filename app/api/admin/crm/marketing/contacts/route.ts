import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { fetchMarketingContactRows } from "@/lib/crm-marketing/queries";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  const page = Number(sp.get("page") || "1") || 1;
  const pageSize = Number(sp.get("pageSize") || "25") || 25;

  try {
    const result = await fetchMarketingContactRows(
      auth.adminClient,
      {
        q: sp.get("q") || undefined,
        status: sp.get("status") || undefined,
        consent: sp.get("consent") || undefined,
        basis: sp.get("basis") || undefined,
        org: sp.get("org") || undefined,
        sendable: sp.get("sendable") || undefined,
      },
      page,
      pageSize
    );
    return NextResponse.json({ ok: true, ...result, page, pageSize });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load contacts." },
      { status: 500 }
    );
  }
}
