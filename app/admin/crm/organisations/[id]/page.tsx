"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { crmDb } from "@/lib/space-place/db";
import {
  dedupeActiveSpacers,
} from "@/lib/space-place/spacers";
import type {
  CrmContact,
  CrmOrganisation,
  CrmProfile,
  CrmTask,
  CrmEmailMessageWithRelations,
} from "@/lib/space-place/types";
import { EditOrganisationPanel } from "@/app/space-place/components/EditOrganisationPanel";
import { CreateContactPanel } from "@/app/space-place/components/CreateContactPanel";
import { TaskCard } from "@/app/space-place/components/TaskCard";
import { SpacerSelect } from "@/app/space-place/components/SpacerSelect";
import {
  type SpaceEngagementRow,
} from "@/app/space-place/components/SpaceActivityHistory";
import { CrmEmailList } from "@/app/space-place/components/CrmEmailList";
import { CrmMarketplaceListingsSection } from "@/app/space-place/components/CrmMarketplaceListingsSection";
import { CrmOrganisationContactRow } from "@/app/components/crm-desktop/CrmOrganisationContactRow";
import { adminApiFetch } from "@/lib/admin-api-client";
import { CrmOverdueBadge, CrmPipelineBadge } from "@/app/components/crm-desktop/CrmStatusBadge";
import { CrmTimeline } from "@/app/components/crm-desktop/CrmTimeline";
import { useCrmQuickAction } from "@/app/components/crm-desktop/CrmQuickActionProvider";
import { formatDueDate } from "@/lib/space-place/format";
import { getCrmCaptureEmail } from "@/lib/space-place/crm-email";
import {
  isCrmTaskOverdue,
  resolveNextCrmTaskForOrganisation,
} from "@/lib/space-place/next-task";
import { CrmOrganisationPipelineTab } from "@/app/components/crm-desktop/CrmOrganisationPipelineTab";
import {
  CrmCompletedActionsPanel,
  CrmCompletedActionsSummaryCard,
} from "@/app/components/crm-desktop/CrmCompletedActionsPanel";

const TABS = [
  "overview",
  "contacts",
  "spaces",
  "pipeline",
  "activities",
  "completed",
  "notes",
  "communication",
] as const;

type Tab = (typeof TABS)[number];

