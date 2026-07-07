"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CrmDataTable, CrmPagination } from "@/app/components/crm-desktop/CrmDataTable";
import {
  CrmListingStatusBadge,
  CrmPipelineBadge,
} from "@/app/components/crm-desktop/CrmStatusBadge";
import { CrmRowActionsMenu } from "@/app/components/crm-desktop/CrmRowActionsMenu";
import { useCrmQuickAction } from "@/app/components/crm-desktop/CrmQuickActionProvider";
import { fetchCrmDesktopSpaces } from "@/lib/crm-desktop/api-client";
import type { CrmSpaceListRow } from "@/lib/crm-desktop/types";
import { formatActivityDate, formatDueDate } from "@/lib/space-place/format";

function SpacesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openQuickMenu } = useCrmQuickAction();
  const page = Number(searchParams.get("page") || "1") || 1;
  const [rows, setRows] = useState<CrmSpaceListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const filters = useMemo(
    () => ({
      q: searchParams.get("q") || undefined,
      org: searchParams.get("org") || undefined,
      page,
    }),
    [searchParams, page]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchCrmDesktopSpaces(filters);
    setRows(result.rows);
    setTotal(result.total);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Marketplace spaces linked to CRM organisations. Listing status and CRM
        pipeline stage are shown separately.
      </p>

      <input
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Search spaces…"
        defaultValue={searchParams.get("q") || ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const next = new URLSearchParams(searchParams.toString());
            next.set("q", (e.target as HTMLInputElement).value);
            next.delete("page");
            router.push(`/admin/crm/spaces?${next.toString()}`);
          }
        }}
      />

      <CrmDataTable
        loading={loading}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "title",
            header: "Space",
            render: (row) => {
              const r = row as unknown as CrmSpaceListRow;
              return (
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-gray-500">
                    {[r.suburb, r.city].filter(Boolean).join(", ")}
                  </p>
                </div>
              );
            },
          },
          {
            key: "property",
            header: "Property",
            render: (row) => {
              const r = row as unknown as CrmSpaceListRow;
              return r.property_id ? (
                <Link
                  href={`/admin/properties/${r.property_id}`}
                  className="text-sm hover:underline"
                >
                  {r.property_name || "Property"}
                </Link>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              );
            },
          },
          {
            key: "org",
            header: "CRM organisation",
            render: (row) => {
              const r = row as unknown as CrmSpaceListRow;
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
            header: "CRM contact",
            render: (row) => {
              const r = row as unknown as CrmSpaceListRow;
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
            key: "listing",
            header: "Listing status",
            render: (row) => (
              <CrmListingStatusBadge
                status={(row as unknown as CrmSpaceListRow).listing_status}
              />
            ),
          },
          {
            key: "pipeline",
            header: "CRM pipeline",
            render: (row) => (
              <CrmPipelineBadge
                stage={(row as unknown as CrmSpaceListRow).pipeline_stage}
              />
            ),
          },
          {
            key: "interaction",
            header: "Last interaction",
            render: (row) => {
              const r = row as unknown as CrmSpaceListRow;
              return r.last_interaction_at
                ? formatActivityDate(r.last_interaction_at)
                : "—";
            },
          },
          {
            key: "next",
            header: "Next step",
            render: (row) => {
              const r = row as unknown as CrmSpaceListRow;
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
            header: "CRM owner",
            render: (row) => (
              <span className="text-sm">
                {(row as unknown as CrmSpaceListRow).assigned_name || "—"}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            render: (row) => {
              const r = row as unknown as CrmSpaceListRow;
              const ctx = {
                organisationId: r.organisation_id ?? undefined,
                organisationName: r.organisation_name ?? undefined,
                contactId: r.contact_id ?? undefined,
                contactName: r.contact_name ?? undefined,
                spaceId: r.id,
                spaceTitle: r.title,
                pipelineStage: r.pipeline_stage ?? undefined,
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
                    { label: "Listing admin", href: `/admin/spaces/${r.id}/manage` },
                    ...(r.property_id
                      ? [
                          {
                            label: "Property admin",
                            href: `/admin/properties/${r.property_id}`,
                          },
                        ]
                      : []),
                    ...(r.organisation_id
                      ? [
                          {
                            label: "CRM organisation",
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
        pageSize={25}
        total={total}
        onPageChange={(nextPage) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("page", String(nextPage));
          router.push(`/admin/crm/spaces?${next.toString()}`);
        }}
      />
    </div>
  );
}

export default function CrmSpacesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <SpacesPageInner />
    </Suspense>
  );
}
