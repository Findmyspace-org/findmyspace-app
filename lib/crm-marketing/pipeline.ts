import type { PipelineStage } from "@/lib/space-place/constants";

export function pipelineStageRequiresReason(stage: PipelineStage): boolean {
  return stage === "closed_lost";
}
