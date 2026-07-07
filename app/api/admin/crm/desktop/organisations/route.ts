import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  fetchCrmOrganisations,
  parseCrmListFilters,
} from "@/lib/crm-desktop/queries";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const filters = parseCrmListFilters(req.nextUrl.searchParams);
    if (req.nextUrl.searchParams.get("board") === "1") {
      filters.boardMode = true;
      filters.pageSize = Math.min(
        150,
        filters.pageSize && filters.pageSize > 25 ? filters.pageSize : 100,
      );
    }
    const result = await fetchCrmOrganisations(auth.adminClient, filters);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load organisations.",
      },
      { status: 500 }
    );
  }
}
