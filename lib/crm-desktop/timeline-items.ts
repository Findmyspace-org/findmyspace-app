import type { CrmContact, CrmEngagement, CrmTask } from "@/lib/space-place/types";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";
import { displayName } from "@/lib/space-place/format";
import { resolveLegacyEngagementTaskId } from "./timeline-task-link";

export type CrmTimelineEngagementInput = CrmEngagement & {
  crm_contacts?: Pick<CrmContact, "id" | "full_name" | "first_name" | "last_name"> | null;
  contact?: Pick<CrmContact, "id" | "full_name" | "first_name" | "last_name"> | null;
  creator?: { id: string; full_name: string | null } | null;
};

export type CrmTimelineItem = {
  id: string;
  kind: "engagement" | "task" | "email";
  type: string;
  occurred_at: string;
  summary: string | null;
  outcome: string | null;
  contact_id: string | null;
  contact_name: string | null;
  creator_name: string | null;
  status?: string;
  related_task_id?: string | null;
  detail?: string | null;
  task_id?: string | null;
  task_status?: string | null;
  task_due_date?: string | null;
  task_completed_at?: string | null;
  organisation_id?: string | null;
  task_missing?: boolean;
  task_legacy_link?: boolean;
};

export type ResolveEngagementTaskLinkResult = {
  taskId: string | null;
  legacy: boolean;
  ambiguous: boolean;
};

export function resolveEngagementTaskLink(
  engagement: Pick<
    CrmEngagement,
    "type" | "task_id" | "summary" | "occurred_at" | "organisation_id"
  >,
  tasks: CrmTask[]
): ResolveEngagementTaskLinkResult {
  if (engagement.type !== "task") {
    return { taskId: null, legacy: false, ambiguous: false };
  }

  if (engagement.task_id) {
    return { taskId: engagement.task_id, legacy: false, ambiguous: false };
  }

  const occurred = new Date(engagement.occurred_at).getTime();
  const candidates = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.organisation_id === engagement.organisation_id &&
      task.title === engagement.summary &&
      task.completed_at &&
      Math.abs(new Date(task.completed_at).getTime() - occurred) < 60_000
  );

  if (candidates.length === 0) {
    return { taskId: null, legacy: true, ambiguous: false };
  }
  if (candidates.length > 1) {
    return { taskId: null, legacy: true, ambiguous: true };
  }

  return { taskId: candidates[0]!.id, legacy: true, ambiguous: false };
}

