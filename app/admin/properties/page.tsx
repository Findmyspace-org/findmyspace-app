"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Plus, Search } from "lucide-react";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { AdminRowActionsMenu } from "@/app/components/admin/AdminRowActionsMenu";
import { ArchivePropertyModal } from "@/app/components/admin/ArchivePropertyModal";
import { CrmCompletedActionsQuickMenu } from "@/app/components/crm-desktop/CrmCompletedActionsQuickMenu";
import { completedActionHref } from "@/app/components/crm-desktop/CrmCompletedActionsPanel";

type PropertyRow = {
  id: string;
  name: string;
  city: string | null;
  suburb: string | null;
  owner_email: string | null;
  owner_status: string;
  space_count: number;
  cover_image_url: string | null;
  crm_organisation_id: string | null;
  crm_organisation_name: string | null;
  created_at: string;
};

function AdminPropertiesPageContent() {
  const searchParams = useSearchParams();
  const archivedName = searchParams.get("archived");
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<PropertyRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApiFetch("/api/admin/properties");
      setProperties((result.properties as PropertyRow[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load properties.");
      setProperties([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!archivedName) return;
    setMessage(`Archived “${archivedName}”.`);
    window.history.replaceState({}, "", "/admin/properties");
  }, [archivedName]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((row) => {
      const haystack = [row.name, row.suburb, row.city, row.owner_email, row.crm_organisation_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [properties, searchQuery]);

  if (loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <AdminNav current="properties" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Properties</h1>
            <p className="mt-1 text-sm text-gray-600">
              Properties are parent venues or locations. Add spaces under a property for renters
              to book.
            </p>
          </div>
          <Link
            href="/admin/properties/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Create property
          </Link>
        </div>

        {message ? (
          <p
            className={`mt-4 text-sm ${
              /archived|success/i.test(message) ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {message}
          </p>
        ) : null}

        <div className="relative mt-6 w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search properties…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-3 text-sm text-gray-600">No properties yet.</p>
            <Link
              href="/admin/properties/new"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0f2740] hover:underline"
            >
              <Plus className="h-4 w-4" />
              Create your first property
            </Link>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Spaces</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">CRM</th>
                  <th className="w-24 px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => {
                  const location =
                    [row.suburb, row.city].filter(Boolean).join(", ") || "—";

                  return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/properties/${row.id}`}
                        className="flex items-center gap-3"
                      >
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          {row.cover_image_url ? (
                            <Image
                              src={row.cover_image_url}
                              alt={row.name}
                              width={44}
                              height={44}
                              className="h-full w-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <Building2 className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 hover:text-[#0f2740] hover:underline">
                            {row.name}
                          </p>
                          <p className="text-sm text-slate-500">{location}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.space_count}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800">{row.owner_status}</p>
                      {row.owner_email ? (
                        <p className="text-xs text-gray-500">{row.owner_email}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.crm_organisation_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {row.crm_organisation_id ? (
                          <CrmCompletedActionsQuickMenu
                            organisationId={row.crm_organisation_id}
                            propertyId={row.id}
                          />
                        ) : null}
                        <AdminRowActionsMenu
                          actions={[
                            {
                              key: "view",
                              label: "View property",
                              href: `/admin/properties/${row.id}`,
                            },
                            ...(row.crm_organisation_id
                              ? [
                                  {
                                    key: "completed",
                                    label: "View completed actions",
                                    href: completedActionHref({
                                      organisationId: row.crm_organisation_id,
                                      propertyId: row.id,
                                    }),
                                  },
                                ]
                              : []),
                            {
                              key: "archive",
                              label: "Archive property",
                              destructive: true,
                              onClick: () => setArchiveTarget(row),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {archiveTarget ? (
        <ArchivePropertyModal
          propertyId={archiveTarget.id}
          propertyName={archiveTarget.name}
          open={Boolean(archiveTarget)}
          onClose={() => setArchiveTarget(null)}
          onArchived={(summary) => {
            setProperties((current) =>
              current.filter((row) => row.id !== archiveTarget.id)
            );
            setMessage(
              `Archived “${summary.property_name}” and ${summary.spaces_archived} space${summary.spaces_archived === 1 ? "" : "s"}.`
            );
            setArchiveTarget(null);
          }}
        />
      ) : null}
    </main>
  );
}

export default function AdminPropertiesPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <AdminPropertiesPageContent />
    </Suspense>
  );
}
