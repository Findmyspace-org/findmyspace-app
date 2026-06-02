"use client";
import { crmDb } from "@/lib/space-place/db";
import { useState } from "react";

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDueDate } from "@/lib/space-place/format";
import type { CrmProfile, CrmTaskWithRelations } from "@/lib/space-place/types";
import { Card } from "./SpacePlaceShell";
import { ContactActionBar } from "./ContactActionBar";
import { formatSpacerOptionLabel } from "@/lib/space-place/spacers";

export function TaskCard({
  task,
  onUpdated,
  assignees = [],
}: {
  task: CrmTaskWithRelations;
  onUpdated?: () => void;
  assignees?: CrmProfile[];
}) {
  const orgName = task.crm_organisations?.name;
  const contact = task.crm_contacts;
  const owner = task.owner_profile?.full_name;
  const [reassigning, setReassigning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function markDone() {
    const { error } = await crmDb.tasks()
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    if (!error) onUpdated?.();
  }

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
                  {formatSpacerOptionLabel(profile, assignees)}
                </option>
              ))}
            </select>
            {message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null}
          </div>
        ) : null}
        <ContactActionBar
          phone={contact?.phone}
          whatsapp={contact?.whatsapp}
          email={contact?.email}
          showDone={task.status === "open"}
          onDone={markDone}
        />
      </div>
    </Card>
  );
}
