import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "./constants";

/** Ordered pipeline stages shown in the progress tracker (excludes terminal). */
export const TRACKED_PIPELINE_STAGES = PIPELINE_STAGES.filter(
  (s) => s !== "closed_lost"
) as Exclude<PipelineStage, "closed_lost">[];

export type PipelineStepStatus = "completed" | "current" | "future";

export function trackedPipelineIndex(stage: PipelineStage): number {
  if (stage === "closed_lost") return -1;
  return TRACKED_PIPELINE_STAGES.indexOf(
    stage as (typeof TRACKED_PIPELINE_STAGES)[number]
  );
}

export function pipelineStepStatus(
  step: PipelineStage,
  currentStage: PipelineStage
): PipelineStepStatus {
  if (currentStage === "closed_lost") {
    return trackedPipelineIndex(step) >= 0 ? "completed" : "future";
  }
  const stepIdx = trackedPipelineIndex(step);
  const currentIdx = trackedPipelineIndex(currentStage);
  if (stepIdx < 0) return "future";
  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "current";
  return "future";
}

export function pipelineStageLabel(stage: PipelineStage): string {
  return PIPELINE_STAGE_LABELS[stage];
}

export type PipelineStageChangeAudit = {
  occurred_at: string;
  outcome: string | null;
  creator_name: string | null;
};

/** Latest pipeline-stage audit engagement for an organisation, if any. */
export function findLatestPipelineStageChange(
  engagements: {
    summary: string | null;
    outcome: string | null;
    occurred_at: string;
    creator?: { full_name: string | null } | null;
  }[]
): PipelineStageChangeAudit | null {
  const row = engagements.find(
    (e) => e.summary === "Pipeline stage updated"
  );
  if (!row) return null;
  return {
    occurred_at: row.occurred_at,
    outcome: row.outcome,
    creator_name: row.creator?.full_name ?? null,
  };
}
