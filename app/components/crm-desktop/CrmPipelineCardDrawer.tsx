"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  User,
} from "lucide-react";
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
import {
  CrmMarketplaceListingsSection,
  type MarketplaceListingsData,
} from "@/app/space-place/components/CrmMarketplaceListingsSection";
import { CrmDesktopDrawer } from "./CrmDesktopDrawer";
import { CrmTimeline, type CrmTimelineItem } from "./CrmTimeline";
import { CrmCompletedActionsPanel } from "./CrmCompletedActionsPanel";
import { CrmOverdueBadge, CrmPipelineBadge } from "./CrmStatusBadge";
import { organisationRowToActionContext } from "./crm-action-context";
import { useCrmQuickAction } from "./CrmQuickActionProvider";
import { formatDueDate } from "@/lib/space-place/format";
import {
  isCrmTaskOverdue,
  resolveNextCrmTaskForOrganisation,
} from "@/lib/space-place/next-task";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { setCrmOrganisationPrimaryContact } from "@/lib/crm-desktop/api-client";
import { patchOrganisationRowPrimaryContact } from "@/lib/crm-desktop/organisation-contact-status";
import { patchOrganisationRowFromTasks } from "@/lib/crm-desktop/patch-organisation-row-from-tasks";
import { patchOrganisationRowMarketplaceCounts } from "@/lib/crm-desktop/patch-organisation-row-marketplace";
import {
  loadOrganisationDrawerDetail,
  marketplaceCountsEqual,
  reloadOrganisationDrawerMarketplace,
  type DrawerMarketplaceCounts,
  type MarketingOrgSummary,
  type OrganisationDrawerDetail,
} from "@/lib/crm-desktop/organisation-drawer-detail";

import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";

