"use client";

import { useEffect, useMemo, useState } from "react";
import { crmDb } from "@/lib/space-place/db";
import { PIPELINE_STAGE_LABELS, TASK_PRIORITIES } from "@/lib/space-place/constants";
import type { CrmProfile, CrmTaskWithRelations } from "@/lib/space-place/types";
import { formatSpacerOptionLabel } from "@/lib/space-place/spacers";
import {
  DEFAULT_TASK_OUTCOME,
  TASK_OUTCOME_OPTIONS,
  formatTaskOutcomeForEngagement,
  getSuggestedPipelineStage,
} from "@/lib/space-place/task-outcomes";
import { EditSlideOver } from "./EditSlideOver";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";

const FORM_ID = "complete-task-form";

function tomorrowDateInput(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

type CompleteTaskPanelProps = {
  open: boolean;
  task: CrmTaskWithRelations;
  profileId: string;
  assignees: CrmProfile[];
  onClose: () => void;
  onSaved: () => void;
};

export function CompleteTaskPanel({
  open,
  task,
  profileId,
  assignees,
  onClose,
  onSaved,
}: CompleteTaskPanelProps) {
  const [outcomeValue, setOutcomeValue] = useState(DEFAULT_TASK_OUTCOME);
  const [extraNotes, setExtraNotes] = useState("");
  const [applyPipelineUpdate, setApplyPipelineUpdate] = useState(true);
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDescription, setFollowUpDescription] = useState("");
  const [followUpDueDate, setFollowUpDueDate] = useState(tomorrowDateInput());
  const [followUpPriority, setFollowUpPriority] = useState(task.priority || "normal");
  const [followUpOwnerId, setFollowUpOwnerId] = useState(
    task.owner_id || profileId || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const orgName = task.crm_organisations?.name || "this organisation";
  const contactName = task.crm_contacts?.full_name || null;
  const currentPipelineStage = task.crm_organisations?.pipeline_stage ?? null;

  const suggestedPipelineStage = useMemo(
    () => getSuggestedPipelineStage(outcomeValue),
    [outcomeValue]
  );

  const showPipelineSuggestion =
    Boolean(task.organisation_id) &&
    suggestedPipelineStage !== null &&
    suggestedPipelineStage !== currentPipelineStage;

  const defaultFollowUpTitle = useMemo(() => {
    if (contactName) return `Follow up with ${contactName}`;
    return `Follow up with ${orgName}`;
  }, [contactName, orgName]);

  useEffect(() => {
    if (!open) return;
    setOutcomeValue(DEFAULT_TASK_OUTCOME);
    setExtraNotes("");
    setApplyPipelineUpdate(true);
    setCreateFollowUp(true);
    setFollowUpTitle(defaultFollowUpTitle);
    setFollowUpDescription("");
    setFollowUpDueDate(tomorrowDateInput());
    setFollowUpPriority(task.priority || "normal");
    setFollowUpOwnerId(task.owner_id || profileId || "");
    setError(null);
    setSuccess(null);
  }, [open, task, defaultFollowUpTitle, profileId]);

  function resolveFollowUpOwnerId(): string | null {
    const selected = followUpOwnerId.trim();
    if (selected) return selected;
    if (task.owner_id) return task.owner_id;
    if (profileId) return profileId;
    return null;
  }

  useEffect(() => {
    if (showPipelineSuggestion) {
      setApplyPipelineUpdate(true);
    }
  }, [outcomeValue, showPipelineSuggestion]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (createFollowUp) {
      if (!task.organisation_id) {
        setError("Follow-up requires an organisation on this task.");
        return;
      }
      if (!followUpTitle.trim()) {
        setError("Follow-up title is required.");
        return;
      }
      if (!followUpDueDate) {
        setError("Follow-up due date is required.");
        return;
      }
      if (!(TASK_PRIORITIES as readonly string[]).includes(followUpPriority)) {
        setError("Priority must be low, normal or high.");
        return;
      }
      if (!resolveFollowUpOwnerId()) {
        setError("Please select who this follow-up is assigned to.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const nowIso = new Date().toISOString();
    const { error: taskErr } = await crmDb
      .tasks()
      .update({ status: "done", completed_at: nowIso })
      .eq("id", task.id);

    if (taskErr) {
      setSaving(false);
      setError(taskErr.message);
      return;
    }

    if (task.organisation_id) {
      const outcomeText = formatTaskOutcomeForEngagement(outcomeValue, extraNotes);
      const { error: engagementErr } = await crmDb.engagements().insert({
        organisation_id: task.organisation_id,
        contact_id: task.contact_id,
        type: "task",
        summary: task.title,
        outcome: outcomeText,
        direction: "internal",
        occurred_at: nowIso,
        created_by: profileId,
      });

      if (engagementErr) {
        setSaving(false);
        setError(engagementErr.message);
        return;
      }

      if (
        applyPipelineUpdate &&
        suggestedPipelineStage &&
        suggestedPipelineStage !== currentPipelineStage
      ) {
        const { error: pipelineErr } = await crmDb
          .organisations()
          .update({ pipeline_stage: suggestedPipelineStage })
          .eq("id", task.organisation_id);

        if (pipelineErr) {
          setSaving(false);
          setError(pipelineErr.message);
          return;
        }
      }
    }

    if (createFollowUp) {
      const ownerId = resolveFollowUpOwnerId();
      if (!task.organisation_id) {
        setSaving(false);
        setError("Follow-up requires an organisation on this task.");
        return;
      }
      if (!followUpTitle.trim() || !followUpDueDate) {
        setSaving(false);
        setError("Follow-up title and due date are required.");
        return;
      }
      if (!ownerId) {
        setSaving(false);
        setError("Please select who this follow-up is assigned to.");
        return;
      }

      const followUpPayload = {
        organisation_id: task.organisation_id,
        contact_id: task.contact_id,
        title: followUpTitle.trim(),
        description: followUpDescription.trim() || null,
        due_date: followUpDueDate,
        status: "open" as const,
        priority: followUpPriority,
        owner_id: ownerId,
      };
      console.log("[CompleteTaskPanel] follow-up insert", followUpPayload);

      const { error: followUpErr } = await crmDb.tasks().insert(followUpPayload);
      if (followUpErr) {
        setSaving(false);
        setError(followUpErr.message);
        return;
      }
    }

    setSaving(false);
    setSuccess(
      createFollowUp
        ? "Task completed and follow-up created."
        : "Task completed."
    );
    onSaved();
    setTimeout(() => onClose(), 600);
  }

  return (
    <EditSlideOver
      open={open}
      title="Complete task"
      onClose={onClose}
      onSave={() => {}}
      saving={saving}
      error={error}
      success={success}
      formId={FORM_ID}
      saveLabel={createFollowUp ? "Complete and create follow-up" : "Complete task"}
      savingLabel="Saving..."
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <p className="font-semibold text-neutral-900">{task.title}</p>
          <p className="mt-1 text-neutral-600">Organisation: {orgName}</p>
          {contactName ? (
            <p className="text-neutral-600">Contact: {contactName}</p>
          ) : null}
        </div>

        <label className="block">
          <span className={LABEL_CLASS}>Outcome</span>
          <select
            value={outcomeValue}
            onChange={(e) => setOutcomeValue(e.target.value)}
            className={FIELD_CLASS}
          >
            {TASK_OUTCOME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {showPipelineSuggestion && suggestedPipelineStage ? (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <input
              type="checkbox"
              checked={applyPipelineUpdate}
              onChange={(e) => setApplyPipelineUpdate(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm text-amber-950">
              Update pipeline to{" "}
              <span className="font-semibold">
                {PIPELINE_STAGE_LABELS[suggestedPipelineStage]}
              </span>
              {currentPipelineStage ? (
                <>
                  {" "}
                  (from {PIPELINE_STAGE_LABELS[currentPipelineStage]})
                </>
              ) : null}
            </span>
          </label>
        ) : null}

        <label className="block">
          <span className={LABEL_CLASS}>Extra notes</span>
          <textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            rows={3}
            placeholder="Optional details"
            className={FIELD_CLASS}
          />
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <input
            type="checkbox"
            checked={createFollowUp}
            onChange={(e) => setCreateFollowUp(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-semibold text-neutral-800">
            Create follow-up task
          </span>
        </label>

        {createFollowUp ? (
          <div className="space-y-4 rounded-xl border border-neutral-200 p-3">
            <p className="text-sm font-semibold text-neutral-700">Next follow-up</p>
            <label className="block">
              <span className={LABEL_CLASS}>Title</span>
              <input
                value={followUpTitle}
                onChange={(e) => setFollowUpTitle(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Description</span>
              <textarea
                value={followUpDescription}
                onChange={(e) => setFollowUpDescription(e.target.value)}
                rows={3}
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>When should we follow up?</span>
              <input
                type="date"
                value={followUpDueDate}
                onChange={(e) => setFollowUpDueDate(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Priority</span>
              <select
                value={followUpPriority}
                onChange={(e) => setFollowUpPriority(e.target.value)}
                className={FIELD_CLASS}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Assigned to</span>
              <select
                value={followUpOwnerId}
                onChange={(e) => setFollowUpOwnerId(e.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">Select assignee</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {formatSpacerOptionLabel(assignee, assignees)} ({assignee.role})
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </form>
    </EditSlideOver>
  );
}
