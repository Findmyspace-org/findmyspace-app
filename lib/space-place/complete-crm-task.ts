import {
  PIPELINE_STAGE_LABELS,
  TASK_PRIORITIES,
  type PipelineStage,
} from "./constants";
import {
  formatTaskOutcomeForEngagement,
  getSuggestedPipelineStage,
} from "./task-outcomes";
import type { CrmMutationStore } from "./crm-mutation-store";

export type CompleteCrmTaskInput = {
  taskId: string;
  organisationId: string | null;
  contactId: string | null;
  taskTitle: string;
  profileId: string;
  outcomeValue: string;
  extraNotes?: string;
  applyPipelineUpdate?: boolean;
  currentPipelineStage?: PipelineStage | null;
  createFollowUp?: boolean;
  followUpTitle?: string;
  followUpDescription?: string | null;
  followUpDueDate?: string;
  followUpPriority?: string;
  followUpOwnerId?: string | null;
  pipelineStageOverride?: PipelineStage | null;
};

export async function logCrmAuditNote(
  store: CrmMutationStore,
  input: {
    organisationId: string;
    contactId?: string | null;
    summary: string;
    outcome: string;
    createdBy?: string | null;
    occurredAt?: string;
  }
): Promise<{ error: string | null }> {
  const { error } = await store.engagements().insert({
    organisation_id: input.organisationId,
    contact_id: input.contactId ?? null,
    type: "note",
    summary: input.summary,
    outcome: input.outcome,
    direction: "internal",
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    created_by: input.createdBy ?? null,
  });
  return { error: error?.message ?? null };
}

/** Shared validation for mobile and desktop task completion flows. */
export function validateCompleteCrmTaskInput(
  input: CompleteCrmTaskInput
): string | null {
  if (!input.taskId?.trim()) return "Task is required.";
  if (!input.profileId?.trim()) return "Profile is required.";

  if (input.createFollowUp) {
    if (!input.organisationId) {
      return "Follow-up requires an organisation on this task.";
    }
    if (!input.followUpTitle?.trim()) {
      return "Follow-up title is required.";
    }
    if (!input.followUpDueDate) {
      return "Follow-up due date is required.";
    }
    if (
      input.followUpPriority &&
      !(TASK_PRIORITIES as readonly string[]).includes(input.followUpPriority)
    ) {
      return "Priority must be low, normal or high.";
    }
    if (!input.followUpOwnerId) {
      return "Please select who this follow-up is assigned to.";
    }
  }

  return null;
}

export async function completeCrmTaskWithStore(
  store: CrmMutationStore,
  input: CompleteCrmTaskInput
): Promise<{ error: string | null }> {
  const validationError = validateCompleteCrmTaskInput(input);
  if (validationError) return { error: validationError };

  const nowIso = new Date().toISOString();

  const { error: taskErr } = await store
    .tasks()
    .update({ status: "done", completed_at: nowIso })
    .eq("id", input.taskId);

  if (taskErr) return { error: taskErr.message };

  const rollbackTask = async () => {
    await store
      .tasks()
      .update({ status: "open", completed_at: null })
      .eq("id", input.taskId);
  };

  if (input.organisationId) {
    const outcomeText = formatTaskOutcomeForEngagement(
      input.outcomeValue,
      input.extraNotes || ""
    );
    const { error: engagementErr } = await store.engagements().insert({
      organisation_id: input.organisationId,
      contact_id: input.contactId,
      type: "task",
      summary: input.taskTitle,
      outcome: outcomeText,
      direction: "internal",
      occurred_at: nowIso,
      created_by: input.profileId,
    });
    if (engagementErr) {
      await rollbackTask();
      return { error: engagementErr.message };
    }

    const suggested =
      input.pipelineStageOverride ??
      getSuggestedPipelineStage(input.outcomeValue);
    if (
      input.applyPipelineUpdate &&
      suggested &&
      suggested !== input.currentPipelineStage
    ) {
      const { error: pipelineErr } = await store
        .organisations()
        .update({ pipeline_stage: suggested })
        .eq("id", input.organisationId);
      if (pipelineErr) {
        await rollbackTask();
        return { error: pipelineErr.message };
      }

      const fromLabel = input.currentPipelineStage
        ? PIPELINE_STAGE_LABELS[input.currentPipelineStage]
        : "None";
      const audit = await logCrmAuditNote(store, {
        organisationId: input.organisationId,
        contactId: input.contactId,
        summary: "Pipeline stage updated",
        outcome: `From ${fromLabel} to ${PIPELINE_STAGE_LABELS[suggested]}`,
        createdBy: input.profileId,
        occurredAt: nowIso,
      });
      if (audit.error) {
        await rollbackTask();
        return { error: audit.error };
      }
    }
  }

  if (input.createFollowUp) {
    const { error: followUpErr } = await store.tasks().insert({
      organisation_id: input.organisationId,
      contact_id: input.contactId,
      title: input.followUpTitle!.trim(),
      description: input.followUpDescription?.trim() || null,
      due_date: input.followUpDueDate,
      status: "open",
      priority: input.followUpPriority || "normal",
      owner_id: input.followUpOwnerId!,
    });
    if (followUpErr) {
      await rollbackTask();
      return { error: followUpErr.message };
    }
  }

  return { error: null };
}
