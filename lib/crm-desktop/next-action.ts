import type { CrmTask } from "@/lib/space-place/types";
import { compareNextCrmTasks } from "@/lib/space-place/next-task";
import { crmTodayIsoDate } from "@/lib/crm-desktop/timezone";

export type CrmActionDateGroup = "overdue" | "today" | "future" | "none";

export type CrmNextAction = {
  title: string;
  actionDate: string | null;
  dateGroup: CrmActionDateGroup;
  source: "task" | "follow_up_task";
  taskId: string | null;
};

export type CrmActionTaskCandidate = Pick<
  CrmTask,
  "id" | "status" | "due_date" | "title" | "organisation_id" | "contact_id" | "created_at"
>;

export type CrmFollowUpActivityCandidate = {
  id: string;
  organisation_id: string;
  contact_id: string | null;
  type: string;
  summary: string | null;
  occurred_at: string;
  follow_up_task?: CrmActionTaskCandidate | null;
};

const CLOSED_ENGAGEMENT_TYPES = new Set(["task", "email"]);
const NOTE_WITHOUT_FOLLOW_UP_TYPES = new Set(["note"]);

export function getCrmActionDateGroup(
  actionDate: string | null | undefined,
  today: string = crmTodayIsoDate()
): CrmActionDateGroup {
  if (!actionDate) return "none";
  if (actionDate < today) return "overdue";
  if (actionDate === today) return "today";
  return "future";
}

export function compareCrmActionDateGroups(
  a: CrmActionDateGroup,
  b: CrmActionDateGroup
): number {
  const order: Record<CrmActionDateGroup, number> = {
    overdue: 0,
    today: 1,
    future: 2,
    none: 3,
  };
  return order[a] - order[b];
}

function isActionableTask(task: CrmActionTaskCandidate): boolean {
  return task.status === "open";
}

function openTasksForOrganisation(
  tasks: CrmActionTaskCandidate[],
  organisationId: string,
  primaryContactId?: string | null
): CrmActionTaskCandidate[] {
  const open = tasks.filter(isActionableTask);
  const orgLinked = open.filter((t) => t.organisation_id === organisationId);
  if (orgLinked.length) return orgLinked;
  if (primaryContactId) {
    return open.filter((t) => t.contact_id === primaryContactId);
  }
  return [];
}

function isDatedFollowUpActivity(activity: CrmFollowUpActivityCandidate): boolean {
  if (CLOSED_ENGAGEMENT_TYPES.has(activity.type)) return false;
  if (NOTE_WITHOUT_FOLLOW_UP_TYPES.has(activity.type) && !activity.follow_up_task) {
    return false;
  }
  return Boolean(activity.follow_up_task?.due_date);
}

/**
 * Resolve the next actionable item for an organisation from open tasks and
 * dated follow-up activities (open tasks linked to recent engagements).
 */
export function resolveNextCrmActionForOrganisation(
  tasks: CrmActionTaskCandidate[],
  organisationId: string,
  primaryContactId?: string | null,
  followUpActivities: CrmFollowUpActivityCandidate[] = []
): CrmNextAction | null {
  const candidates: CrmNextAction[] = [];

  for (const task of openTasksForOrganisation(tasks, organisationId, primaryContactId)) {
    candidates.push({
      title: task.title,
      actionDate: task.due_date,
      dateGroup: getCrmActionDateGroup(task.due_date),
      source: "task",
      taskId: task.id,
    });
  }

  for (const activity of followUpActivities) {
    if (activity.organisation_id !== organisationId) continue;
    if (!isDatedFollowUpActivity(activity) || !activity.follow_up_task) continue;
    const task = activity.follow_up_task;
    if (!isActionableTask(task) || !task.due_date) continue;
    candidates.push({
      title: task.title,
      actionDate: task.due_date,
      dateGroup: getCrmActionDateGroup(task.due_date),
      source: "follow_up_task",
      taskId: task.id,
    });
  }

  if (!candidates.length) {
    const undatedTask = [...openTasksForOrganisation(tasks, organisationId, primaryContactId)]
      .filter((t) => !t.due_date)
      .sort(compareNextCrmTasks)[0];
    if (undatedTask) {
      return {
        title: undatedTask.title,
        actionDate: null,
        dateGroup: "none",
        source: "task",
        taskId: undatedTask.id,
      };
    }
    return null;
  }

  const dated = candidates
    .filter((c) => c.actionDate)
    .sort((a, b) => a.actionDate!.localeCompare(b.actionDate!));
  if (dated.length) return dated[0];

  return candidates.sort((a, b) => a.title.localeCompare(b.title))[0];
}

export function linkFollowUpTasksToEngagements<
  T extends CrmFollowUpActivityCandidate,
>(engagements: T[], tasks: CrmActionTaskCandidate[]): T[] {
  return engagements.map((engagement) => {
    const occurred = new Date(engagement.occurred_at).getTime();
    const followUp = tasks
      .filter((task) => {
        if (!isActionableTask(task)) return false;
        if (task.organisation_id !== engagement.organisation_id) return false;
        if (
          engagement.contact_id &&
          task.contact_id &&
          task.contact_id !== engagement.contact_id
        ) {
          return false;
        }
        return new Date(task.created_at as string).getTime() >= occurred - 60_000;
      })
      .sort(
        (a, b) =>
          new Date(a.created_at as string).getTime() -
          new Date(b.created_at as string).getTime()
      )[0];
    return {
      ...engagement,
      follow_up_task: followUp ?? null,
    };
  });
}