function OrganisationDetailInner() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "overview";
  const { isAdmin, canViewAllOrganisations, profile } = useSpacePlace();
  const { openQuickMenu } = useCrmQuickAction();

  const [org, setOrg] = useState<CrmOrganisation | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<SpaceEngagementRow[]>([]);
  const [emails, setEmails] = useState<CrmEmailMessageWithRelations[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(
    searchParams.get("add") === "1" && tab === "contacts"
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [o, c, t, e, em, p] = await Promise.all([
      crmDb.organisations().select("*").eq("id", id).single(),
      crmDb.contacts().select("*").eq("organisation_id", id),
      crmDb.tasks().select("*").eq("organisation_id", id).order("due_date"),
      crmDb
        .engagements()
        .select(`*, crm_contacts ( id, full_name, first_name, last_name )`)
        .eq("organisation_id", id)
        .order("occurred_at", { ascending: false }),
      crmDb
        .emailMessages()
        .select(`*, crm_contacts ( id, full_name, email ), crm_organisations ( id, name )`)
        .eq("organisation_id", id)
        .order("sent_at", { ascending: false })
        .limit(50),
      crmDb.profiles().select("*").eq("active", true).order("full_name"),
    ]);

    const row = o.data as CrmOrganisation | null;
    setOrg(row);
    setNotes(row?.notes || "");
    setContacts((c.data as CrmContact[]) || []);
    setTasks((t.data as CrmTask[]) || []);
    setSpacers((p.data as CrmProfile[]) || []);

    const { data: profs } = await crmDb.profiles().select("id, full_name");
    const creatorMap = Object.fromEntries(
      ((profs as { id: string; full_name: string | null }[]) || []).map((x) => [
        x.id,
        x.full_name,
      ])
    );

    setEngagements(
      ((e.data as SpaceEngagementRow[]) || []).map((eng) => ({
        ...eng,
        contact: eng.crm_contacts ?? null,
        creator: eng.created_by
          ? { id: eng.created_by, full_name: creatorMap[eng.created_by] ?? null }
          : null,
      }))
    );
    setEmails((em.data as CrmEmailMessageWithRelations[]) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
  }, [load]);

  const roster = useMemo(() => dedupeActiveSpacers(spacers), [spacers]);
  const sortedContacts = useMemo(
    () =>
      [...contacts].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [contacts]
  );
  const primaryContactId = org?.primary_contact_id ?? null;
  const primaryContact =
    sortedContacts.find((c) => c.id === primaryContactId) ?? null;
  const nextTask = useMemo(
    () => resolveNextCrmTaskForOrganisation(tasks, id, primaryContact?.id),
    [tasks, id, primaryContact?.id]
  );
  const openTasks = tasks.filter((t) => t.status === "open");
  const latestEngagement = engagements[0] ?? null;

  const assignedName =
    roster.find((s) => s.id === org?.assigned_to)?.full_name || "Unassigned";

  function setTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.push(`/admin/crm/organisations/${id}?${params.toString()}`);
  }

  async function updateField(patch: Partial<CrmOrganisation>) {
    if (!org) return;
    const { error } = await crmDb.organisations().update(patch).eq("id", org.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  }

  async function saveNotes() {
    if (!org) return;
    const { error } = await crmDb.organisations().update({ notes }).eq("id", org.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  }

  async function setPrimaryContact(contactId: string | null) {
    if (!org) return;
    const result = await adminApiFetch(
      `/api/admin/crm/desktop/organisations/${org.id}/primary-contact`,
      {
        method: "POST",
        body: JSON.stringify({ contactId }),
      }
    );
    if (!result.ok) {
      setMessage(
        typeof result.error === "string"
          ? result.error
          : "Failed to update primary contact."
      );
      return;
    }
    setOrg((current) =>
      current ? { ...current, primary_contact_id: contactId } : current
    );
    await load();
  }

  if (loading && !org) {
    return <p className="text-sm text-gray-500">Loading organisation…</p>;
  }

  if (!org) {
    return <p className="text-sm text-red-600">Organisation not found.</p>;
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {message}
        </p>
      ) : null}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Organisation
            </p>
            <h2 className="text-2xl font-semibold text-[#192a3a]">{org.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {org.type ? (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs capitalize">
                  {org.type}
                </span>
              ) : null}
              <CrmPipelineBadge stage={org.pipeline_stage} />
            </div>
            <p className="mt-2 text-sm text-gray-600">{org.address || "No location"}</p>
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
              onClick={() => setCreateContactOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <Plus className="h-4 w-4" /> Contact
            </button>
            <button
              type="button"
              onClick={() =>
                openQuickMenu(
                  {
                    organisationId: org.id,
                    organisationName: org.name,
                    contactId: primaryContact?.id,
                    contactName:
                      primaryContact?.full_name ||
                      primaryContact?.first_name ||
                      undefined,
                    pipelineStage: org.pipeline_stage,
                    assignedTo: org.assigned_to,
                    taskId: nextTask?.id,
                    taskTitle: nextTask?.title,
                  },
                  load
                )
              }
              className="inline-flex items-center gap-1 rounded-lg bg-[#c1121f] px-3 py-2 text-sm text-white"
            >
              Quick actions
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">Relationship owner</p>
            {isAdmin ? (
              <SpacerSelect
                value={org.assigned_to || ""}
                onChange={(value) =>
                  void updateField({ assigned_to: value || null })
                }
                spacers={spacers}
              />
            ) : (
              <p className="font-medium">{assignedName}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Primary contact</p>
            {primaryContact ? (
              <Link
                href={`/admin/crm/contacts/${primaryContact.id}`}
                className="font-medium text-[#c1121f] hover:underline"
              >
                {primaryContact.full_name || primaryContact.first_name}
              </Link>
            ) : (
              <p className="text-gray-500">None</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Next action</p>
            <p className="font-medium">{nextTask?.title || "No open task"}</p>
            {nextTask?.due_date ? (
              <p className="text-sm text-gray-500">
                {formatDueDate(nextTask.due_date)}
                {isCrmTaskOverdue(nextTask.due_date, nextTask.status) ? (
                  <span className="ml-2">
                    <CrmOverdueBadge />
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-gray-500">Latest interaction</p>
            <p className="text-sm">
              {latestEngagement?.summary || "No activity yet"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              tab === t
                ? "bg-[#192a3a] text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t === "completed" ? "Completed actions" : t}
          </button>
        ))}
        <Link
          href={`/space-place/organisations/${id}`}
          className="ml-auto text-sm text-gray-500 hover:text-[#c1121f]"
        >
          Open mobile view
        </Link>
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="font-semibold">Summary</h3>
            <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">
              {org.notes || "No summary notes yet."}
            </p>
          </section>
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="font-semibold">Open tasks</h3>
            {openTasks.slice(0, 3).map((t) => (
              <p key={t.id} className="mt-2 text-sm">
                {t.title} · {t.due_date ? formatDueDate(t.due_date) : "No date"}
              </p>
            ))}
            {!openTasks.length ? (
              <p className="mt-2 text-sm text-gray-500">No open tasks.</p>
            ) : null}
          </section>
          <CrmCompletedActionsSummaryCard
            organisationId={org.id}
            onViewAll={() => setTab("completed")}
          />
        </div>
      ) : null}

      {tab === "completed" ? (
        <CrmCompletedActionsPanel organisationId={org.id} />
      ) : null}

      {tab === "contacts" ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setCreateContactOpen(true)}
            className="mb-2 rounded-lg border border-[#c1121f] px-4 py-2 text-sm font-medium text-[#c1121f]"
          >
            Add contact
          </button>
          <div className="space-y-2">
            {sortedContacts.map((c) => (
              <CrmOrganisationContactRow
                key={c.id}
                contact={c}
                isPrimary={Boolean(primaryContactId && c.id === primaryContactId)}
                canManagePrimary={isAdmin}
                onSetPrimary={setPrimaryContact}
              />
            ))}
          </div>
        </div>
      ) : null}

      {tab === "spaces" ? (
        <CrmMarketplaceListingsSection
          mode="organisation"
          entityId={org.id}
          organisationName={org.name}
        />
      ) : null}

      {tab === "pipeline" && profile ? (
        <CrmOrganisationPipelineTab
          org={org}
          contacts={contacts}
          tasks={tasks}
          engagements={engagements}
          assignees={roster}
          assignedName={assignedName}
          profileId={profile.id}
          onRefresh={load}
        />
      ) : null}

      {tab === "activities" ? (
        <div className="space-y-4">
          <CrmTimeline
            engagements={engagements}
            tasks={tasks}
            emails={emails}
            organisationName={org.name}
            loading={loading}
          />
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={{
                ...t,
                crm_organisations: {
                  id: org.id,
                  name: org.name,
                  pipeline_stage: org.pipeline_stage,
                },
                crm_contacts: t.contact_id
                  ? contacts.find((c) => c.id === t.contact_id) || null
                  : null,
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
              organisations={[org]}
              contacts={contacts}
            />
          ))}
        </div>
      ) : null}

      {tab === "notes" ? (
        <div className="max-w-2xl">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-gray-200 p-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void saveNotes()}
            className="mt-2 rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white"
          >
            Save notes
          </button>
        </div>
      ) : null}

      {tab === "communication" ? (
        <div>
          <p className="mb-3 text-sm text-gray-600">
            Emails logged via BCC to {getCrmCaptureEmail()}.
          </p>
          <CrmEmailList emails={emails} />
        </div>
      ) : null}

      <EditOrganisationPanel
        organisation={org}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setOrg(updated);
          setNotes(updated.notes || "");
        }}
        isAdmin={isAdmin}
        spacers={spacers}
      />

      {profile ? (
        <CreateContactPanel
          open={createContactOpen}
          onClose={() => setCreateContactOpen(false)}
          onCreated={(created) => {
            setContacts((prev) => [...prev, created]);
          }}
          isAdmin={isAdmin}
          canViewAllOrganisations={canViewAllOrganisations}
          userId={profile.id}
          defaultOrganisationId={org.id}
        />
      ) : null}
    </div>
  );
}

export default function CrmOrganisationDetailPage() {
  return <OrganisationDetailInner />;
}
