"use client";
import { crmDb } from "@/lib/space-place/db";

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDueDate } from "@/lib/space-place/format";
import type { CrmTaskWithRelations } from "@/lib/space-place/types";
import { Card } from "./SpacePlaceShell";
import { ContactActionBar } from "./ContactActionBar";

export function TaskCard({
  task,
  onUpdated,
}: {
  task: CrmTaskWithRelations;
  onUpdated?: () => void;
}) {
  const orgName = task.crm_organisations?.name;
  const contact = task.crm_contacts;
  const owner = task.owner_profile?.full_name;

  async function markDone() {
    const { error } = await crmDb.tasks()
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    if (!error) onUpdated?.();
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
