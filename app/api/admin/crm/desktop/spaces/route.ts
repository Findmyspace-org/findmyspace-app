import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  fetchCrmSpaces,
  parseCrmListFilters,
} from "@/lib/crm-desktop/queries";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const filters = parseCrmListFilters(req.nextUrl.searchParams);
    const result = await fetchCrmSpaces(auth.adminClient, filters);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load spaces." },
      { status: 500 }
    );
  }
}
