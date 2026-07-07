"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CrmPresetViewBar } from "@/app/components/crm-desktop/CrmPresetViewBar";
import { CrmDataTable, CrmPagination } from "@/app/components/crm-desktop/CrmDataTable";
import { CrmOverdueBadge, CrmPipelineBadge } from "@/app/components/crm-desktop/CrmStatusBadge";
import { CrmRowActionsMenu } from "@/app/components/crm-desktop/CrmRowActionsMenu";
import { useCrmQuickAction } from "@/app/components/crm-desktop/CrmQuickActionProvider";
import {
  fetchCrmDesktopProfiles,
  fetchCrmDesktopTasks,
} from "@/lib/crm-desktop/api-client";
import type { CrmTaskListRow } from "@/lib/crm-desktop/types";
import { dueBucket, formatDueDate } from "@/lib/space-place/format";

const BUCKETS = [
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "next7", label: "Next 7 days" },
  { key: "no_date", label: "No due date" },
  { key: "done", label: "Completed" },
] as const;

function ActivitiesWorkspace({
  defaultBucket,
  title,
}: {
  defaultBucket?: string;
  title: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openQuickMenu, openQuickAction } = useCrmQuickAction();
  const bucket = searchParams.get("bucket") || defaultBucket || "";
  const page = Number(searchParams.get("page") || "1") || 1;
  const [rows, setRows] = useState<CrmTaskListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);

  const filters = useMemo(
    () => ({
      bucket,
      owner: searchParams.get("owner") || undefined,
      org: searchParams.get("org") || undefined,
      page,
    }),
    [bucket, searchParams, page]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCrmDesktopTasks(filters);
      setRows(result.rows);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchCrmDesktopProfiles().then(setProfiles);
  }, []);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.push(
      `${window.location.pathname}?${next.toString()}`
    );
  }

  return (
    <div className="space-y-4">
      <CrmPresetViewBar scope="activities" />
      <p className="text-sm text-gray-600">{title}</p>

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setFilter("bucket", b.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              bucket === b.key
                ? "bg-[#192a3a] text-white"
                : "bg-white text-gray-700 ring-1 ring-gray-200"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <label className="text-sm">
        <span className="mb-1 block text-gray-600">Assigned person</span>
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={searchParams.get("owner") || ""}
          onChange={(e) => setFilter("owner", e.target.value)}
        >
          <option value="">All</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.id}
            </option>
          ))}
        </select>
      </label>

      <CrmDataTable
        loading={loading}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "due",
            header: "Due",
            render: (row) => {
              const r = row as unknown as CrmTaskListRow;
              const bucketState = dueBucket(r.due_date, r.status);
              return (
                <div className="text-sm">
                  <p>{formatDueDate(r.due_date)}</p>
                  {bucketState === "overdue" ? <CrmOverdueBadge /> : null}
                </div>
              );
            },
          },
          {
            key: "task",
            header: "Task",
            render: (row) => {
              const r = row as unknown as CrmTaskListRow;
              return (
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-gray-500">{r.description}</p>
                </div>
              );
            },
          },
          {
            key: "org",
            header: "Organisation",
            render: (row) => {
              const r = row as unknown as CrmTaskListRow;
              return r.organisation_id ? (
                <Link
                  href={`/admin/crm/organisations/${r.organisation_id}`}
                  className="text-sm text-[#c1121f] hover:underline"
                >
                  {r.organisation_name}
                </Link>
              ) : (
                "—"
              );
            },
          },
          {
            key: "contact",
            header: "Contact",
            render: (row) => {
              const r = row as unknown as CrmTaskListRow;
              return r.contact_id ? (
                <Link
                  href={`/admin/crm/contacts/${r.contact_id}`}
                  className="text-sm hover:underline"
                >
                  {r.contact_name}
                </Link>
              ) : (
                "—"
              );
            },
          },
          {
            key: "stage",
            header: "Pipeline",
            render: (row) => (
              <CrmPipelineBadge
                stage={(row as unknown as CrmTaskListRow).pipeline_stage}
              />
            ),
          },
          {
            key: "owner",
            header: "Owner",
            render: (row) => (
              <span className="text-sm">
                {(row as unknown as CrmTaskListRow).owner_name || "Unassigned"}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            render: (row) => {
              const r = row as unknown as CrmTaskListRow;
              const ctx = {
                organisationId: r.organisation_id ?? undefined,
                organisationName: r.organisation_name ?? undefined,
                contactId: r.contact_id ?? undefined,
                contactName: r.contact_name ?? undefined,
                pipelineStage: r.pipeline_stage ?? undefined,
                taskId: r.id,
                taskTitle: r.title,
                assignedTo: r.owner_id,
              };
              return (
                <CrmRowActionsMenu
                  actions={[
                    {
                      label: "Quick actions",
                      onClick: () => openQuickMenu(ctx, load),
                    },
                    {
                      label: "Complete task",
                      onClick: () =>
                        openQuickAction("complete_task", ctx, load),
                    },
                    ...(r.organisation_id
                      ? [
                          {
                            label: "Open organisation",
                            href: `/admin/crm/organisations/${r.organisation_id}`,
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
        pageSize={50}
        total={total}
        onPageChange={(nextPage) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("page", String(nextPage));
          router.push(`${window.location.pathname}?${next.toString()}`);
        }}
      />
    </div>
  );
}

function ActivitiesPageContent({
  defaultBucket,
  title,
}: {
  defaultBucket?: string;
  title: string;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <ActivitiesWorkspace defaultBucket={defaultBucket} title={title} />
    </Suspense>
  );
}

export function CrmTodayPage() {
  return <ActivitiesPageContent defaultBucket="today" title="Work that needs to happen today." />;
}

export function CrmActivitiesPage() {
  return (
    <ActivitiesPageContent
      defaultBucket="overdue"
      title="Filter activities by due date, owner, and organisation."
    />
  );
}

export function CrmTasksListPage() {
  return (
    <ActivitiesPageContent title="All open CRM tasks and follow-ups." />
  );
}
