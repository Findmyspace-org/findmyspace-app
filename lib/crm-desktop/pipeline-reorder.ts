import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineStage } from "@/lib/space-place/constants";
import { PIPELINE_STAGES } from "@/lib/space-place/constants";
import {
  computeFractionalRank,
  normalizeStageRanks,
  sortPipelineBoardRows,
  type CrmPipelineBoardSortMode,
} from "./pipeline-ordering";
import type { CrmOrganisationListRow } from "./types";

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

async function loadStageOrganisations(
  adminClient: SupabaseClient,
  stage: PipelineStage
) {
  const { data, error } = await adminClient
    .from("crm_organisations")
    .select(
      "id, name, pipeline_stage, pipeline_manual_rank, next_task_due, created_at, updated_at"
    )
    .eq("pipeline_stage", stage)
    .neq("status", "archived");
  if (error) throw new Error(error.message);
  return (data || []) as Array<
    Pick<
      CrmOrganisationListRow,
      | "id"
      | "name"
      | "pipeline_stage"
      | "pipeline_manual_rank"
      | "next_task_due"
      | "created_at"
      | "updated_at"
    >
  >;
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

  const stageRows = await loadStageOrganisations(adminClient, input.pipelineStage);
  const others = stageRows.filter((row) => row.id !== input.organisationId);
  const sortMode = input.sortMode ?? "smart";
  const ordered = sortPipelineBoardRows(
    others.map((row) => ({
      ...row,
      next_action_date: row.next_task_due ?? null,
      next_action_date_group: "none" as const,
      next_action_title: null,
      next_task_title: null,
      next_task_id: null,
      type: null,
      address: null,
      status: "active",
      assigned_to: null,
      assigned_name: null,
      primary_contact_id: null,
      primary_contact_name: null,
      primary_contact_role: null,
      primary_contact_email: null,
      primary_contact_phone: null,
      additional_contacts: [],
      contact_count: 0,
      space_count: 0,
      property_count: 0,
      last_interaction_at: null,
      last_interaction_summary: null,
      pipeline_rank_updated_at: null,
      pipeline_rank_updated_by: null,
    })),
    sortMode
  );

  let beforeRank: number | null | undefined;
  let afterRank: number | null | undefined;
  let fallbackIndex = ordered.length;

  if (input.beforeOrganisationId) {
    const index = ordered.findIndex((row) => row.id === input.beforeOrganisationId);
    if (index === -1) {
      return { ok: false, error: "Reference organisation not found in stage.", status: 400 };
    }
    afterRank = ordered[index]?.pipeline_manual_rank;
    beforeRank = ordered[index - 1]?.pipeline_manual_rank;
    fallbackIndex = index;
  } else if (input.afterOrganisationId) {
    const index = ordered.findIndex((row) => row.id === input.afterOrganisationId);
    if (index === -1) {
      return { ok: false, error: "Reference organisation not found in stage.", status: 400 };
    }
    beforeRank = ordered[index]?.pipeline_manual_rank;
    afterRank = ordered[index + 1]?.pipeline_manual_rank;
    fallbackIndex = index + 1;
  } else {
    beforeRank = ordered[ordered.length - 1]?.pipeline_manual_rank;
    afterRank = null;
    fallbackIndex = ordered.length;
  }

  let { rank, needsNormalization } = computeFractionalRank(
    beforeRank,
    afterRank,
    fallbackIndex
  );

  if (needsNormalization) {
    const withMoved = [...ordered];
    withMoved.splice(fallbackIndex, 0, {
      id: input.organisationId,
      pipeline_manual_rank: rank,
    } as CrmOrganisationListRow);
    const normalized = normalizeStageRanks(withMoved);
    for (const row of normalized) {
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
    const moved = normalized.find((row) => row.id === input.organisationId);
    return { ok: true, pipeline_manual_rank: moved?.pipeline_manual_rank ?? rank };
  }

  const { error: updateError } = await adminClient
    .from("crm_organisations")
    .update({
      pipeline_manual_rank: rank,
      pipeline_rank_updated_at: new Date().toISOString(),
      pipeline_rank_updated_by: input.profileId,
    })
    .eq("id", input.organisationId);

  if (updateError) {
    return { ok: false, error: updateError.message, status: 500 };
  }

  return { ok: true, pipeline_manual_rank: rank };
}
