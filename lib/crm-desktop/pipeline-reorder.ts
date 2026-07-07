import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineStage } from "@/lib/space-place/constants";
import { PIPELINE_STAGES } from "@/lib/space-place/constants";
import { computePipelineInsertRank } from "./pipeline-rank";
import {
  enrichStageOrganisationsForOrdering,
  loadStageOrganisations,
} from "./pipeline-stage-enrichment";
import type { CrmPipelineBoardSortMode } from "./pipeline-ordering";

export type ReorderPipelineCardInput = {
  organisationId: string;
  pipelineStage: PipelineStage;
  beforeOrganisationId?: string | null;
  afterOrganisationId?: string | null;
  profileId: string;
  sortMode?: CrmPipelineBoardSortMode;
};

export type ReorderPipelineCardResult =
  | { ok: true; pipeline_manual_rank: number }
  | { ok: false; error: string; status: number };

function isPipelineStage(value: string): value is PipelineStage {
  return PIPELINE_STAGES.includes(value as PipelineStage);
}

export async function reorderPipelineCard(
  adminClient: SupabaseClient,
  input: ReorderPipelineCardInput
): Promise<ReorderPipelineCardResult> {
  if (!isPipelineStage(input.pipelineStage)) {
    return { ok: false, error: "Invalid pipeline stage.", status: 400 };
  }

  const { data: org, error: orgError } = await adminClient
    .from("crm_organisations")
    .select("id, pipeline_stage, status")
    .eq("id", input.organisationId)
    .maybeSingle();

  if (orgError) {
    return { ok: false, error: orgError.message, status: 500 };
  }
  if (!org || org.status === "archived") {
    return { ok: false, error: "Organisation not found.", status: 404 };
  }
  if (org.pipeline_stage !== input.pipelineStage) {
    return {
      ok: false,
      error: "Organisation is not in the requested pipeline stage.",
      status: 409,
    };
  }

  const stageRowsRaw = await loadStageOrganisations(
    adminClient,
    input.pipelineStage
  );
  const enriched = await enrichStageOrganisationsForOrdering(
    adminClient,
    stageRowsRaw
  );

  let rankResult;
  try {
    rankResult = computePipelineInsertRank({
      stageRows: enriched,
      movingOrganisationId: input.organisationId,
      beforeOrganisationId: input.beforeOrganisationId,
      afterOrganisationId: input.afterOrganisationId,
      sortMode: input.sortMode ?? "smart",
      excludeMovingOrganisation: true,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to compute rank.",
      status: 400,
    };
  }

  if (rankResult.needsNormalization) {
    const allUpdates = [
      ...rankResult.peerRankUpdates,
      {
        id: input.organisationId,
        pipeline_manual_rank: rankResult.rank,
      },
    ];

    for (const row of allUpdates) {
      const { error } = await adminClient
        .from("crm_organisations")
        .update({
          pipeline_manual_rank: row.pipeline_manual_rank,
          pipeline_rank_updated_at: new Date().toISOString(),
          pipeline_rank_updated_by: input.profileId,
        })
        .eq("id", row.id);
      if (error) return { ok: false, error: error.message, status: 500 };
    }

    return { ok: true, pipeline_manual_rank: rankResult.rank };
  }

  const { error: updateError } = await adminClient
    .from("crm_organisations")
    .update({
      pipeline_manual_rank: rankResult.rank,
      pipeline_rank_updated_at: new Date().toISOString(),
      pipeline_rank_updated_by: input.profileId,
    })
    .eq("id", input.organisationId);

  if (updateError) {
    return { ok: false, error: updateError.message, status: 500 };
  }

  return { ok: true, pipeline_manual_rank: rankResult.rank };
}
