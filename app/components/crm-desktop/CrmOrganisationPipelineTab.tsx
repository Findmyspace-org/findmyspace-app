"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Plus,
} from "lucide-react";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import { updateCrmPipelineStage } from "@/lib/space-place/crm-mutations";
import {
  findLatestPipelineStageChange,
  pipelineStageLabel,
} from "@/lib/space-place/pipeline-progress";
import {
  isCrmTaskOverdue,
  resolveNextCrmTaskForOrganisation,
  type NextTaskCandidate,
} from "@/lib/space-place/next-task";
import type { CrmContact, CrmOrganisation, CrmProfile, CrmTask } from "@/lib/space-place/types";
import { formatDateTime, formatDueDate } from "@/lib/space-place/format";
import { useCrmQuickAction } from "./CrmQuickActionProvider";
import { useCrmRefresh } from "@/lib/crm-desktop/crm-refresh";
import { CrmPipelineProgress } from "./CrmPipelineProgress";
import { CrmOverdueBadge, CrmPipelineBadge } from "./CrmStatusBadge";
import type { CrmTimelineEngagement } from "./CrmTimeline";

type EngagementRow = CrmTimelineEngagement;

type Props = {
  org: CrmOrganisation;
  contacts: CrmContact[];
  tasks: CrmTask[];
  engagements: EngagementRow[];
  assignees: CrmProfile[];
  assignedName: string;
  profileId: string;
  onRefresh: () => Promise<void>;
};

function suggestedTaskTitle(stage: PipelineStage, contactName?: string | null): string {
  const label = pipelineStageLabel(stage);
  if (contactName) return `Follow up: ${contactName} (${label})`;
  return `Next step: ${label}`;
}

