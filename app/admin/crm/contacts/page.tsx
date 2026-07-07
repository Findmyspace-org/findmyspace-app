"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CrmDataTable, CrmPagination } from "@/app/components/crm-desktop/CrmDataTable";
import { CrmPipelineBadge } from "@/app/components/crm-desktop/CrmStatusBadge";
import { CrmRowActionsMenu } from "@/app/components/crm-desktop/CrmRowActionsMenu";
import { useCrmQuickAction } from "@/app/components/crm-desktop/CrmQuickActionProvider";
import {
  fetchCrmDesktopContacts,
  fetchCrmDesktopProfiles,
} from "@/lib/crm-desktop/api-client";
import type { CrmContactListRow } from "@/lib/crm-desktop/types";
import { formatActivityDate, formatDueDate } from "@/lib/space-place/format";

function ContactsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openQuickMenu, openQuickAction } = useCrmQuickAction();
  const page = Number(searchParams.get("page") || "1") || 1;
  const [rows, setRows] = useState<CrmContactListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);

  const filters = useMemo(
    () => ({
      q: searchParams.get("q") || undefined,
      assigned: searchParams.get("assigned") || undefined,
      stage: searchParams.get("stage") || undefined,
      type: searchParams.get("type") || undefined,
      role: searchParams.get("role") || undefined,
      overdue: searchParams.get("overdue") === "1" ? "1" : undefined,
      no_next: searchParams.get("no_next") === "1" ? "1" : undefined,
      no_email: searchParams.get("no_email") === "1" ? "1" : undefined,
      no_phone: searchParams.get("no_phone") === "1" ? "1" : undefined,
      stale: searchParams.get("stale") === "1" ? "1" : undefined,
      page,
    }),
    [searchParams, page]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchCrmDesktopContacts(filters);
    setRows(result.rows);
    setTotal(result.total);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchCrmDesktopProfiles().then(setProfiles);
  }, []);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.push(`/admin/crm/contacts?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Search contacts…"
          defaultValue={searchParams.get("q") || ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateFilter("q", (e.target as HTMLInputElement).value);
            }
          }}
        />
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={searchParams.get("assigned") || ""}
          onChange={(e) => updateFilter("assigned", e.target.value)}
        >
          <option value="">All owners</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <input
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Contact role…"
          defaultValue={searchParams.get("role") || ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateFilter("role", (e.target as HTMLInputElement).value);
            }
          }}
        />
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ["overdue", "Overdue"],
            ["no_next", "No next step"],
            ["no_email", "No email"],
            ["no_phone", "No phone"],
            ["stale", "Stale 30d"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                updateFilter(key, searchParams.get(key) === "1" ? "" : "1")
              }
              className={`rounded-full px-2.5 py-1 ${
                searchParams.get(key) === "1"
                  ? "bg-[#192a3a] text-white"
                  : "bg-gray-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <CrmDataTable
        loading={loading}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "name",
            header: "Contact",
            render: (row) => {
              const r = row as unknown as CrmContactListRow;
              return (
                <Link
                  href={`/admin/crm/contacts/${r.id}`}
                  className="font-medium hover:text-[#c1121f]"
                >
                  {r.full_name}
                </Link>
              );
            },
          },
          {
            key: "role",
            header: "Role",
            render: (row) => (
              <span className="text-sm">
                {(row as unknown as CrmContactListRow).role || "—"}
              </span>
            ),
          },
          {
            key: "org",
            header: "Organisation",
            render: (row) => {
              const r = row as unknown as CrmContactListRow;
              return (
                <div>
                  <Link
                    href={`/admin/crm/organisations/${r.organisation_id}`}
                    className="text-sm font-medium text-[#c1121f] hover:underline"
                  >
                    {r.organisation_name}
                  </Link>
                  <p className="text-xs capitalize text-gray-500">
                    {r.organisation_type || "—"}
                  </p>
                  <CrmPipelineBadge stage={r.organisation_pipeline_stage} />
                </div>
              );
            },
          },
          {
            key: "email",
            header: "Email / phone",
            render: (row) => {
              const r = row as unknown as CrmContactListRow;
              return (
                <div className="text-sm text-gray-600">
                  <p>{r.email || "—"}</p>
                  <p>{r.phone || r.whatsapp || ""}</p>
                </div>
              );
            },
          },
          {
            key: "interaction",
            header: "Last interaction",
            render: (row) => {
              const r = row as unknown as CrmContactListRow;
              return (
                <div className="text-sm">
                  <p>
                    {r.last_interaction_at
                      ? formatActivityDate(r.last_interaction_at)
                      : "—"}
                  </p>
                  <p className="truncate text-gray-500">
                    {r.last_interaction_summary}
                  </p>
                </div>
              );
            },
          },
          {
            key: "next",
            header: "Next step",
            render: (row) => {
              const r = row as unknown as CrmContactListRow;
              return (
                <div className="text-sm">
                  <p>{r.next_task_title || "—"}</p>
                  <p className="text-gray-500">
                    {r.next_task_due ? formatDueDate(r.next_task_due) : ""}
                  </p>
                </div>
              );
            },
          },
          {
            key: "owner",
            header: "Owner",
            render: (row) => (
              <span className="text-sm">
                {(row as unknown as CrmContactListRow).assigned_name || "—"}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            render: (row) => {
              const r = row as unknown as CrmContactListRow;
              const ctx = {
                organisationId: r.organisation_id,
                organisationName: r.organisation_name,
                contactId: r.id,
                contactName: r.full_name,
                pipelineStage: r.organisation_pipeline_stage ?? undefined,
                assignedTo: r.assigned_to,
                taskId: r.next_task_id ?? undefined,
                taskTitle: r.next_task_title ?? undefined,
              };
              return (
                <CrmRowActionsMenu
                  actions={[
                    {
                      label: "Quick actions",
                      onClick: () => openQuickMenu(ctx, load),
                    },
                    { label: "Open contact", href: `/admin/crm/contacts/${r.id}` },
                    {
                      label: "Open organisation",
                      href: `/admin/crm/organisations/${r.organisation_id}`,
                    },
                    {
                      label: "Log call",
                      onClick: () => openQuickAction("log_call", ctx, load),
                    },
                    {
                      label: "Schedule follow-up",
                      onClick: () =>
                        openQuickAction("schedule_followup", ctx, load),
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
          router.push(`/admin/crm/contacts?${next.toString()}`);
        }}
      />
    </div>
  );
}

export default function CrmContactsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <ContactsPageInner />
    </Suspense>
  );
}
