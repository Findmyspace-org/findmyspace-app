"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  User,
} from "lucide-react";
import { crmDb } from "@/lib/space-place/db";
import type {
  CrmContact,
  CrmOrganisation,
  CrmProfile,
  CrmTask,
  CrmEmailMessageWithRelations,
} from "@/lib/space-place/types";
import { type SpaceEngagementRow } from "@/app/space-place/components/SpaceActivityHistory";
import { EditOrganisationPanel } from "@/app/space-place/components/EditOrganisationPanel";
import { CreateContactPanel } from "@/app/space-place/components/CreateContactPanel";
import { CrmMarketplaceListingsSection } from "@/app/space-place/components/CrmMarketplaceListingsSection";
import { CrmDesktopDrawer } from "./CrmDesktopDrawer";
import { CrmTimeline, type CrmTimelineItem } from "./CrmTimeline";
import { CrmOverdueBadge, CrmPipelineBadge } from "./CrmStatusBadge";
import { organisationRowToActionContext } from "./crm-action-context";
import { useCrmQuickAction } from "./CrmQuickActionProvider";
import { formatDueDate } from "@/lib/space-place/format";
import {
  isCrmTaskOverdue,
  resolveNextCrmTaskForOrganisation,
} from "@/lib/space-place/next-task";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { adminApiFetch } from "@/lib/admin-api-client";
import { setCrmOrganisationPrimaryContact } from "@/lib/crm-desktop/api-client";
import { patchOrganisationRowPrimaryContact } from "@/lib/crm-desktop/organisation-contact-status";
import { patchOrganisationRowFromTasks } from "@/lib/crm-desktop/patch-organisation-row-from-tasks";

import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";

type MarketingOrgSummary = {
  total: number;
  sendable: number;
  pending: number;
  blocked: number;
  lists: string[];
};

type Props = {
  row: CrmOrganisationListRow | null;
  onClose: () => void;
  onRefresh: () => void;
  onRowPatched?: (row: CrmOrganisationListRow) => void;
};

