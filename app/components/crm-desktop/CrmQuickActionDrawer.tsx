"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Mail,
  MessageSquare,
  Phone,
  User,
  Users,
} from "lucide-react";
import { crmDb } from "@/lib/space-place/db";
import {
  ENGAGEMENT_TYPES,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  TASK_PRIORITIES,
  type PipelineStage,
} from "@/lib/space-place/constants";
import {
  completeCrmTask,
  createCrmTask,
  logCrmInteraction,
  updateCrmOrganisationAssignee,
  updateCrmPipelineStage,
  updateCrmTask,
} from "@/lib/space-place/crm-mutations";
import {
  DEFAULT_TASK_OUTCOME,
  TASK_OUTCOME_OPTIONS,
  getSuggestedPipelineStage,
} from "@/lib/space-place/task-outcomes";
import { formatSpacerOptionLabel } from "@/lib/space-place/spacers";
import type { CrmContact, CrmProfile, CrmTask } from "@/lib/space-place/types";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { useCrmRefresh } from "@/lib/crm-desktop/crm-refresh";
import { CrmDesktopDrawer } from "./CrmDesktopDrawer";
import type { CrmActionContext, CrmQuickActionType } from "./CrmQuickActionProvider";

const MENU_ACTIONS: {
  action: CrmQuickActionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  needsOrg?: boolean;
}[] = [
  { action: "add_note", label: "Add note", icon: MessageSquare, needsOrg: true },
  { action: "log_call", label: "Log phone call", icon: Phone, needsOrg: true },
  { action: "log_email", label: "Log email", icon: Mail, needsOrg: true },
  { action: "log_meeting", label: "Log meeting", icon: Users, needsOrg: true },
  { action: "add_task", label: "Add task", icon: ClipboardList, needsOrg: true },
  {
    action: "schedule_followup",
    label: "Schedule follow-up",
    icon: Calendar,
    needsOrg: true,
  },
  { action: "complete_task", label: "Complete task", icon: CheckCircle2 },
  {
    action: "change_pipeline",
    label: "Change pipeline stage",
    icon: Building2,
    needsOrg: true,
  },
  { action: "assign_owner", label: "Assign CRM owner", icon: User, needsOrg: true },
];

