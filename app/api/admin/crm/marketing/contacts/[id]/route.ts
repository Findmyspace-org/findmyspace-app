import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { fetchMarketingContactDetail } from "@/lib/crm-marketing/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  try {
    const contact = await fetchMarketingContactDetail(auth.adminClient, id);
    if (!contact) {
      return NextResponse.json({ error: "Marketing contact not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, contact });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load contact." },
      { status: 500 }
    );
  }
}
