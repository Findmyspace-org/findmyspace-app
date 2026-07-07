import { crmDb } from "./db";
import type { PipelineStage } from "./constants";
import type { CrmTask } from "./types";
import { PIPELINE_STAGE_LABELS } from "./constants";
import type { CrmMutationStore } from "./crm-mutation-store";
import {
  completeCrmTaskWithStore,
  logCrmAuditNote,
  validateCompleteCrmTaskInput,
  type CompleteCrmTaskInput,
} from "./complete-crm-task";

export type {
  CompleteCrmTaskInput,
};

export {
  completeCrmTaskWithStore,
  validateCompleteCrmTaskInput,
};

export type LogInteractionInput = {
  organisationId: string;
  contactId?: string | null;
  type: string;
  summary: string;
  outcome?: string | null;
  occurredAt?: string;
  createdBy?: string | null;
};

export type CreateCrmTaskInput = {
  organisationId: string;
  contactId?: string | null;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: string;
  ownerId: string;
};

function crmDbAsStore(): CrmMutationStore {
  return crmDb as unknown as CrmMutationStore;
}

export async function logCrmInteraction(
  input: LogInteractionInput
): Promise<{ error: string | null }> {
  const { error } = await crmDb.engagements().insert({
    organisation_id: input.organisationId,
    contact_id: input.contactId || null,
    type: input.type,
    summary: input.summary.trim(),
    outcome: input.outcome?.trim() || null,
    occurred_at: input.occurredAt || new Date().toISOString(),
    created_by: input.createdBy ?? null,
  });
  return { error: error?.message ?? null };
}

export async function createCrmTask(
  input: CreateCrmTaskInput
): Promise<{ error: string | null; task?: CrmTask }> {
  const { data, error } = await crmDb
    .tasks()
    .insert({
      organisation_id: input.organisationId,
      contact_id: input.contactId || null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.dueDate || null,
      status: "open",
      priority: input.priority || "normal",
      owner_id: input.ownerId,
    })
    .select("*")
    .single();
  return {
    error: error?.message ?? null,
    task: data as CrmTask | undefined,
  };
}

export async function completeCrmTask(
  input: CompleteCrmTaskInput
): Promise<{ error: string | null }> {
  return completeCrmTaskWithStore(crmDbAsStore(), input);
}

export async function updateCrmPipelineStage(input: {
  organisationId: string;
  pipelineStage: PipelineStage;
  lostReason?: string | null;
  previousStage?: PipelineStage | null;
  profileId?: string | null;
  contactId?: string | null;
}): Promise<{ error: string | null }> {
  const store = crmDbAsStore();
  let previousStage: PipelineStage | null = input.previousStage ?? null;

  if (input.previousStage === undefined) {
    const { data } = await store
      .organisations()
      .select("pipeline_stage")
      .eq("id", input.organisationId)
      .maybeSingle();
    previousStage = (data?.pipeline_stage as PipelineStage | null) ?? null;
  }

  const patch: Record<string, unknown> = {
    pipeline_stage: input.pipelineStage,
  };
  if (input.pipelineStage === "closed_lost" && input.lostReason) {
    patch.lost_reason = input.lostReason.trim();
  }
  const { error } = await crmDb
    .organisations()
    .update(patch)
    .eq("id", input.organisationId);
  if (error) return { error: error.message };

  if (previousStage !== input.pipelineStage) {
    const fromLabel = previousStage
      ? PIPELINE_STAGE_LABELS[previousStage]
      : "None";
    const audit = await logCrmAuditNote(store, {
      organisationId: input.organisationId,
      contactId: input.contactId,
      summary: "Pipeline stage updated",
      outcome: `From ${fromLabel} to ${PIPELINE_STAGE_LABELS[input.pipelineStage]}`,
      createdBy: input.profileId,
    });
    if (audit.error) return { error: audit.error };
  }

  return { error: null };
}

export async function updateCrmOrganisationAssignee(input: {
  organisationId: string;
  assignedTo: string | null;
  previousAssignedTo?: string | null;
  assigneeName?: string | null;
  profileId?: string | null;
  contactId?: string | null;
}): Promise<{ error: string | null }> {
  const store = crmDbAsStore();
  const { error } = await crmDb
    .organisations()
    .update({ assigned_to: input.assignedTo })
    .eq("id", input.organisationId);
  if (error) return { error: error.message };

  const previous = input.previousAssignedTo ?? null;
  if (previous !== input.assignedTo) {
    const assigneeLabel = input.assigneeName?.trim() || "Unassigned";
    const audit = await logCrmAuditNote(store, {
      organisationId: input.organisationId,
      contactId: input.contactId,
      summary: "CRM owner assigned",
      outcome:
        input.assignedTo === null
          ? "Unassigned"
          : `Assigned to ${assigneeLabel}`,
      createdBy: input.profileId,
    });
    if (audit.error) return { error: audit.error };
  }

  return { error: null };
}

export async function updateCrmContactAssignee(input: {
  contactId: string;
  organisationId: string;
  assignedTo: string | null;
  previousAssignedTo?: string | null;
  assigneeName?: string | null;
  profileId?: string | null;
}): Promise<{ error: string | null }> {
  const store = crmDbAsStore();
  const { error } = await crmDb
    .contacts()
    .update({ assigned_to: input.assignedTo })
    .eq("id", input.contactId);
  if (error) return { error: error.message };

  const previous = input.previousAssignedTo ?? null;
  if (previous !== input.assignedTo) {
    const assigneeLabel = input.assigneeName?.trim() || "Unassigned";
    const audit = await logCrmAuditNote(store, {
      organisationId: input.organisationId,
      summary: "Contact owner assigned",
      outcome:
        input.assignedTo === null
          ? "Unassigned"
          : `Assigned to ${assigneeLabel}`,
      createdBy: input.profileId,
      contactId: input.contactId,
    });
    if (audit.error) return { error: audit.error };
  }

  return { error: null };
}

export async function updateCrmTask(input: {
  taskId: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: string;
  ownerId?: string | null;
  contactId?: string | null;
}): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.dueDate !== undefined) patch.due_date = input.dueDate || null;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
  if (input.contactId !== undefined) patch.contact_id = input.contactId;

  if (!Object.keys(patch).length) return { error: null };

  const { error } = await crmDb.tasks().update(patch).eq("id", input.taskId);
  return { error: error?.message ?? null };
}