export function CrmOrganisationPipelineTab({
  org,
  contacts,
  tasks,
  engagements,
  assignees,
  assignedName,
  profileId,
  onRefresh,
}: Props) {
  const { openQuickAction } = useCrmQuickAction();
  const { invalidate } = useCrmRefresh();
  const [pipelineStage, setPipelineStage] = useState(org.pipeline_stage);
  const [lostReason, setLostReason] = useState(org.lost_reason || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showNoTaskPrompt, setShowNoTaskPrompt] = useState(false);

  const primaryContact = contacts[0] ?? null;
  const primaryContactName =
    primaryContact?.full_name || primaryContact?.first_name || null;

  const nextTask = useMemo(
    () =>
      resolveNextCrmTaskForOrganisation(
        tasks as NextTaskCandidate[],
        org.id,
        primaryContact?.id
      ),
    [tasks, org.id, primaryContact?.id]
  );

  const fullNextTask = useMemo(
    () => (nextTask ? tasks.find((t) => t.id === nextTask.id) ?? null : null),
    [nextTask, tasks]
  );

  const latestEngagement = engagements[0] ?? null;
  const stageChange = useMemo(
    () => findLatestPipelineStageChange(engagements),
    [engagements]
  );

  const actionContext = useMemo(
    () => ({
      organisationId: org.id,
      organisationName: org.name,
      contactId: primaryContact?.id,
      contactName: primaryContactName ?? undefined,
      pipelineStage: org.pipeline_stage,
      assignedTo: org.assigned_to,
      taskId: fullNextTask?.id,
      taskTitle: fullNextTask?.title,
    }),
    [org, primaryContact, primaryContactName, fullNextTask]
  );

  const ownerName =
    assignees.find((a) => a.id === fullNextTask?.owner_id)?.full_name ||
    "Unassigned";

  const contactForTask = fullNextTask?.contact_id
    ? contacts.find((c) => c.id === fullNextTask.contact_id)
    : null;

  async function refreshAll() {
    await onRefresh();
    invalidate();
  }

  async function savePipelineStage(stage: PipelineStage) {
    if (stage === "closed_lost" && !lostReason.trim()) {
      setMessage("Enter a reason before closing.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setSuccess(null);
    const { error } = await updateCrmPipelineStage({
      organisationId: org.id,
      pipelineStage: stage,
      lostReason: stage === "closed_lost" ? lostReason : undefined,
      previousStage: org.pipeline_stage,
      profileId,
      contactId: primaryContact?.id ?? null,
    });
    setSaving(false);
    if (error) {
      setMessage(error);
      return;
    }
    setPipelineStage(stage);
    setSuccess("Pipeline stage updated.");
    await refreshAll();
    if (!nextTask && stage !== "closed_lost") {
      setShowNoTaskPrompt(true);
    }
  }

  function openAddTask() {
    openQuickAction(
      "add_task",
      {
        ...actionContext,
        pipelineStage,
        contactId: primaryContact?.id,
        contactName: primaryContactName ?? undefined,
        assignedTo: org.assigned_to || profileId,
        prefillTaskTitle: suggestedTaskTitle(org.pipeline_stage, primaryContactName),
      },
      async () => {
        setSuccess("Task created.");
        setShowNoTaskPrompt(false);
        await refreshAll();
      }
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="text-sm font-semibold text-[#192a3a]">Pipeline progress</h3>
        <div className="mt-4">
          <CrmPipelineProgress currentStage={org.pipeline_stage} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="text-sm font-semibold text-[#192a3a]">Current stage</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <p className="text-xs text-gray-500">Stage</p>
            <div className="mt-1">
              <CrmPipelineBadge stage={org.pipeline_stage} />
            </div>
          </div>
          {stageChange ? (
            <div>
              <p className="text-xs text-gray-500">Last changed</p>
              <p className="mt-1 text-sm font-medium">
                {formatDateTime(stageChange.occurred_at)}
              </p>
              {stageChange.outcome ? (
                <p className="text-xs text-gray-500">{stageChange.outcome}</p>
              ) : null}
            </div>
          ) : null}
          {org.pipeline_stage === "closed_lost" && org.lost_reason ? (
            <div className="md:col-span-2">
              <p className="text-xs text-gray-500">Reason</p>
              <p className="mt-1 text-sm">{org.lost_reason}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-gray-500">Relationship owner</p>
            <p className="mt-1 text-sm font-medium">{assignedName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Primary contact</p>
            {primaryContact ? (
              <Link
                href={`/admin/crm/contacts/${primaryContact.id}`}
                className="mt-1 block text-sm font-medium text-[#c1121f] hover:underline"
              >
                {primaryContactName}
              </Link>
            ) : (
              <p className="mt-1 text-sm text-gray-500">None</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Latest interaction</p>
            <p className="mt-1 text-sm">
              {latestEngagement?.summary || "No activity yet"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Next step</p>
            <p className="mt-1 text-sm font-medium">
              {fullNextTask?.title || "No open task"}
            </p>
            {fullNextTask?.due_date ? (
              <p className="text-sm text-gray-500">
                {formatDueDate(fullNextTask.due_date)}
                {isCrmTaskOverdue(fullNextTask.due_date, fullNextTask.status) ? (
                  <span className="ml-2">
                    <CrmOverdueBadge />
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#192a3a]">Next task</h3>
          {fullNextTask ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  openQuickAction("edit_task", actionContext, refreshAll)
                }
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Update task
              </button>
              <button
                type="button"
                onClick={() =>
                  openQuickAction("complete_task", actionContext, refreshAll)
                }
                className="inline-flex items-center gap-1 rounded-lg bg-[#192a3a] px-3 py-1.5 text-sm text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openAddTask}
              className="inline-flex items-center gap-1 rounded-lg bg-[#c1121f] px-3 py-1.5 text-sm text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Add next task
            </button>
          )}
        </div>

        {fullNextTask ? (
          <div className="mt-4 space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-base font-semibold text-[#192a3a]">
                {fullNextTask.title}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-2 py-0.5 text-xs capitalize text-gray-600">
                  {fullNextTask.status}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs capitalize text-gray-600">
                  {fullNextTask.priority} priority
                </span>
                {isCrmTaskOverdue(fullNextTask.due_date, fullNextTask.status) ? (
                  <CrmOverdueBadge />
                ) : null}
              </div>
            </div>
            {fullNextTask.description ? (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {fullNextTask.description}
              </p>
            ) : null}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Due</dt>
                <dd className="font-medium">
                  {fullNextTask.due_date
                    ? formatDueDate(fullNextTask.due_date)
                    : "No date"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Assigned to</dt>
                <dd className="font-medium">{ownerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Contact</dt>
                <dd className="font-medium">
                  {contactForTask ? (
                    <Link
                      href={`/admin/crm/contacts/${contactForTask.id}`}
                      className="text-[#c1121f] hover:underline"
                    >
                      {contactForTask.full_name || contactForTask.first_name}
                    </Link>
                  ) : (
                    "Organisation"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Type</dt>
                <dd className="font-medium capitalize">Task</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() =>
                openQuickAction("complete_task", actionContext, refreshAll)
              }
              className="inline-flex items-center gap-1 text-sm font-medium text-[#c1121f] hover:underline"
            >
              <ClipboardList className="h-4 w-4" /> Open task actions
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center">
            <p className="text-sm text-gray-600">
              No next task has been scheduled for this organisation.
            </p>
            <button
              type="button"
              onClick={openAddTask}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[#c1121f] px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" /> Add next task
            </button>
            <p className="mt-2 text-xs text-gray-500">
              Suggested: {suggestedTaskTitle(org.pipeline_stage, primaryContactName)}
            </p>
          </div>
        )}

        {showNoTaskPrompt && !fullNextTask ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            No next task is scheduled.{" "}
            <button
              type="button"
              onClick={openAddTask}
              className="font-semibold text-[#c1121f] hover:underline"
            >
              Add one now?
            </button>
          </div>
        ) : null}
      </section>

      <section className="max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#192a3a]">Change stage</h3>
        <label className="mt-3 block text-sm font-medium">Pipeline stage</label>
        <select
          value={pipelineStage}
          disabled={saving}
          onChange={(e) => {
            const stage = e.target.value as PipelineStage;
            setPipelineStage(stage);
            void savePipelineStage(stage);
          }}
          className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {PIPELINE_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        {pipelineStage === "closed_lost" || org.pipeline_stage === "closed_lost" ? (
          <input
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Reason (required for Closed / Not Now)"
            className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm"
          />
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => openQuickAction("change_pipeline", actionContext, refreshAll)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <Calendar className="h-4 w-4" /> Quick change
          </button>
        </div>
        {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
        {success ? <p className="mt-2 text-sm text-emerald-700">{success}</p> : null}
      </section>
    </div>
  );
}
