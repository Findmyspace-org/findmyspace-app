import type { CrmEngagement } from "@/lib/space-place/types";
import type { CrmTask } from "@/lib/space-place/types";

/**
 * Historical fallback for task completion engagements created before task_id existed.
 * Only used when engagement.task_id is null. Ambiguous matches return null.
 */
export function resolveLegacyEngagementTaskId(
  engagement: Pick<
    CrmEngagement,
    "type" | "summary" | "occurred_at" | "organisation_id"
  >,
  tasks: CrmTask[]
): string | null {
  if (engagement.type !== "task") return null;
  const occurred = new Date(engagement.occurred_at).getTime();
  const candidates = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.organisation_id === engagement.organisation_id &&
      task.title === engagement.summary &&
      task.completed_at &&
      Math.abs(new Date(task.completed_at).getTime() - occurred) < 60_000
  );
  if (candidates.length !== 1) return null;
  return candidates[0]!.id;
}

/** @deprecated Use resolveEngagementTaskLink from timeline-items.ts */
export const resolveTaskIdForEngagement = resolveLegacyEngagementTaskId;
