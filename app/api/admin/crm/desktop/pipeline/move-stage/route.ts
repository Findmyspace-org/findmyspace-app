import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { movePipelineOrganisationStage } from "@/lib/crm-desktop/pipeline-stage-move";
import type { PipelineStage } from "@/lib/space-place/constants";
import { getPipelineBoardSortMode } from "@/lib/crm-desktop/pipeline-ordering";

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as {
      organisationId?: string;
      previousStage?: PipelineStage;
      destinationStage?: PipelineStage;
      beforeOrganisationId?: string | null;
      afterOrganisationId?: string | null;
      contactId?: string | null;
      idempotencyKey?: string;
      sortMode?: string;
    };

    if (
      !body.organisationId ||
      !body.previousStage ||
      !body.destinationStage ||
      !body.idempotencyKey
    ) {
      return NextResponse.json(
        {
          error:
            "organisationId, previousStage, destinationStage and idempotencyKey are required.",
        },
        { status: 400 }
      );
    }

    const result = await movePipelineOrganisationStage(auth.adminClient, {
      organisationId: body.organisationId,
      previousStage: body.previousStage,
      destinationStage: body.destinationStage,
      beforeOrganisationId: body.beforeOrganisationId,
      afterOrganisationId: body.afterOrganisationId,
      profileId: auth.userId,
      contactId: body.contactId,
      idempotencyKey: body.idempotencyKey,
      sortMode: getPipelineBoardSortMode(body.sortMode),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      organisationId: result.organisationId,
      previousStage: result.previousStage,
      newStage: result.newStage,
      pipeline_manual_rank: result.pipeline_manual_rank,
      updated_at: result.updated_at,
    });
  } catch (error) {
    console.error("[crm/pipeline/move-stage]", error);
    return NextResponse.json(
      { error: "Failed to move organisation." },
      { status: 500 }
    );
  }
}
