"use client";
import { crmDb } from "@/lib/space-place/db";
import { useState } from "react";

import Link from "next/link";
import { formatDueDate } from "@/lib/space-place/format";
import type {
  CrmContact,
  CrmOrganisation,
  CrmProfile,
  CrmTaskWithRelations,
} from "@/lib/space-place/types";
import { Card } from "./SpacePlaceShell";
import { ContactActionBar } from "./ContactActionBar";
import { formatSpacerOptionLabel } from "@/lib/space-place/spacers";
import { CompleteTaskPanel } from "./CompleteTaskPanel";
import { EditTaskPanel } from "./EditTaskPanel";

export function TaskCard({
  task,
  onUpdated,
  assignees = [],
  profileId,
  organisations = [],
  contacts = [],
}: {
  task: CrmTaskWithRelations;
  onUpdated?: () => void;
  assignees?: CrmProfile[];
  profileId?: string;
  organisations?: CrmOrganisation[];
  contacts?: CrmContact[];
}) {
  const orgName = task.crm_organisations?.name;
  const contact = task.crm_contacts;
  const owner = task.owner_profile?.full_name;
  const [reassigning, setReassigning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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

  async function reassign(ownerId: string) {
    if (!ownerId || ownerId === task.owner_id) return;
    setReassigning(true);
    setMessage(null);
    const { error } = await crmDb.tasks().update({ owner_id: ownerId }).eq("id", task.id);
    setReassigning(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onUpdated?.();
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
        {owner ? (
          <span className="rounded-full bg-neutral-100 px-3 py-1">
            {owner}
          </span>
        ) : null}
        <span className="rounded-full bg-neutral-100 px-3 py-1 capitalize">
          {task.status}
        </span>
      </div>
      <div className="mt-3">
        {task.status === "open" && assignees.length > 0 ? (
          <div className="mb-3">
            <label className="text-xs font-semibold text-neutral-600">Assigned to</label>
            <select
              value={task.owner_id || ""}
              onChange={(e) => void reassign(e.target.value)}
              disabled={reassigning}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-sm disabled:opacity-60"
            >
              {assignees.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {formatSpacerOptionLabel(profile, assignees)} ({profile.role})
                </option>
              ))}
            </select>
            {message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null}
          </div>
        ) : null}
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {task.status === "open" ? (
            <button
              type="button"
              onClick={() => setCompleteOpen(true)}
              className="min-h-[44px] rounded-xl bg-[#c1121f] px-3 py-2 text-sm font-semibold text-white"
            >
              Done
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="min-h-[44px] rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800"
          >
            Edit
          </button>
        </div>
        <ContactActionBar
          phone={contact?.phone}
          whatsapp={contact?.whatsapp}
          email={contact?.email}
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
