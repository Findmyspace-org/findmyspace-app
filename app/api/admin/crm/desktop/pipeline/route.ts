import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  fetchCrmPipeline,
  fetchCrmPipelineStageCounts,
  parseCrmListFilters,
} from "@/lib/crm-desktop/queries";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const filters = parseCrmListFilters(req.nextUrl.searchParams);
    const countsOnly = req.nextUrl.searchParams.get("counts") === "1";

    if (countsOnly) {
      const stageCounts = await fetchCrmPipelineStageCounts(
        auth.adminClient,
        filters,
      );
      return NextResponse.json({ ok: true, stageCounts });
    }

    if (req.nextUrl.searchParams.get("board") === "1") {
      filters.boardMode = true;
      filters.pageSize = Math.min(
        150,
        filters.pageSize && filters.pageSize > 25 ? filters.pageSize : 100,
      );
    }

    const result = await fetchCrmPipeline(auth.adminClient, filters);
    const stageCounts =
      req.nextUrl.searchParams.get("board") === "1"
        ? await fetchCrmPipelineStageCounts(auth.adminClient, filters)
        : undefined;

    return NextResponse.json({ ok: true, ...result, stageCounts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load pipeline." },
      { status: 500 }
    );
  }
}