export function CrmPipelineCardDrawer({
  row,
  onClose,
  onRefresh,
  onRowPatched,
}: Props) {
  const { openQuickMenu, openQuickAction } = useCrmQuickAction();
  const { isAdmin, canViewAllOrganisations, profile, loading: profileLoading } =
    useSpacePlace();
  const [org, setOrg] = useState<CrmOrganisation | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<SpaceEngagementRow[]>([]);
  const [emails, setEmails] = useState<CrmEmailMessageWithRelations[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [contactPanelError, setContactPanelError] = useState<string | null>(null);
  const [marketingSummary, setMarketingSummary] =
    useState<MarketingOrgSummary | null>(null);

  const loadDetail = useCallback(async () => {
    if (!row) return null;
    setLoading(true);
    const id = row.id;
    const [o, c, t, e, em, p] = await Promise.all([
      crmDb.organisations().select("*").eq("id", id).single(),
      crmDb.contacts().select("*").eq("organisation_id", id),
      crmDb.tasks().select("*").eq("organisation_id", id).order("due_date"),
      crmDb
        .engagements()
        .select(`*, crm_contacts ( id, full_name, first_name, last_name )`)
        .eq("organisation_id", id)
        .order("occurred_at", { ascending: false })
        .limit(30),
      crmDb
        .emailMessages()
        .select(`*, crm_contacts ( id, full_name, email ), crm_organisations ( id, name )`)
        .eq("organisation_id", id)
        .order("sent_at", { ascending: false })
        .limit(20),
      crmDb.profiles().select("*").eq("active", true).order("full_name"),
    ]);

    const { data: profs } = await crmDb.profiles().select("id, full_name");
    const creatorMap = Object.fromEntries(
      ((profs as { id: string; full_name: string | null }[]) || []).map((x) => [
        x.id,
        x.full_name,
      ])
    );

    setOrg((o.data as CrmOrganisation) || null);
    const contactList = (c.data as CrmContact[]) || [];
    const taskList = (t.data as CrmTask[]) || [];
    const engagementList = ((e.data as SpaceEngagementRow[]) || []).map((eng) => ({
      ...eng,
      contact: eng.crm_contacts ?? null,
      creator: eng.created_by
        ? { id: eng.created_by, full_name: creatorMap[eng.created_by] ?? null }
        : null,
    }));
    setContacts(contactList);
    setTasks(taskList);
    setSpacers((p.data as CrmProfile[]) || []);
    setEngagements(engagementList);
    setEmails((em.data as CrmEmailMessageWithRelations[]) || []);
    if (row) {
      void adminApiFetch(
        `/api/admin/crm/marketing/org-summary?organisationId=${row.id}`
      )
        .then((json) => setMarketingSummary(json.summary as MarketingOrgSummary))
        .catch(() => setMarketingSummary(null));
    }
    setLoading(false);
    return {
      org: (o.data as CrmOrganisation) || null,
      contacts: contactList,
      tasks: taskList,
      engagements: engagementList,
    };
  }, [row]);

  useEffect(() => {
    if (row) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load detail when card opens
      void loadDetail();
    } else {
      setOrg(null);
      setContacts([]);
      setTasks([]);
      setEngagements([]);
      setEmails([]);
    }
  }, [row, loadDetail]);

  const primaryContactId = org?.primary_contact_id ?? row?.primary_contact_id ?? null;
  const primaryContact =
    contacts.find((contact) => contact.id === primaryContactId) ?? null;
  const nextTask = useMemo(() => {
    if (!row) return null;
    const resolved = resolveNextCrmTaskForOrganisation(
      tasks,
      row.id,
      primaryContactId
    );
    return resolved ? tasks.find((t) => t.id === resolved.id) ?? null : null;
  }, [tasks, row, primaryContactId]);

  const actionContext = useMemo(() => {
    if (!row) return {};
    return organisationRowToActionContext({
      ...row,
      next_task_id: nextTask?.id ?? row.next_task_id,
      next_task_title: nextTask?.title ?? row.next_task_title,
      next_task_due: nextTask?.due_date ?? row.next_task_due,
    });
  }, [row, nextTask]);

  async function handleRefresh() {
    const data = await loadDetail();
    onRefresh();
    if (row && data && onRowPatched) {
      onRowPatched(
        patchOrganisationRowFromTasks(
          row,
          data.tasks,
          data.engagements,
          data.org
        )
      );
    }
  }

  function handleTaskOpen(item: CrmTimelineItem) {
    if (!row || !item.task_id) return;
    const task = tasks.find((entry) => entry.id === item.task_id);
    if (!task) {
      console.warn("Timeline task reference missing:", item.task_id);
      return;
    }

    openQuickAction(
      "edit_task",
      {
        organisationId: row.id,
        organisationName: row.name,
        taskId: task.id,
        taskTitle: task.title,
        contactId: task.contact_id ?? row.primary_contact_id ?? undefined,
        pipelineStage: row.pipeline_stage,
        assignedTo: row.assigned_to,
      },
      () => {
        void handleRefresh();
      }
    );
  }

  function handleOpenCreateContact() {
    if (profileLoading) return;
    if (!profile) {
      setContactPanelError("You must be signed in to add contacts.");
      return;
    }
    if (!row) return;
    setContactPanelError(null);
    setCreateContactOpen(true);
  }

  async function handleContactCreated(
    contact: CrmContact,
    meta?: { setAsPrimary?: boolean }
  ) {
    if (!row) return;

    const displayName =
      contact.full_name || contact.first_name || "Unnamed contact";
    let patched: CrmOrganisationListRow = {
      ...row,
      contact_count: row.contact_count + 1,
    };

    if (meta?.setAsPrimary) {
      const result = await setCrmOrganisationPrimaryContact(row.id, contact.id);
      if (result.ok) {
        patched = patchOrganisationRowPrimaryContact(patched, {
          id: contact.id,
          name: displayName,
          role: contact.role,
          email: contact.email,
          phone: contact.phone || contact.whatsapp,
        });
      }
    }

    setContacts((current) => [...current, contact]);
    setCreateContactOpen(false);
    onRowPatched?.(patched);
    await loadDetail();
    onRefresh();
  }

  const ownerName =
    spacers.find((s) => s.id === org?.assigned_to)?.full_name ||
    row?.assigned_name ||
    "Unassigned";

  return (
    <>
      <CrmDesktopDrawer
        open={Boolean(row)}
        title={row?.name || "Organisation"}
        subtitle={row?.type ? row.type : undefined}
        onClose={onClose}
        widthClass="max-w-2xl"
      >
        {loading && !org ? (
          <p className="text-sm text-gray-500">Loading organisation…</p>
        ) : row ? (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {org ? <CrmPipelineBadge stage={org.pipeline_stage} /> : null}
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <Link
                href={`/admin/crm/organisations/${row.id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Full page
              </Link>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Owner</dt>
                <dd className="font-medium">{ownerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Location</dt>
                <dd className="inline-flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  {org?.address || row.address || "—"}
                </dd>
              </div>
            </dl>

            <section>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#192a3a]">Next action</h3>
                <div className="flex flex-wrap gap-1">
                  {nextTask ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          openQuickAction("edit_task", actionContext, handleRefresh)
                        }
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                      >
                        Edit task
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openQuickAction("complete_task", actionContext, handleRefresh)
                        }
                        className="rounded-lg bg-[#192a3a] px-2 py-1 text-xs text-white"
                      >
                        Complete
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAction(
                          "add_task",
                          {
                            ...actionContext,
                            prefillTaskTitle: `Follow up: ${row.name}`,
                          },
                          handleRefresh
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-[#c1121f] px-2 py-1 text-xs text-white"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add task
                    </button>
                  )}
                </div>
              </div>
              {nextTask ? (
                <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                  <p className="font-medium">{nextTask.title}</p>
                  {nextTask.description ? (
                    <p className="mt-1 text-gray-600">{nextTask.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {nextTask.due_date ? (
                      <span>{formatDueDate(nextTask.due_date)}</span>
                    ) : (
                      <span>No due date</span>
                    )}
                    {nextTask.due_date &&
                    isCrmTaskOverdue(nextTask.due_date, nextTask.status) ? (
                      <CrmOverdueBadge />
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No open task scheduled.</p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#192a3a]">Contacts</h3>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenCreateContact();
                  }}
                  disabled={createContactOpen || profileLoading}
                  className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-[#c1121f] hover:bg-[#c1121f]/5 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add contact
                </button>
              </div>
              {contactPanelError ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {contactPanelError}
                </p>
              ) : null}
              <ul className="mt-2 space-y-2">
                {contacts.length === 0 ? (
                  <li className="text-sm text-gray-500">No contacts added</li>
                ) : (
                  contacts.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            href={`/admin/crm/contacts/${c.id}`}
                            className="font-medium text-[#c1121f] hover:underline"
                          >
                            {c.full_name || c.first_name || "Contact"}
                          </Link>
                          {org?.primary_contact_id === c.id ? (
                            <span className="ml-2 text-[10px] uppercase text-gray-400">
                              Primary
                            </span>
                          ) : null}
                          {c.role ? (
                            <p className="text-xs text-gray-500">{c.role}</p>
                          ) : null}
                        </div>
                        <User className="h-4 w-4 text-gray-300" />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-600">
                        {c.email ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {c.email}
                          </span>
                        ) : null}
                        {c.phone || c.whatsapp ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {c.phone || c.whatsapp}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-[#192a3a]">Spaces</h3>
              {org ? (
                <CrmMarketplaceListingsSection
                  mode="organisation"
                  entityId={org.id}
                  organisationName={org.name}
                />
              ) : null}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-[#192a3a]">Activity</h3>
              <CrmTimeline
                engagements={engagements}
                tasks={tasks}
                emails={emails}
                contacts={contacts}
                organisationId={row.id}
                organisationName={row.name}
                loading={loading}
                onTaskOpen={handleTaskOpen}
              />
            </section>

            <section>
              <h3 className="text-sm font-semibold text-[#192a3a]">Marketing</h3>
              {marketingSummary ? (
                <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                  <p>{marketingSummary.total} in marketing audience</p>
                  <p className="text-gray-600">
                    {marketingSummary.sendable} sendable · {marketingSummary.pending}{" "}
                    pending consent · {marketingSummary.blocked} unsubscribed/suppressed
                  </p>
                  {marketingSummary.lists.length ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Lists: {marketingSummary.lists.join(", ")}
                    </p>
                  ) : null}
                  <Link
                    href={`/admin/crm/marketing/contacts?org=${row.id}`}
                    className="mt-2 inline-block text-sm font-medium text-[#c1121f] hover:underline"
                  >
                    Open marketing contacts
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  No marketing records yet for this organisation.
                </p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-[#192a3a]">Quick actions</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openQuickMenu(actionContext, handleRefresh)}
                  className="rounded-lg bg-[#c1121f] px-3 py-2 text-sm text-white"
                >
                  All quick actions
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openQuickAction("add_note", actionContext, handleRefresh)
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  Add note
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openQuickAction("change_pipeline", actionContext, handleRefresh)
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  Change stage
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openQuickAction("assign_owner", actionContext, handleRefresh)
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  Assign owner
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </CrmDesktopDrawer>

      {org ? (
        <EditOrganisationPanel
          open={editOpen}
          organisation={org}
          spacers={spacers}
          isAdmin={isAdmin}
          stackAboveDrawer
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void handleRefresh();
          }}
        />
      ) : null}

      {row && profile ? (
        <CreateContactPanel
          open={createContactOpen}
          defaultOrganisationId={row.id}
          lockOrganisation
          offerSetAsPrimary
          stackAboveDrawer
          isAdmin={isAdmin}
          canViewAllOrganisations={canViewAllOrganisations}
          userId={profile.id}
          onClose={() => setCreateContactOpen(false)}
          onCreated={(contact, meta) => void handleContactCreated(contact, meta)}
        />
      ) : null}
    </>
  );
}
