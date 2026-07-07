import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { reorderPipelineCard } from "@/lib/crm-desktop/pipeline-reorder";
import type { PipelineStage } from "@/lib/space-place/constants";
import { getPipelineBoardSortMode } from "@/lib/crm-desktop/pipeline-ordering";

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as {
      organisationId?: string;
      pipelineStage?: PipelineStage;
      beforeOrganisationId?: string | null;
      afterOrganisationId?: string | null;
      sortMode?: string;
    };

    if (!body.organisationId || !body.pipelineStage) {
      return NextResponse.json(
        { error: "organisationId and pipelineStage are required." },
        { status: 400 }
      );
    }

    const result = await reorderPipelineCard(auth.adminClient, {
      organisationId: body.organisationId,
      pipelineStage: body.pipelineStage,
      beforeOrganisationId: body.beforeOrganisationId,
      afterOrganisationId: body.afterOrganisationId,
      profileId: auth.userId,
      sortMode: getPipelineBoardSortMode(body.sortMode),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      pipeline_manual_rank: result.pipeline_manual_rank,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reorder card." },
      { status: 500 }
    );
  }
}
