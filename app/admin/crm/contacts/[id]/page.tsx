"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { crmDb } from "@/lib/space-place/db";
import { displayName, formatDueDate } from "@/lib/space-place/format";
import type {
  CrmContact,
  CrmOrganisation,
  CrmEngagement,
  CrmTask,
  CrmProfile,
  CrmEmailMessageWithRelations,
} from "@/lib/space-place/types";
import { EditContactPanel } from "@/app/space-place/components/EditContactPanel";
import { ContactActionBar } from "@/app/space-place/components/ContactActionBar";
import { ContactEmailActions } from "@/app/space-place/components/ContactEmailActions";
import { TaskCard } from "@/app/space-place/components/TaskCard";
import { CrmTimeline } from "@/app/components/crm-desktop/CrmTimeline";
import { CrmEmailList } from "@/app/space-place/components/CrmEmailList";
import { CrmPipelineBadge } from "@/app/components/crm-desktop/CrmStatusBadge";
import { useCrmQuickAction } from "@/app/components/crm-desktop/CrmQuickActionProvider";
import { CrmMarketplaceListingsSection } from "@/app/space-place/components/CrmMarketplaceListingsSection";
import { dedupeActiveSpacers } from "@/lib/space-place/spacers";
import { resolveNextCrmTaskForContact } from "@/lib/space-place/next-task";

function ContactDetailInner() {
  const params = useParams();
  const id = params.id as string;
  const { profile, isAdmin, canViewAllOrganisations } = useSpacePlace();
  const { openQuickMenu } = useCrmQuickAction();
  const [contact, setContact] = useState<CrmContact | null>(null);
  const [org, setOrg] = useState<CrmOrganisation | null>(null);
  const [engagements, setEngagements] = useState<CrmEngagement[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [emails, setEmails] = useState<CrmEmailMessageWithRelations[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: c } = await crmDb.contacts().select("*").eq("id", id).single();
    const row = c as CrmContact | null;
    setContact(row);
    if (!row) return;

    const [o, e, em, t, p] = await Promise.all([
      crmDb.organisations().select("*").eq("id", row.organisation_id).single(),
      crmDb
        .engagements()
        .select("*")
        .eq("contact_id", id)
        .order("occurred_at", { ascending: false }),
      crmDb
        .emailMessages()
        .select(`*, crm_contacts ( id, full_name, email ), crm_organisations ( id, name )`)
        .eq("contact_id", id)
        .order("sent_at", { ascending: false })
        .limit(50),
      crmDb.tasks().select("*").eq("contact_id", id).order("due_date"),
      crmDb.profiles().select("*").eq("active", true).order("full_name"),
    ]);

    setOrg((o.data as CrmOrganisation) || null);
    setEngagements((e.data as CrmEngagement[]) || []);
    setEmails((em.data as CrmEmailMessageWithRelations[]) || []);
    setTasks((t.data as CrmTask[]) || []);
    setSpacers((p.data as CrmProfile[]) || []);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
  }, [load]);

  const roster = useMemo(() => dedupeActiveSpacers(spacers), [spacers]);
  const nextTask = useMemo(
    () => resolveNextCrmTaskForContact(tasks, id),
    [tasks, id]
  );

  if (!contact) {
    return <p className="text-sm text-gray-500">Loading contact…</p>;
  }

  const name = displayName(
    contact.full_name,
    contact.first_name,
    contact.last_name
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-gray-500">Contact</p>
            <h2 className="text-2xl font-semibold">{name}</h2>
            <p className="mt-1 text-sm text-gray-600">{contact.role || "No role"}</p>
            {org ? (
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Organisation</p>
                <Link
                  href={`/admin/crm/organisations/${org.id}`}
                  className="text-lg font-medium text-[#c1121f] hover:underline"
                >
                  {org.name}
                </Link>
                <div className="mt-1">
                  <CrmPipelineBadge stage={org.pipeline_stage} />
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              type="button"
              onClick={() =>
                openQuickMenu(
                  {
                    organisationId: contact.organisation_id,
                    organisationName: org?.name,
                    contactId: contact.id,
                    contactName: name,
                    pipelineStage: org?.pipeline_stage,
                    assignedTo: contact.assigned_to,
                    taskId: nextTask?.id,
                    taskTitle: nextTask?.title,
                  },
                  load
                )
              }
              className="rounded-lg bg-[#c1121f] px-3 py-2 text-sm text-white"
            >
              Quick actions
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-gray-500">Email</p>
            {contact.email ? (
              <ContactEmailActions email={contact.email} contactId={contact.id} />
            ) : (
              <p className="text-sm text-gray-500">No email</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Phone</p>
            <ContactActionBar phone={contact.phone} whatsapp={contact.whatsapp} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Next action</p>
            <p className="text-sm font-medium">{nextTask?.title || "None"}</p>
            {nextTask?.due_date ? (
              <p className="text-sm text-gray-500">
                {formatDueDate(nextTask.due_date)}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="font-semibold">Emails</h3>
        <div className="mt-3">
          <CrmEmailList emails={emails} adminLinks />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="font-semibold">Activity timeline</h3>
        <div className="mt-3">
          <CrmTimeline
            engagements={engagements.map((e) => ({ ...e, contact }))}
            tasks={tasks}
            emails={emails}
            organisationName={org?.name}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-semibold">Tasks</h3>
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={{
              ...t,
              crm_organisations: org
                ? { id: org.id, name: org.name, pipeline_stage: org.pipeline_stage }
                : null,
              crm_contacts: contact,
              owner_profile: t.owner_id
                ? {
                    id: t.owner_id,
                    full_name:
                      spacers.find((s) => s.id === t.owner_id)?.full_name || null,
                  }
                : null,
            }}
            onUpdated={load}
            assignees={roster}
            profileId={profile?.id}
            organisations={org ? [org] : []}
            contacts={[contact]}
          />
        ))}
      </section>

      <CrmMarketplaceListingsSection
        mode="contact"
        entityId={contact.id}
        organisationName={org?.name}
        organisationId={contact.organisation_id}
      />

      {profile ? (
        <EditContactPanel
          contact={contact}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={(updated, updatedOrg) => {
            setContact(updated);
            if (updatedOrg) setOrg(updatedOrg);
          }}
          isAdmin={isAdmin}
          canViewAllOrganisations={canViewAllOrganisations}
          userId={profile.id}
        />
      ) : null}

      <Link
        href={`/space-place/contacts/${id}`}
        className="text-sm text-gray-500 hover:text-[#c1121f]"
      >
        Open mobile contact view
      </Link>
    </div>
  );
}

export default function CrmContactDetailPage() {
  return <ContactDetailInner />;
}