const EMPTY_MARKETPLACE: OrganisationDrawerDetail["marketplace"] = {
  listings: [],
  properties: [],
  counts: {
    linkedPropertyCount: 0,
    linkedSpaceCount: 0,
    hasLinkedProperties: false,
    hasLinkedSpaces: false,
  },
  error: null,
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

  const organisationId = row?.id ?? null;
  const open = Boolean(row);

  const rowRef = useRef(row);
  const onRefreshRef = useRef(onRefresh);
  const onRowPatchedRef = useRef(onRowPatched);
  rowRef.current = row;
  onRefreshRef.current = onRefresh;
  onRowPatchedRef.current = onRowPatched;

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const inflightRef = useRef(false);
  const lastReportedCountsRef = useRef<DrawerMarketplaceCounts | null>(null);
  const hasLoadedRef = useRef(false);

  const [org, setOrg] = useState<CrmOrganisation | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [engagements, setEngagements] = useState<SpaceEngagementRow[]>([]);
  const [emails, setEmails] = useState<CrmEmailMessageWithRelations[]>([]);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [marketplace, setMarketplace] =
    useState<OrganisationDrawerDetail["marketplace"]>(EMPTY_MARKETPLACE);
  const [marketplaceRefreshing, setMarketplaceRefreshing] = useState(false);
  const [marketingSummary, setMarketingSummary] =
    useState<MarketingOrgSummary | null>(null);
  const [marketingError, setMarketingError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [contactPanelError, setContactPanelError] = useState<string | null>(null);

  const reportCountsToBoard = useCallback((counts: DrawerMarketplaceCounts) => {
    const last = lastReportedCountsRef.current;
    if (last && marketplaceCountsEqual(last, counts)) return;
    lastReportedCountsRef.current = counts;
    const currentRow = rowRef.current;
    if (!currentRow || !onRowPatchedRef.current) return;
    onRowPatchedRef.current(
      patchOrganisationRowMarketplaceCounts(currentRow, {
        linkedPropertyCount: counts.linkedPropertyCount,
        linkedSpaceCount: counts.linkedSpaceCount,
      })
    );
  }, []);

  const applyDetail = useCallback(
    (detail: OrganisationDrawerDetail) => {
      setOrg(detail.org);
      setContacts(detail.contacts);
      setTasks(detail.tasks);
      setEngagements(detail.engagements);
      setEmails(detail.emails);
      setSpacers(detail.spacers);
      setMarketplace(detail.marketplace);
      setMarketingSummary(detail.marketingSummary);
      setMarketingError(null);
      setDetailError(null);
      reportCountsToBoard(detail.marketplace.counts);
      hasLoadedRef.current = true;
    },
    [reportCountsToBoard]
  );

  const loadDetail = useCallback(
    async (options?: { background?: boolean; force?: boolean }) => {
      if (!organisationId) return null;
      if (inflightRef.current && !options?.force) return null;

      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      inflightRef.current = true;

      const isBackground = options?.background === true && hasLoadedRef.current;
      if (isBackground) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      setDetailError(null);

      try {
        const detail = await loadOrganisationDrawerDetail(organisationId, {
          signal: controller.signal,
        });
        if (requestId !== requestIdRef.current) return null;
        applyDetail(detail);
        return detail;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return null;
        }
        if (requestId !== requestIdRef.current) return null;
        setDetailError("Could not load organisation details.");
        return null;
      } finally {
        if (requestId === requestIdRef.current) {
          inflightRef.current = false;
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [organisationId, applyDetail]
  );

  const reloadMarketplace = useCallback(async () => {
    if (!organisationId) return;
    setMarketplaceRefreshing(true);
    try {
      const next = await reloadOrganisationDrawerMarketplace(organisationId);
      setMarketplace(next);
      reportCountsToBoard(next.counts);
    } catch {
      setMarketplace((current) => ({
        ...current,
        error: "Could not load marketplace listings.",
      }));
    } finally {
      setMarketplaceRefreshing(false);
    }
  }, [organisationId, reportCountsToBoard]);

  useEffect(() => {
    if (!open || !organisationId) {
      abortRef.current?.abort();
      requestIdRef.current += 1;
      inflightRef.current = false;
      hasLoadedRef.current = false;
      lastReportedCountsRef.current = null;
      setOrg(null);
      setContacts([]);
      setTasks([]);
      setEngagements([]);
      setEmails([]);
      setSpacers([]);
      setMarketplace(EMPTY_MARKETPLACE);
      setMarketingSummary(null);
      setMarketingError(null);
      setDetailError(null);
      setInitialLoading(false);
      setRefreshing(false);
      setMarketplaceRefreshing(false);
      return;
    }

    void loadDetail();

    return () => {
      abortRef.current?.abort();
    };
  }, [open, organisationId, loadDetail]);

  const marketplaceData = useMemo<MarketplaceListingsData>(
    () => ({
      listings: marketplace.listings,
      properties: marketplace.properties,
      counts: marketplace.counts,
      loading: marketplaceRefreshing,
      error: marketplace.error,
      reload: reloadMarketplace,
    }),
    [
      marketplace.listings,
      marketplace.properties,
      marketplace.counts,
      marketplace.error,
      marketplaceRefreshing,
      reloadMarketplace,
    ]
  );

  const primaryContactId = org?.primary_contact_id ?? row?.primary_contact_id ?? null;
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

  const handleRefresh = useCallback(async () => {
    const detail = await loadDetail({ background: true, force: true });
    onRefreshRef.current();
    const currentRow = rowRef.current;
    if (currentRow && detail && onRowPatchedRef.current) {
      onRowPatchedRef.current(
        patchOrganisationRowFromTasks(
          currentRow,
          detail.tasks,
          detail.engagements,
          detail.org
        )
      );
    }
  }, [loadDetail]);

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
    onRowPatchedRef.current?.(patched);
    await handleRefresh();
  }

  const ownerName =
    spacers.find((s) => s.id === org?.assigned_to)?.full_name ||
    row?.assigned_name ||
    "Unassigned";

  const showInitialSkeleton = initialLoading && !hasLoadedRef.current;

  return (
    <>
      <CrmDesktopDrawer
        open={open}
        title={row?.name || "Organisation"}
        subtitle={row?.type ? row.type : undefined}
        onClose={onClose}
        widthClass="max-w-2xl"
      >
        {showInitialSkeleton ? (
          <p className="text-sm text-gray-500">Loading organisation…</p>
        ) : row ? (
          <div className="space-y-6">
            {detailError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {detailError}{" "}
                <button
                  type="button"
                  onClick={() => void loadDetail({ force: true })}
                  className="font-medium underline"
                >
                  Retry
                </button>
              </div>
            ) : null}
            {refreshing ? (
              <p className="text-xs text-gray-400" aria-live="polite">
                Refreshing…
              </p>
            ) : null}

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
                  stackAboveDrawer
                  data={marketplaceData}
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
                loading={refreshing}
                onTaskOpen={handleTaskOpen}
              />
            </section>

            <section>
              <CrmCompletedActionsPanel
                organisationId={row.id}
                organisationName={row.name}
                properties={marketplace.properties.map((p) => ({
                  id: p.id,
                  name: p.name,
                }))}
                spaces={marketplace.listings.map((s) => ({
                  id: s.id,
                  title: s.title,
                  propertyId: s.property_id,
                }))}
                compact
                onChanged={() => void handleRefresh()}
              />
              <Link
                href={`/admin/crm/organisations/${row.id}?tab=completed`}
                className="mt-2 inline-block text-sm font-medium text-[#c1121f] hover:underline"
              >
                View all
              </Link>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-[#192a3a]">Marketing</h3>
              {marketingError ? (
                <div className="mt-2 text-sm text-red-600">
                  {marketingError}{" "}
                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    className="font-medium underline"
                  >
                    Retry
                  </button>
                </div>
              ) : marketingSummary ? (
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
