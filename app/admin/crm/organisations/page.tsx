"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreateOrganisationPanel } from "@/app/space-place/components/CreateOrganisationPanel";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { CrmDataTable, CrmPagination } from "@/app/components/crm-desktop/CrmDataTable";
import { CrmOrganisationContactsCell } from "@/app/components/crm-desktop/CrmOrganisationContactsCell";
import { CrmPresetViewBar } from "@/app/components/crm-desktop/CrmPresetViewBar";
import {
  buildOrganisationQualityIndicators,
  CrmQualityIndicators,
} from "@/app/components/crm-desktop/CrmQualityIndicators";
import { CrmPipelineBadge, CrmOverdueBadge } from "@/app/components/crm-desktop/CrmStatusBadge";
import { CrmRowActionsMenu } from "@/app/components/crm-desktop/CrmRowActionsMenu";
import { organisationRowToActionContext } from "@/app/components/crm-desktop/crm-action-context";
import { useCrmQuickAction } from "@/app/components/crm-desktop/CrmQuickActionProvider";
import {
  fetchCrmDesktopOrganisations,
  fetchCrmDesktopProfiles,
} from "@/lib/crm-desktop/api-client";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import { ORGANISATION_TYPES } from "@/lib/space-place/organisation-types";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from "@/lib/space-place/constants";
import { formatActivityDate, formatDueDate } from "@/lib/space-place/format";
import { crmDb } from "@/lib/space-place/db";
import type { CrmProfile } from "@/lib/space-place/types";

function OrganisationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openQuickMenu, openQuickAction } = useCrmQuickAction();
  const { isAdmin, canViewAllOrganisations, profile } = useSpacePlace();
  const [rows, setRows] = useState<CrmOrganisationListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [spacers, setSpacers] = useState<CrmProfile[]>([]);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");

  const page = Number(searchParams.get("page") || "1") || 1;

  const filters = useMemo(() => {
    const params = Object.fromEntries(searchParams.entries());
    return {
      q: params.q || undefined,
      assigned: params.assigned || undefined,
      stage: params.stage || undefined,
      type: params.type || undefined,
      overdue: params.overdue === "1" ? "1" : undefined,
      no_next: params.no_next === "1" ? "1" : undefined,
      no_contact: params.no_contact === "1" ? "1" : undefined,
      primary_required: params.primary_required === "1" ? "1" : undefined,
      no_spaces: params.no_spaces === "1" ? "1" : undefined,
      no_follow_up: params.no_follow_up === "1" ? "1" : undefined,
      no_email: params.no_email === "1" ? "1" : undefined,
      no_phone: params.no_phone === "1" ? "1" : undefined,
      stale: params.stale === "1" ? "1" : undefined,
      preset: params.preset || undefined,
      sort: params.sort || undefined,
      dir: params.dir || undefined,
      page,
    };
  }, [searchParams, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCrmDesktopOrganisations(filters);
      setRows(result.rows);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organisations.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchCrmDesktopProfiles().then(setProfiles);
    if (isAdmin) {
      void crmDb
        .profiles()
        .select("*")
        .eq("active", true)
        .order("full_name")
        .then((res: { data: CrmProfile[] | null }) =>
          setSpacers(res.data || [])
        );
    }
  }, [isAdmin]);

  function updateFilter(key: string, value: string, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    if (resetPage) next.delete("page");
    router.push(`/admin/crm/organisations?${next.toString()}`);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <CrmPresetViewBar scope="organisations" />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Search</span>
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateFilter("q", searchInput);
            }}
            placeholder="Name, type, location…"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Type</span>
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={searchParams.get("type") || ""}
            onChange={(e) => updateFilter("type", e.target.value)}
          >
            <option value="">All types</option>
            {ORGANISATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Owner</span>
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={searchParams.get("assigned") || ""}
            onChange={(e) => updateFilter("assigned", e.target.value)}
          >
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Pipeline</span>
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={searchParams.get("stage") || ""}
            onChange={(e) => updateFilter("stage", e.target.value)}
          >
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {PIPELINE_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ["overdue", "Overdue"],
            ["no_next", "No next step"],
            ["no_contact", "No contacts"],
            ["primary_required", "Primary required"],
            ["no_spaces", "No spaces"],
            ["stale", "Stale 30d"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                updateFilter(
                  key,
                  searchParams.get(key) === "1" ? "" : "1"
                )
              }
              className={`rounded-full px-2.5 py-1 ${
                searchParams.get(key) === "1"
                  ? "bg-[#192a3a] text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="ml-auto rounded-lg bg-[#c1121f] px-4 py-2 text-sm font-medium text-white"
        >
          Add organisation
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <CrmDataTable
        loading={loading}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "name",
            header: "Organisation",
            render: (row) => {
              const r = row as unknown as CrmOrganisationListRow;
              const ctx = organisationRowToActionContext(r);
              return (
                <div>
                  <Link
                    href={`/admin/crm/organisations/${r.id}`}
                    className="font-medium text-[#192a3a] hover:text-[#c1121f]"
                  >
                    {r.name}
                  </Link>
                  <p className="text-xs capitalize text-gray-500">
                    {r.type || "—"} · {r.address || "No area"}
                  </p>
                  <CrmQualityIndicators
                    items={buildOrganisationQualityIndicators(r)}
                    onIndicatorClick={(action) =>
                      openQuickAction(action, ctx, load)
                    }
                  />
                </div>
              );
            },
          },
          {
            key: "contacts",
            header: "Contacts",
            render: (row) => {
              const r = row as unknown as CrmOrganisationListRow;
              return (
                <div>
                  <CrmOrganisationContactsCell
                    primaryContactId={r.primary_contact_id}
                    primaryContactName={r.primary_contact_name}
                    primaryContactRole={r.primary_contact_role}
                    additionalContacts={r.additional_contacts}
                    contactCount={r.contact_count}
                  />
                  {r.primary_contact_email ? (
                    <p className="mt-1 text-xs text-gray-500">
                      {r.primary_contact_email}
                    </p>
                  ) : null}
                  {r.primary_contact_phone ? (
                    <p className="text-xs text-gray-500">
                      {r.primary_contact_phone}
                    </p>
                  ) : null}
                </div>
              );
            },
          },
          {
            key: "spaces",
            header: "Spaces",
            render: (row) => {
              const r = row as unknown as CrmOrganisationListRow;
              const count = r.space_count + r.property_count;
              return (
                <Link
                  href={`/admin/crm/spaces?org=${r.id}`}
                  className="text-sm font-medium text-[#c1121f] hover:underline"
                >
                  {count}
                </Link>
              );
            },
          },
          {
            key: "pipeline",
            header: "Pipeline",
            render: (row) => (
              <CrmPipelineBadge
                stage={(row as unknown as CrmOrganisationListRow).pipeline_stage}
              />
            ),
          },
          {
            key: "owner",
            header: "Owner",
            render: (row) => (
              <span className="text-sm">
                {(row as unknown as CrmOrganisationListRow).assigned_name ||
                  "Unassigned"}
              </span>
            ),
          },
          {
            key: "interaction",
            header: "Last interaction",
            render: (row) => {
              const r = row as unknown as CrmOrganisationListRow;
              return (
                <div className="max-w-xs text-sm text-gray-600">
                  <p>
                    {r.last_interaction_at
                      ? formatActivityDate(r.last_interaction_at)
                      : "—"}
                  </p>
                  <p className="truncate">{r.last_interaction_summary || ""}</p>
                </div>
              );
            },
          },
          {
            key: "next",
            header: "Next step",
            render: (row) => {
              const r = row as unknown as CrmOrganisationListRow;
              const overdue =
                r.next_task_due && r.next_task_due < today;
              return (
                <div className="text-sm">
                  <p>{r.next_task_title || "—"}</p>
                  <p className="text-gray-500">
                    {r.next_task_due ? formatDueDate(r.next_task_due) : ""}
                  </p>
                  {overdue ? <CrmOverdueBadge /> : null}
                </div>
              );
            },
          },
          {
            key: "actions",
            header: "",
            className: "w-12",
            render: (row) => {
              const r = row as unknown as CrmOrganisationListRow;
              const ctx = organisationRowToActionContext(r);
              return (
                <CrmRowActionsMenu
                  actions={[
                    {
                      label: "Quick actions",
                      onClick: () => openQuickMenu(ctx, load),
                    },
                    {
                      label: "Open organisation",
                      href: `/admin/crm/organisations/${r.id}`,
                    },
                    {
                      label: "Add note",
                      onClick: () =>
                        openQuickAction("add_note", ctx, load),
                    },
                    {
                      label: "Schedule follow-up",
                      onClick: () =>
                        openQuickAction("schedule_followup", ctx, load),
                    },
                    ...(r.next_task_id
                      ? [
                          {
                            label: "Complete task",
                            onClick: () =>
                              openQuickAction("complete_task", ctx, load),
                          },
                        ]
                      : []),
                  ]}
                />
              );
            },
          },
        ]}
      />

      <CrmPagination
        page={page}
        pageSize={25}
        total={total}
        onPageChange={(nextPage) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("page", String(nextPage));
          router.push(`/admin/crm/organisations?${next.toString()}`);
        }}
      />

      {profile ? (
        <CreateOrganisationPanel
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => void load()}
          isAdmin={isAdmin}
          canViewAllOrganisations={canViewAllOrganisations}
          userId={profile.id}
          spacers={spacers}
        />
      ) : null}
    </div>
  );
}

export default function CrmOrganisationsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <OrganisationsPageInner />
    </Suspense>
  );
}
