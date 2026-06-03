"use client";
import { useState } from "react";

import Link from "next/link";
import { canReassignCrmTasks } from "@/lib/space-place/access";
import { formatDueDate } from "@/lib/space-place/format";
import type {
  CrmContact,
  CrmOrganisation,
  CrmProfile,
  CrmTaskWithRelations,
} from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import { Card } from "./SpacePlaceShell";
import { ContactActionBar } from "./ContactActionBar";
import { CompleteTaskPanel } from "./CompleteTaskPanel";
import { EditTaskPanel } from "./EditTaskPanel";
import {
  TaskReassignControl,
  type TaskReassignResult,
} from "./TaskReassignControl";

export function TaskCard({
  task,
  onUpdated,
  onReassigned,
  assignees = [],
  profileId,
  organisations = [],
  contacts = [],
  showOwner = true,
}: {
  task: CrmTaskWithRelations;
  onUpdated?: () => void;
  /** Optimistic list updates (e.g. Today view filters). Falls back to onUpdated. */
  onReassigned?: (result: TaskReassignResult) => void;
  assignees?: CrmProfile[];
  profileId?: string;
  organisations?: CrmOrganisation[];
  contacts?: CrmContact[];
  /** When false, hides assignee badge (e.g. Today → My activities). */
  showOwner?: boolean;
}) {
  const { profile } = useSpacePlace();
  const canReassign = profile ? canReassignCrmTasks(profile.role) : false;
  const orgName = task.crm_organisations?.name;
  const contact = task.crm_contacts;
  const owner = task.owner_profile?.full_name;
  const [completeOpen, setCompleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const cardTask: CrmTaskWithRelations = {
    ...task,
    crm_organisations:
      task.crm_organisations ||
      (task.organisation_id
        ? organisations.find((o) => o.id === task.organisation_id) || null
        : null),
    crm_contacts:
      task.crm_contacts ||
      (task.contact_id ? contacts.find((c) => c.id === task.contact_id) || null : null),
  };

  function handleReassigned(result: TaskReassignResult) {
    if (onReassigned) {
      onReassigned(result);
    } else {
      onUpdated?.();
    }
  }

  return (
    <Card className="mb-3">
      <Link href={task.organisation_id ? `/space-place/organisations/${task.organisation_id}` : "#"}>
        <p className="text-lg font-semibold">{task.title}</p>
      </Link>
      {orgName ? (
        <p className="mt-1 text-sm text-neutral-600">{orgName}</p>
      ) : null}
      {contact?.full_name ? (
        <p className="text-sm text-neutral-500">{contact.full_name}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium">
          {formatDueDate(task.due_date)}
        </span>
        <span
          className={`rounded-full px-3 py-1 capitalize ${
            task.priority === "high"
              ? "bg-red-100 font-semibold text-red-900"
              : task.priority === "low"
                ? "bg-neutral-50 text-neutral-600"
                : "bg-neutral-100"
          }`}
        >
          {task.priority}
        </span>
        {showOwner && owner ? (
          <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-900">
            {owner}
          </span>
        ) : null}
        <span className="rounded-full bg-neutral-100 px-3 py-1 capitalize">
          {task.status}
        </span>
      </div>
      <div className="mt-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {task.status === "open" ? (
            <button
              type="button"
              onClick={() => setCompleteOpen(true)}
              className="min-h-[44px] flex-1 rounded-xl bg-[#c1121f] px-3 py-2 text-sm font-semibold text-white sm:flex-none"
            >
              Done
            </button>
          ) : null}
          {task.status === "open" && canReassign && profileId && assignees.length > 0 ? (
            <TaskReassignControl
              taskId={task.id}
              currentOwnerId={task.owner_id}
              assignees={assignees}
              currentUserId={profileId}
              onReassigned={handleReassigned}
            />
          ) : null}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="min-h-[44px] flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 sm:flex-none"
          >
            Edit
          </button>
        </div>
        <ContactActionBar
          phone={contact?.phone}
          whatsapp={contact?.whatsapp}
          email={contact?.email}
          contactId={task.contact_id || contact?.id}
          showDone={false}
        />
      </div>

      {task.status === "open" && profileId ? (
        <CompleteTaskPanel
          open={completeOpen}
          task={cardTask}
          profileId={profileId}
          assignees={assignees}
          onClose={() => setCompleteOpen(false)}
          onSaved={() => onUpdated?.()}
        />
      ) : null}

      <EditTaskPanel
        open={editOpen}
        task={cardTask}
        organisations={organisations}
        contacts={contacts}
        assignees={assignees}
        onClose={() => setEditOpen(false)}
        onSaved={() => onUpdated?.()}
      />
    </Card>
  );
}
