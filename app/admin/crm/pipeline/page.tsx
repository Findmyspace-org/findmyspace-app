"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CrmDataTable, CrmPagination } from "@/app/components/crm-desktop/CrmDataTable";
import { CrmPresetViewBar } from "@/app/components/crm-desktop/CrmPresetViewBar";
import { CrmPipelineBoard } from "@/app/components/crm-desktop/CrmPipelineBoard";
import {
  CrmPipelineViewToggle,
  getCrmPipelineView,
} from "@/app/components/crm-desktop/CrmPipelineViewToggle";
import { CrmOverdueBadge, CrmPipelineBadge } from "@/app/components/crm-desktop/CrmStatusBadge";
import { useCrmQuickAction } from "@/app/components/crm-desktop/CrmQuickActionProvider";
import {
  organisationRowToActionContext,
  pipelineRowToOrganisationListRow,
} from "@/app/components/crm-desktop/crm-action-context";
import { CrmRowActionsMenu } from "@/app/components/crm-desktop/CrmRowActionsMenu";
import {
  fetchCrmDesktopBoardOrganisations,
  fetchCrmDesktopPipeline,
  fetchCrmDesktopPipelineStageCounts,
  fetchCrmDesktopProfiles,
} from "@/lib/crm-desktop/api-client";
import type {
  CrmOrganisationListRow,
  CrmPipelineListRow,
  CrmPipelineStageCounts,
} from "@/lib/crm-desktop/types";
import { ORGANISATION_TYPES } from "@/lib/space-place/organisation-types";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from "@/lib/space-place/constants";
import { formatActivityDate, formatDueDate } from "@/lib/space-place/format";
import { isCrmTaskOverdue } from "@/lib/space-place/next-task";
import { useCrmRefresh } from "@/lib/crm-desktop/crm-refresh";

function buildFilterParams(
  searchParams: URLSearchParams,
  extra: Record<string, string | number | undefined> = {}
) {
  const keys = [
    "q",
    "stage",
    "assigned",
    "type",
    "overdue",
    "no_next",
    "no_contact",
    "no_spaces",
    "no_follow_up",
    "no_email",
    "no_phone",
    "stale",
    "preset",
    "sort",
    "dir",
    "page",
    "pageSize",
  ];
  const params: Record<string, string | number | undefined> = { ...extra };
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) params[key] = value;
  }
  return params;
}

function PipelinePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = getCrmPipelineView(searchParams);
  const { openQuickMenu, openQuickAction } = useCrmQuickAction();
  const { version } = useCrmRefresh();

  const page = Number(searchParams.get("page") || "1") || 1;
  const boardPage = Number(searchParams.get("boardPage") || "1") || 1;

  const [tableRows, setTableRows] = useState<CrmPipelineListRow[]>([]);
  const [boardRows, setBoardRows] = useState<CrmOrganisationListRow[]>([]);
  const [stageCounts, setStageCounts] = useState<CrmPipelineStageCounts>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");

  const filterParams = useMemo(
    () => buildFilterParams(searchParams),
    [searchParams]
  );

  const loadTable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCrmDesktopPipeline({
        ...filterParams,
        page,
        pageSize: 25,
      });
      setTableRows(result.rows);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline.");
    } finally {
      setLoading(false);
    }
  }, [filterParams, page]);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgResult, counts] = await Promise.all([
        fetchCrmDesktopBoardOrganisations({
          ...filterParams,
          page: boardPage,
          pageSize: 100,
        }),
        fetchCrmDesktopPipelineStageCounts(filterParams),
      ]);

      setStageCounts(counts);
      setTotal(orgResult.total);
      setBoardRows((current) =>
        boardPage > 1 ? [...current, ...orgResult.rows] : orgResult.rows
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board.");
    } finally {
      setLoading(false);
    }
  }, [filterParams, boardPage]);

  const load = useCallback(async () => {
    if (view === "board") await loadBoard();
    else await loadTable();
  }, [view, loadBoard, loadTable]);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    void fetchCrmDesktopProfiles().then(setProfiles);
  }, []);

  function updateFilter(key: string, value: string, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    if (resetPage) {
      next.delete("page");
      next.delete("boardPage");
    }
    router.push(`/admin/crm/pipeline?${next.toString()}`);
  }

  function toggleFlag(key: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (next.get(key) === "1") next.delete(key);
    else next.set(key, "1");
    next.delete("page");
    next.delete("boardPage");
    router.push(`/admin/crm/pipeline?${next.toString()}`);
  }

  const hasMoreBoard = boardRows.length < total;

  return (
    <div className="space-y-4">
      <CrmPresetViewBar scope="pipeline" />

      <div className="flex flex-wrap items-center gap-3">
        <CrmPipelineViewToggle />
      </div>

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
            placeholder="Organisation, type, location…"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Stage</span>
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={searchParams.get("stage") || ""}
            onChange={(e) => updateFilter("stage", e.target.value)}
          >
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {PIPELINE_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
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
            <option value="">All owners</option>
            <option value="unassigned">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["overdue", "Overdue"],
          ["no_next", "No next task"],
          ["no_contact", "No contact"],
          ["no_spaces", "No spaces"],
          ["stale", "No recent interaction"],
          ["no_email", "No email"],
          ["no_phone", "No phone"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleFlag(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              searchParams.get(key) === "1"
                ? "bg-[#c1121f] text-white"
                : "bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-[#c1121f]/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {view === "board" ? (
        <CrmPipelineBoard
          rows={boardRows}
          stageCounts={stageCounts}
          loading={loading && boardRows.length === 0}
          total={total}
          hasMore={hasMoreBoard}
          onLoadMore={() => {
            const next = new URLSearchParams(searchParams.toString());
            next.set("boardPage", String(boardPage + 1));
            router.push(`/admin/crm/pipeline?${next.toString()}`);
          }}
          onRefresh={() => void loadBoard()}
          onRowsChange={setBoardRows}
        />
      ) : (
        <>
          <CrmDataTable
            loading={loading}
            rows={tableRows as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "org",
                header: "Organisation",
                render: (row) => {
                  const r = row as unknown as CrmPipelineListRow;
                  return (
                    <Link
                      href={`/admin/crm/organisations/${r.organisation_id}`}
                      className="font-medium hover:text-[#c1121f]"
                    >
                      {r.organisation_name}
                    </Link>
                  );
                },
              },
              {
                key: "contact",
                header: "Main contact",
                render: (row) => {
                  const r = row as unknown as CrmPipelineListRow;
                  return (
                    <div className="text-sm">
                      {r.main_contact_id ? (
                        <Link
                          href={`/admin/crm/contacts/${r.main_contact_id}`}
                          className="hover:underline"
                        >
                          {r.main_contact_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.main_contact_role ? (
                        <p className="text-xs text-gray-500">{r.main_contact_role}</p>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                key: "stage",
                header: "Stage",
                render: (row) => (
                  <CrmPipelineBadge
                    stage={(row as unknown as CrmPipelineListRow).pipeline_stage}
                  />
                ),
              },
              {
                key: "spaces",
                header: "Spaces",
                render: (row) => (
                  <span className="text-sm">
                    {(row as unknown as CrmPipelineListRow).space_count}
                  </span>
                ),
              },
              {
                key: "interaction",
                header: "Last interaction",
                render: (row) => {
                  const r = row as unknown as CrmPipelineListRow;
                  return r.last_interaction_at
                    ? formatActivityDate(r.last_interaction_at)
                    : "—";
                },
              },
              {
                key: "next",
                header: "Next step",
                render: (row) => {
                  const r = row as unknown as CrmPipelineListRow;
                  const overdue =
                    r.next_task_due &&
                    isCrmTaskOverdue(r.next_task_due, "open");
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
                key: "owner",
                header: "Owner",
                render: (row) => (
                  <span className="text-sm">
                    {(row as unknown as CrmPipelineListRow).assigned_name || "—"}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                render: (row) => {
                  const r = row as unknown as CrmPipelineListRow;
                  const orgRow = pipelineRowToOrganisationListRow(r);
                  const ctx = organisationRowToActionContext(orgRow);
                  return (
                    <CrmRowActionsMenu
                      actions={[
                        {
                          label: "Quick actions",
                          onClick: () => openQuickMenu(ctx, loadTable),
                        },
                        {
                          label: "Open organisation",
                          href: `/admin/crm/organisations/${r.organisation_id}`,
                        },
                        {
                          label: "Change pipeline",
                          onClick: () =>
                            openQuickAction("change_pipeline", ctx, loadTable),
                        },
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
              router.push(`/admin/crm/pipeline?${next.toString()}`);
            }}
          />
        </>
      )}
    </div>
  );
}

export default function CrmPipelinePage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <PipelinePageInner />
    </Suspense>
  );
}
