import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineStage } from "@/lib/space-place/constants";
import { PIPELINE_STAGES } from "@/lib/space-place/constants";
import { computePipelineInsertRank } from "./pipeline-rank";
import {
  enrichStageOrganisationsForOrdering,
  loadStageOrganisations,
} from "./pipeline-stage-enrichment";
import type { CrmPipelineBoardSortMode } from "./pipeline-ordering";

export type MovePipelineOrganisationStageInput = {
  organisationId: string;
  previousStage: PipelineStage;
  destinationStage: PipelineStage;
  beforeOrganisationId?: string | null;
  afterOrganisationId?: string | null;
  profileId: string;
  contactId?: string | null;
  idempotencyKey: string;
  sortMode?: CrmPipelineBoardSortMode;
};

export type MovePipelineOrganisationStageResult =
  | {
      ok: true;
      organisationId: string;
      previousStage: PipelineStage;
      newStage: PipelineStage;
      pipeline_manual_rank: number;
      updated_at: string;
    }
  | { ok: false; error: string; status: number };

function isPipelineStage(value: string): value is PipelineStage {
  return PIPELINE_STAGES.includes(value as PipelineStage);
}

function isRpcUnavailableError(message: string): boolean {
  return /could not find the function/i.test(message);
}

export async function movePipelineOrganisationStage(
  adminClient: SupabaseClient,
  input: MovePipelineOrganisationStageInput
): Promise<MovePipelineOrganisationStageResult> {
  if (!isPipelineStage(input.previousStage)) {
    return { ok: false, error: "Invalid source pipeline stage.", status: 400 };
  }
  if (!isPipelineStage(input.destinationStage)) {
    return {
      ok: false,
      error: "Invalid destination pipeline stage.",
      status: 400,
    };
  }
  if (input.destinationStage === "closed_lost") {
    return {
      ok: false,
      error: "Use the Closed / Not Now flow for this stage.",
      status: 400,
    };
  }
  if (input.previousStage === input.destinationStage) {
    return {
      ok: false,
      error: "Source and destination stage must differ.",
      status: 400,
    };
  }
  if (!input.idempotencyKey?.trim()) {
    return { ok: false, error: "Idempotency key is required.", status: 400 };
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
  if (org.pipeline_stage !== input.previousStage) {
    return {
      ok: false,
      error: "Organisation is no longer in the expected source stage.",
      status: 409,
    };
  }

  let rankResult;
  try {
    const destinationRowsRaw = await loadStageOrganisations(
      adminClient,
      input.destinationStage
    );
    const enriched = await enrichStageOrganisationsForOrdering(
      adminClient,
      destinationRowsRaw
    );
    rankResult = computePipelineInsertRank({
      stageRows: enriched,
      movingOrganisationId: input.organisationId,
      beforeOrganisationId: input.beforeOrganisationId,
      afterOrganisationId: input.afterOrganisationId,
      sortMode: input.sortMode ?? "smart",
      excludeMovingOrganisation: false,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to compute rank.",
      status: 400,
    };
  }

  const peerRankUpdates = rankResult.peerRankUpdates.map((row) => ({
    organisation_id: row.id,
    pipeline_manual_rank: row.pipeline_manual_rank,
  }));

  const { data, error } = await adminClient.rpc(
    "crm_move_organisation_pipeline_stage",
    {
      p_idempotency_key: input.idempotencyKey,
      p_organisation_id: input.organisationId,
      p_profile_id: input.profileId,
      p_previous_stage: input.previousStage,
      p_destination_stage: input.destinationStage,
      p_pipeline_manual_rank: rankResult.rank,
      p_contact_id: input.contactId ?? null,
      p_peer_rank_updates: peerRankUpdates,
    }
  );

  if (error) {
    if (isRpcUnavailableError(error.message)) {
      return {
        ok: false,
        error: "Pipeline stage move is not available. Apply migration 055.",
        status: 503,
      };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const payload = data as {
    ok?: boolean;
    error?: string;
    organisation_id?: string;
    previous_stage?: string;
    new_stage?: string;
    pipeline_manual_rank?: number;
    updated_at?: string;
  };

  if (!payload?.ok) {
    return {
      ok: false,
      error: payload?.error || "Failed to move organisation.",
      status: 400,
    };
  }

  return {
    ok: true,
    organisationId: payload.organisation_id || input.organisationId,
    previousStage: (payload.previous_stage as PipelineStage) || input.previousStage,
    newStage: (payload.new_stage as PipelineStage) || input.destinationStage,
    pipeline_manual_rank:
      typeof payload.pipeline_manual_rank === "number"
        ? payload.pipeline_manual_rank
        : rankResult.rank,
    updated_at: payload.updated_at || new Date().toISOString(),
  };
}
