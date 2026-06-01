import { PIPELINE_STAGES, type PipelineStage } from "./constants";
import { dueBucket } from "./format";
import type {
  CrmEngagement,
  CrmOrganisation,
  CrmProfile,
  CrmTask,
} from "./types";

export type TeamMemberStats = {
  profile: CrmProfile;
  openTasks: number;
  overdueTasks: number;
  stageCounts: Record<PipelineStage, number>;
  lastActivityAt: string | null;
};

/** Aggregate metrics keyed by profile id (equivalent to GROUP BY profile id). */
export function aggregateTeamStatsByProfileId(
  roster: CrmProfile[],
  organisations: CrmOrganisation[],
  tasks: CrmTask[],
  engagements: CrmEngagement[]
): TeamMemberStats[] {
  const orgsByAssignee = new Map<string, CrmOrganisation[]>();
  for (const org of organisations) {
    if (!org.assigned_to) continue;
    const list = orgsByAssignee.get(org.assigned_to) ?? [];
    list.push(org);
    orgsByAssignee.set(org.assigned_to, list);
  }

  const openTasksByOwner = new Map<string, CrmTask[]>();
  for (const task of tasks) {
    if (task.status !== "open" || !task.owner_id) continue;
    const list = openTasksByOwner.get(task.owner_id) ?? [];
    list.push(task);
    openTasksByOwner.set(task.owner_id, list);
  }

  const lastEngagementByCreator = new Map<string, CrmEngagement>();
  for (const engagement of engagements) {
    if (!engagement.created_by) continue;
    const existing = lastEngagementByCreator.get(engagement.created_by);
    if (
      !existing ||
      new Date(engagement.occurred_at).getTime() >
        new Date(existing.occurred_at).getTime()
    ) {
      lastEngagementByCreator.set(engagement.created_by, engagement);
    }
  }

  return roster.map((profile) => {
    const assigned = orgsByAssignee.get(profile.id) ?? [];
    const openTasks = openTasksByOwner.get(profile.id) ?? [];
    const overdueTasks = openTasks.filter(
      (t) => dueBucket(t.due_date, t.status) === "overdue"
    );

    const stageCounts = Object.fromEntries(
      PIPELINE_STAGES.map((stage) => [
        stage,
        assigned.filter((o) => o.pipeline_stage === stage).length,
      ])
    ) as Record<PipelineStage, number>;

    const lastEng = lastEngagementByCreator.get(profile.id);

    return {
      profile,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      stageCounts,
      lastActivityAt: lastEng?.occurred_at ?? null,
    };
  });
}