function tomorrowDateInput(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function localDateTimeInput(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

type Props = {
  action: CrmQuickActionType;
  context: CrmActionContext;
  onClose: () => void;
  onSuccess: () => void;
};

export function CrmQuickActionDrawer({
  action: initialAction,
  context,
  onClose,
  onSuccess,
}: Props) {
  const { profile } = useSpacePlace();
  const { invalidate } = useCrmRefresh();
  const [action, setAction] = useState(initialAction);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<CrmProfile[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [task, setTask] = useState<CrmTask | null>(null);

  const organisationId = context.organisationId;
  const contactId = context.contactId;
  const taskId = context.taskId;

  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeInput());
  const [selectedContactId, setSelectedContactId] = useState(contactId || "");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(tomorrowDateInput());
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskOwnerId, setTaskOwnerId] = useState(profile?.id || "");
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>(
    (context.pipelineStage as PipelineStage) || "prospect"
  );
  const [lostReason, setLostReason] = useState("");
  const [assignedTo, setAssignedTo] = useState(context.assignedTo || "");

  const [outcomeValue, setOutcomeValue] = useState(DEFAULT_TASK_OUTCOME);
  const [extraNotes, setExtraNotes] = useState("");
  const [applyPipelineUpdate, setApplyPipelineUpdate] = useState(true);
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDescription, setFollowUpDescription] = useState("");
  const [followUpDueDate, setFollowUpDueDate] = useState(tomorrowDateInput());
  const [followUpPriority, setFollowUpPriority] = useState("normal");
  const [followUpOwnerId, setFollowUpOwnerId] = useState(profile?.id || "");

  useEffect(() => {
    setAction(initialAction);
    setError(null);
    setSuccess(null);
    setSummary("");
    setOccurredAt(localDateTimeInput());
    setSelectedContactId(contactId || "");
    setTaskTitle(
      initialAction === "schedule_followup"
        ? `Follow up with ${context.contactName || context.organisationName || "contact"}`
        : initialAction === "add_task"
          ? context.prefillTaskTitle || ""
          : ""
    );
    setTaskDescription(context.prefillTaskDescription || "");
    setTaskDueDate(tomorrowDateInput());
    setTaskOwnerId(context.assignedTo || profile?.id || "");
    setPipelineStage((context.pipelineStage as PipelineStage) || "prospect");
    setAssignedTo(context.assignedTo || "");
    setFollowUpTitle(
      context.contactName
        ? `Follow up with ${context.contactName}`
        : `Follow up with ${context.organisationName || "organisation"}`
    );
    setFollowUpOwnerId(context.assignedTo || profile?.id || "");
  }, [initialAction, context, contactId, profile?.id]);

  useEffect(() => {
    void crmDb
      .profiles()
      .select("*")
      .eq("active", true)
      .order("full_name")
      .then((res: { data: CrmProfile[] | null }) =>
        setAssignees(res.data || [])
      );
  }, []);

  useEffect(() => {
    if (!organisationId) {
      setContacts([]);
      return;
    }
    void crmDb
      .contacts()
      .select("*")
      .eq("organisation_id", organisationId)
      .order("created_at")
      .then((res: { data: CrmContact[] | null }) => setContacts(res.data || []));
  }, [organisationId]);

  useEffect(() => {
    if (!taskId || !["complete_task", "edit_task"].includes(action)) {
      setTask(null);
      return;
    }
    void crmDb
      .tasks()
      .select("*")
      .eq("id", taskId)
      .single()
      .then((res: { data: CrmTask | null }) => {
        setTask(res.data);
        if (res.data && action === "edit_task") {
          setTaskTitle(res.data.title);
          setTaskDescription(res.data.description || "");
          setTaskDueDate(res.data.due_date || tomorrowDateInput());
          setTaskPriority(res.data.priority || "normal");
          setTaskOwnerId(res.data.owner_id || profile?.id || "");
          setSelectedContactId(res.data.contact_id || contactId || "");
        }
      });
  }, [taskId, action, contactId, profile?.id]);

  const engagementType = useMemo(() => {
    if (action === "add_note") return "note";
    if (action === "log_call") return "call";
    if (action === "log_email") return "email";
    if (action === "log_meeting") return "meeting";
    return "note";
  }, [action]);

  const suggestedPipelineStage = useMemo(
    () => getSuggestedPipelineStage(outcomeValue),
    [outcomeValue]
  );

  const title = useMemo(() => {
    const map: Record<CrmQuickActionType, string> = {
      menu: "Quick actions",
      add_note: "Add note",
      log_call: "Log phone call",
      log_email: "Log email",
      log_meeting: "Log meeting",
      add_task: "Add task",
      schedule_followup: "Schedule follow-up",
      complete_task: "Complete task",
      edit_task: "Update task",
      change_pipeline: "Change pipeline stage",
      assign_owner: "Assign CRM owner",
    };
    return map[action];
  }, [action]);

  const subtitle = useMemo(() => {
    const parts = [
      context.organisationName,
      context.contactName,
      context.taskTitle,
    ].filter(Boolean);
    return parts.join(" · ") || undefined;
  }, [context]);

  async function handleSave() {
    if (!profile) {
      setError("Not signed in.");
      return;
    }
    if (saving) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (
        ["add_note", "log_call", "log_email", "log_meeting"].includes(action)
      ) {
        if (!organisationId) {
          setError("Organisation is required.");
          return;
        }
        if (!summary.trim()) {
          setError("Summary is required.");
          return;
        }
        const { error: logErr } = await logCrmInteraction({
          organisationId,
          contactId: selectedContactId || null,
          type: engagementType,
          summary,
          occurredAt: new Date(occurredAt).toISOString(),
          createdBy: profile.id,
        });
        if (logErr) {
          setError(logErr);
          return;
        }
        setSuccess("Interaction saved.");
      } else if (action === "add_task" || action === "schedule_followup") {
        if (!organisationId) {
          setError("Organisation is required.");
          return;
        }
        if (!taskTitle.trim()) {
          setError("Task title is required.");
          return;
        }
        if (!taskOwnerId) {
          setError("Assignee is required.");
          return;
        }
        const { error: createErr } = await createCrmTask({
          organisationId,
          contactId: selectedContactId || contactId || null,
          title: taskTitle,
          description: taskDescription,
          dueDate: taskDueDate,
          priority: taskPriority,
          ownerId: taskOwnerId,
        });
        if (createErr) {
          setError(createErr);
          return;
        }
        setSuccess("Task created.");
      } else if (action === "edit_task") {
        if (!task) {
          setError("Task not found.");
          return;
        }
        if (!taskTitle.trim()) {
          setError("Task title is required.");
          return;
        }
        if (!taskOwnerId) {
          setError("Assignee is required.");
          return;
        }
        const { error: updateErr } = await updateCrmTask({
          taskId: task.id,
          title: taskTitle,
          description: taskDescription,
          dueDate: taskDueDate,
          priority: taskPriority,
          ownerId: taskOwnerId,
          contactId: selectedContactId || null,
        });
        if (updateErr) {
          setError(updateErr);
          return;
        }
        setSuccess("Task updated.");
      } else if (action === "complete_task") {
        if (!task) {
          setError("Task not found.");
          return;
        }
        const { error: completeErr } = await completeCrmTask({
          taskId: task.id,
          organisationId: task.organisation_id,
          contactId: task.contact_id,
          taskTitle: task.title,
          profileId: profile.id,
          outcomeValue,
          extraNotes,
          applyPipelineUpdate,
          currentPipelineStage:
            (context.pipelineStage as PipelineStage) || null,
          createFollowUp,
          followUpTitle,
          followUpDescription,
          followUpDueDate,
          followUpPriority,
          followUpOwnerId: followUpOwnerId || task.owner_id || profile.id,
        });
        if (completeErr) {
          setError(completeErr);
          return;
        }
        setSuccess(
          createFollowUp
            ? "Task completed and follow-up created."
            : "Task completed."
        );
      } else if (action === "change_pipeline") {
        if (!organisationId) {
          setError("Organisation is required.");
          return;
        }
        if (pipelineStage === "closed_lost" && !lostReason.trim()) {
          setError("Reason is required for Closed / Not Now.");
          return;
        }
        const { error: stageErr } = await updateCrmPipelineStage({
          organisationId,
          pipelineStage,
          lostReason,
          previousStage:
            (context.pipelineStage as PipelineStage | null | undefined) ?? null,
          profileId: profile.id,
          contactId: selectedContactId || contactId || null,
        });
        if (stageErr) {
          setError(stageErr);
          return;
        }
        setSuccess("Pipeline stage updated.");
      } else if (action === "assign_owner") {
        if (!organisationId) {
          setError("Organisation is required.");
          return;
        }
        const assigneeName =
          assignees.find((a) => a.id === assignedTo)?.full_name ?? null;
        const { error: assignErr } = await updateCrmOrganisationAssignee({
          organisationId,
          assignedTo: assignedTo || null,
          previousAssignedTo: context.assignedTo ?? null,
          assigneeName,
          profileId: profile.id,
          contactId: selectedContactId || contactId || null,
        });
        if (assignErr) {
          setError(assignErr);
          return;
        }
        setSuccess("Owner updated.");
      }

      invalidate();
      onSuccess();
      setTimeout(() => onClose(), 500);
    } finally {
      setSaving(false);
    }
  }

  const showContactPicker =
    contacts.length > 1 &&
    ["add_note", "log_call", "log_email", "log_meeting", "add_task", "schedule_followup", "edit_task"].includes(
      action
    );

  return (
    <CrmDesktopDrawer
      open
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      saving={saving}
      error={error}
      success={success}
      footer={
        action === "menu" ? null : (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 rounded-lg bg-[#c1121f] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )
      }
    >
      {action === "menu" ? (
        <div className="space-y-2">
          {context.organisationId ? (
            <Link
              href={`/admin/crm/organisations/${context.organisationId}`}
              className="mb-3 block text-sm text-[#c1121f] hover:underline"
              onClick={onClose}
            >
              Open organisation
            </Link>
          ) : null}
          {context.contactId ? (
            <Link
              href={`/admin/crm/contacts/${context.contactId}`}
              className="mb-3 block text-sm text-[#c1121f] hover:underline"
              onClick={onClose}
            >
              Open contact
            </Link>
          ) : null}
          {MENU_ACTIONS.map((item) => {
            if (item.needsOrg && !organisationId) return null;
            if (item.action === "complete_task" && !taskId) return null;
            const Icon = item.icon;
            return (
              <button
                key={item.action}
                type="button"
                onClick={() => setAction(item.action)}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left text-sm hover:bg-gray-50"
              >
                <Icon className="h-4 w-4 text-gray-500" />
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {showContactPicker ? (
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-gray-600">Contact</span>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2"
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
          >
            <option value="">No specific contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || c.first_name} {c.role ? `(${c.role})` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {["add_note", "log_call", "log_email", "log_meeting"].includes(action) ? (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">When</span>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Summary</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              placeholder="What happened? Outcome and next steps?"
            />
          </label>
        </div>
      ) : null}

      {action === "add_task" || action === "schedule_followup" || action === "edit_task" ? (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Title</span>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Description</span>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Due date</span>
            <input
              type="date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Priority</span>
            <select
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Assigned to</span>
            <select
              value={taskOwnerId}
              onChange={(e) => setTaskOwnerId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            >
              <option value="">Select assignee</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatSpacerOptionLabel(a, assignees)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {action === "complete_task" && task ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            <p className="font-medium">{task.title}</p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Outcome</span>
            <select
              value={outcomeValue}
              onChange={(e) => setOutcomeValue(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            >
              {TASK_OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {suggestedPipelineStage &&
          suggestedPipelineStage !== context.pipelineStage ? (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={applyPipelineUpdate}
                onChange={(e) => setApplyPipelineUpdate(e.target.checked)}
                className="mt-0.5"
              />
              Update pipeline to {PIPELINE_STAGE_LABELS[suggestedPipelineStage]}
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Completion note</span>
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createFollowUp}
              onChange={(e) => setCreateFollowUp(e.target.checked)}
            />
            Create follow-up task
          </label>
          {createFollowUp ? (
            <div className="space-y-3 rounded-lg border border-gray-200 p-3">
              <input
                value={followUpTitle}
                onChange={(e) => setFollowUpTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Follow-up title"
              />
              <textarea
                value={followUpDescription}
                onChange={(e) => setFollowUpDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Description"
              />
              <input
                type="date"
                value={followUpDueDate}
                onChange={(e) => setFollowUpDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <select
                value={followUpOwnerId}
                onChange={(e) => setFollowUpOwnerId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {formatSpacerOptionLabel(a, assignees)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {action === "change_pipeline" ? (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Pipeline stage</span>
            <select
              value={pipelineStage}
              onChange={(e) => setPipelineStage(e.target.value as PipelineStage)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {PIPELINE_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {pipelineStage === "closed_lost" ? (
            <input
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Reason (required)"
            />
          ) : null}
        </div>
      ) : null}

      {action === "assign_owner" ? (
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">CRM owner</span>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2"
          >
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {formatSpacerOptionLabel(a, assignees)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </CrmDesktopDrawer>
  );
}