function relatedFollowUpTask(
  engagement: CrmTimelineEngagementInput,
  tasks: CrmTask[]
): CrmTask | undefined {
  const occurred = new Date(engagement.occurred_at).getTime();
  return tasks
    .filter((t) => {
      if (t.status === "cancelled") return false;
      if (t.organisation_id !== engagement.organisation_id) return false;
      if (
        engagement.contact_id &&
        t.contact_id &&
        t.contact_id !== engagement.contact_id
      ) {
        return false;
      }
      return new Date(t.created_at).getTime() >= occurred - 60_000;
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
}

function contactNameForTask(
  task: CrmTask,
  contacts: CrmContact[]
): string | null {
  if (!task.contact_id) return null;
  const contact = contacts.find((c) => c.id === task.contact_id);
  if (!contact) return null;
  return displayName(contact.full_name, contact.first_name, contact.last_name);
}

function contactNameFromEngagement(engagement: CrmTimelineEngagementInput): string | null {
  const contact = engagement.contact || engagement.crm_contacts;
  if (!contact) return null;
  return displayName(contact.full_name, contact.first_name, contact.last_name);
}

export function buildCrmTimelineItems(input: {
  engagements: CrmTimelineEngagementInput[];
  tasks: CrmTask[];
  emails?: CrmEmailMessageWithRelations[];
  contacts?: CrmContact[];
}): CrmTimelineItem[] {
  const { engagements, tasks, emails = [], contacts = [] } = input;
  const rows: CrmTimelineItem[] = [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const suppressedCompletedTaskIds = new Set<string>();
  const shownTaskCompletionIds = new Set<string>();

  for (const e of engagements) {
    if (e.type === "task") {
      const link = resolveEngagementTaskLink(e, tasks);
      const linkedTask = link.taskId ? taskById.get(link.taskId) : undefined;
      const taskMissing =
        link.ambiguous ||
        !link.taskId ||
        Boolean(link.taskId && !linkedTask);

      if (link.taskId && shownTaskCompletionIds.has(link.taskId)) {
        continue;
      }

      if (link.taskId && linkedTask && !taskMissing) {
        suppressedCompletedTaskIds.add(link.taskId);
        shownTaskCompletionIds.add(link.taskId);
      }

      rows.push({
        id: `eng-${e.id}`,
        kind: "task",
        type: linkedTask?.status === "open" ? "task_open" : "task_done",
        occurred_at: e.occurred_at,
        summary: linkedTask?.title ?? e.summary,
        outcome: e.outcome,
        contact_id: linkedTask?.contact_id ?? e.contact_id,
        contact_name:
          (linkedTask ? contactNameForTask(linkedTask, contacts) : null) ??
          contactNameFromEngagement(e),
        creator_name: e.creator?.full_name ?? null,
        detail: e.outcome,
        task_id: link.taskId,
        task_status: linkedTask?.status ?? "done",
        task_due_date: linkedTask?.due_date ?? null,
        task_completed_at: linkedTask?.completed_at ?? e.occurred_at,
        organisation_id: e.organisation_id,
        task_missing: taskMissing,
        task_legacy_link: link.legacy && Boolean(link.taskId),
        related_task_id: relatedFollowUpTask(e, tasks)?.id ?? null,
      });
      continue;
    }

    const contact = e.contact || e.crm_contacts;
    rows.push({
      id: `eng-${e.id}`,
      kind: "engagement",
      type: e.type,
      occurred_at: e.occurred_at,
      summary: e.summary,
      outcome: e.outcome,
      contact_id: e.contact_id,
      contact_name: contact
        ? displayName(contact.full_name, contact.first_name, contact.last_name)
        : null,
      creator_name: e.creator?.full_name ?? null,
      related_task_id: relatedFollowUpTask(e, tasks)?.id ?? null,
      detail: e.outcome,
      organisation_id: e.organisation_id,
    });
  }

  for (const t of tasks) {
    if (t.status === "done" && suppressedCompletedTaskIds.has(t.id)) {
      continue;
    }

    rows.push({
      id: `task-${t.id}`,
      kind: "task",
      type: t.status === "done" ? "task_done" : "task_open",
      occurred_at: t.completed_at || t.due_date || t.created_at,
      summary: t.title,
      outcome: t.description,
      contact_id: t.contact_id,
      contact_name: contactNameForTask(t, contacts),
      creator_name: null,
      status: t.status,
      detail: t.description,
      task_id: t.id,
      task_status: t.status,
      task_due_date: t.due_date,
      task_completed_at: t.completed_at,
      organisation_id: t.organisation_id,
    });
  }

  for (const em of emails) {
    rows.push({
      id: `email-${em.id}`,
      kind: "email",
      type: "email",
      occurred_at: em.sent_at || em.imported_at,
      summary: em.subject,
      outcome: em.body_text?.slice(0, 280) ?? null,
      contact_id: em.contact_id,
      contact_name: em.crm_contacts?.full_name ?? null,
      creator_name: null,
      detail: em.body_text,
      organisation_id: em.organisation_id,
    });
  }

  return rows.sort(
    (a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  );
}

/** @deprecated Use resolveEngagementTaskLink — legacy title/timestamp fallback only */
export function resolveLegacyEngagementTaskIdForTests(
  engagement: Pick<
    CrmEngagement,
    "type" | "summary" | "occurred_at" | "organisation_id"
  >,
  tasks: CrmTask[]
): string | null {
  return resolveLegacyEngagementTaskId(engagement, tasks);
}
