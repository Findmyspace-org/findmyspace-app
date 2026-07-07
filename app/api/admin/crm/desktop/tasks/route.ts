import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  fetchCrmTasks,
  parseCrmListFilters,
} from "@/lib/crm-desktop/queries";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const filters = parseCrmListFilters(req.nextUrl.searchParams);
    const bucket = req.nextUrl.searchParams.get("bucket") || undefined;
    const ownerId = req.nextUrl.searchParams.get("owner") || undefined;
    const result = await fetchCrmTasks(auth.adminClient, {
      ...filters,
      bucket,
      ownerId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tasks." },
      { status: 500 }
    );
  }
}
