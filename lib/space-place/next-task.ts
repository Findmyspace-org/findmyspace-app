import type { CrmTask } from "./types";

export type NextTaskCandidate = Pick<
  CrmTask,
  "id" | "status" | "due_date" | "title"
> &
  Partial<Pick<CrmTask, "organisation_id" | "contact_id" | "description" | "priority" | "owner_id">>;

/** Earliest due date first; tasks without a due date sort after dated tasks. */
export function compareNextCrmTasks(
  a: NextTaskCandidate,
  b: NextTaskCandidate
): number {
  if (a.due_date && b.due_date) {
    const cmp = a.due_date.localeCompare(b.due_date);
    if (cmp !== 0) return cmp;
  } else if (a.due_date && !b.due_date) {
    return -1;
  } else if (!a.due_date && b.due_date) {
    return 1;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Resolve the next open task for an organisation.
 * 1. Open tasks linked to the organisation (earliest due first)
 * 2. Otherwise open tasks linked to the primary contact
 */
export function resolveNextCrmTaskForOrganisation(
  tasks: NextTaskCandidate[],
  organisationId: string,
  primaryContactId?: string | null
): NextTaskCandidate | null {
  const open = tasks.filter((t) => t.status === "open");
  const orgLinked = open.filter((t) => t.organisation_id === organisationId);
  if (orgLinked.length) {
    return [...orgLinked].sort(compareNextCrmTasks)[0];
  }
  if (primaryContactId) {
    const contactLinked = open.filter((t) => t.contact_id === primaryContactId);
    if (contactLinked.length) {
      return [...contactLinked].sort(compareNextCrmTasks)[0];
    }
  }
  return null;
}

/** Resolve the next open task for a contact. */
export function resolveNextCrmTaskForContact(
  tasks: NextTaskCandidate[],
  contactId: string
): NextTaskCandidate | null {
  const open = openTasksForContact(tasks, contactId);
  return open.length ? [...open].sort(compareNextCrmTasks)[0] : null;
}

export function openTasksForContact(
  tasks: NextTaskCandidate[],
  contactId: string
): NextTaskCandidate[] {
  return tasks.filter((t) => t.status === "open" && t.contact_id === contactId);
}

export function isCrmTaskOverdue(
  dueDate: string | null | undefined,
  status: string
): boolean {
  if (status !== "open" || !dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}
