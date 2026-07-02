"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Building2, Compass, ImageIcon, Link2, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { adminSpaceEditHref } from "@/lib/admin-listing-routing";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import {
  ADMIN_LISTING_FILTER_OPTIONS,
  adminListingStatusBadgeClass,
  adminListingStatusLabel,
  matchesAdminListingFilter,
  type AdminListingFilterKey,
} from "@/lib/admin-listing-status-display";
import {
  canDeleteUnclaimedListingByRecord,
} from "@/lib/admin-unclaimed-space-delete-guards";
import { formatGroupSizeAdmin } from "@/lib/group-size";

type ListingRow = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
  space_type: string | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  status: string | null;
  property_id: string | null;
  created_at: string;
  enquiry_count: number;
  cover_image_url: string | null;
  crm_linked?: boolean;
  crm_organisation_name?: string | null;
  crm_contact_name?: string | null;
};

function AdminUnclaimedListingsPageContent({
  showSavedBanner,
}: {
  showSavedBanner: boolean;
}) {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminListingFilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ListingRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApiFetch("/api/admin/spaces/unclaimed");
      setListings((result.listings as ListingRow[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load listings.");
      setListings([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (showSavedBanner) {
      setSuccessMessage("Listing saved successfully.");
      window.history.replaceState({}, "", "/admin/unclaimed-listings");
    }
  }, [showSavedBanner]);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const r = (profile as { role?: string } | null)?.role ?? null;
      setRole(r);
      if (hasAdminUiAccess(r)) {
        await load();
      } else {
        setLoading(false);
      }
    }
    void init();
  }, [load]);

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return listings.filter((row) => {
      if (!matchesAdminListingFilter(row.status, statusFilter)) return false;
      if (!q) return true;
      const haystack = [row.title, row.suburb, row.city]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [listings, searchQuery, statusFilter]);

  function canDeleteListing(row: ListingRow): boolean {
    return canDeleteUnclaimedListingByRecord({
      created_by_admin: true,
      status: row.status,
      owner_id: null,
    }).ok;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError(null);
    try {
      await adminApiFetch(`/api/admin/spaces/${deleteTarget.id}/unclaimed`, {
        method: "DELETE",
      });
      setListings((current) => current.filter((row) => row.id !== deleteTarget.id));
      setSuccessMessage(
        `Deleted “${deleteTarget.title?.trim() || "Untitled listing"}”.`
      );
      setDeleteTarget(null);
      setMessage("");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete listing.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <AdminNav current="unclaimed-listings" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Unclaimed listings</h1>
            <p className="mt-1 text-sm text-gray-600">
              Admin-created venues — scout, publish, and track through claim and review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/properties"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-[#0f2740] bg-white px-4 py-2 text-sm font-semibold text-[#0f2740] hover:bg-[#0f2740]/5"
            >
              <Building2 className="h-4 w-4" />
              Properties
            </Link>
            <Link
              href="/admin/venue-scout"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <Compass className="h-4 w-4" />
              Venue Scout
            </Link>
            <Link
              href="/admin/unclaimed-listings/new"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              New Unclaimed Listing
            </Link>
          </div>
        </div>

        {successMessage ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            {successMessage}
          </p>
        ) : null}

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {ADMIN_LISTING_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === opt.key
                    ? "bg-[#0f2740] text-white"
                    : "bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, suburb, city…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
            />
          </div>
        </div>

        {filteredListings.length === 0 ? (
          <p className="mt-10 text-gray-500">
            {listings.length === 0
              ? "No admin-created listings yet."
              : "No listings match your filters."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm lg:overflow-x-visible">
            <table className="w-full min-w-[42rem] table-fixed text-left text-sm lg:min-w-0">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-16 px-2 py-3 font-medium">Image</th>
                  <th className="min-w-0 px-2 py-3 font-medium">Title</th>
                  <th className="w-[5.5rem] px-2 py-3 font-medium">Status</th>
                  <th className="hidden w-28 px-2 py-3 font-medium md:table-cell">
                    Category
                  </th>
                  <th className="hidden w-24 px-2 py-3 font-medium xl:table-cell">
                    Group
                  </th>
                  <th className="hidden w-28 px-2 py-3 font-medium 2xl:table-cell">
                    CRM
                  </th>
                  <th className="hidden w-14 px-2 py-3 font-medium lg:table-cell">
                    Enq.
                  </th>
                  <th className="hidden w-[6.5rem] px-2 py-3 font-medium lg:table-cell">
                    Created
                  </th>
                  <th className="w-[9.75rem] px-2 py-3 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredListings.map((row) => {
                  const location =
                    [row.suburb, row.city].filter(Boolean).join(", ") || "—";
                  const editHref = adminSpaceEditHref({
                    id: row.id,
                    status: row.status,
                    property_id: row.property_id,
                  });
                  const showDelete = canDeleteListing(row);

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50/80"
                    >
                      <td className="px-2 py-3 align-middle">
                        <Link
                          href={editHref}
                          className="block h-12 w-12 overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
                          title="Edit listing"
                        >
                          {row.cover_image_url ? (
                            <Image
                              src={row.cover_image_url}
                              alt=""
                              width={48}
                              height={48}
                              className="h-full w-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-gray-400">
                              <ImageIcon className="h-5 w-5" />
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="min-w-0 px-2 py-3 align-middle">
                        <Link
                          href={editHref}
                          className="block truncate font-semibold text-gray-900 hover:text-[#0f2740] hover:underline"
                          title={row.title || "Untitled"}
                        >
                          {row.title || "Untitled"}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-gray-500" title={location}>
                          {location}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 md:hidden">
                          {formatSpaceTypeLabel(row.space_type)}
                          {row.enquiry_count > 0 ? (
                            <span className="ml-1.5">· {row.enquiry_count} enq.</span>
                          ) : null}
                          {row.crm_linked ? (
                            <span className="block truncate text-[#0f2740]">
                              CRM: {row.crm_organisation_name || "Linked"}
                            </span>
                          ) : null}
                        </p>
                      </td>
                      <td className="px-2 py-3 align-middle">
                        <span
                          className={`inline-block whitespace-nowrap ${adminListingStatusBadgeClass(row.status)}`}
                        >
                          {adminListingStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="hidden truncate px-2 py-3 text-gray-600 md:table-cell">
                        {formatSpaceTypeLabel(row.space_type)}
                      </td>
                      <td className="hidden truncate px-2 py-3 text-xs text-gray-600 xl:table-cell">
                        {formatGroupSizeAdmin(row.min_group_size, row.max_group_size) || "—"}
                      </td>
                      <td className="hidden px-2 py-3 text-gray-600 2xl:table-cell">
                        {row.crm_linked ? (
                          <span
                            className="inline-flex min-w-0 items-start gap-1 text-xs"
                            title={row.crm_organisation_name || "Linked org"}
                          >
                            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0f2740]" />
                            <span className="min-w-0 truncate">
                              {row.crm_organisation_name || "Linked"}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="hidden px-2 py-3 text-center text-gray-700 lg:table-cell">
                        {row.enquiry_count}
                      </td>
                      <td className="hidden whitespace-nowrap px-2 py-3 text-xs text-gray-600 lg:table-cell">
                        {format(new Date(row.created_at), "dd MMM yyyy")}
                      </td>
                      <td className="px-2 py-3 text-right align-middle text-xs whitespace-nowrap sm:text-sm">
                        <Link
                          href={editHref}
                          className="font-medium text-[#0f2740] hover:underline"
                        >
                          Edit
                        </Link>
                        {row.status === "unclaimed" ? (
                          <>
                            <span className="text-gray-400"> · </span>
                            <Link
                              href={`/spaces/${row.id}`}
                              className="text-gray-600 hover:underline"
                              target="_blank"
                            >
                              Public
                            </Link>
                          </>
                        ) : null}
                        {showDelete ? (
                          <>
                            <span className="text-gray-400"> · </span>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteTarget(row);
                                setDeleteError(null);
                              }}
                              className="text-red-700 hover:underline"
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-labelledby="delete-unclaimed-listing-title"
          >
            <h2
              id="delete-unclaimed-listing-title"
              className="text-lg font-semibold text-[#192a3a]"
            >
              Delete listing?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Delete{" "}
              <span className="font-medium text-[#192a3a]">
                “{deleteTarget.title?.trim() || "Untitled listing"}”
              </span>
              ? This cannot be undone.
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Photos and draft details will be permanently removed. Listings with
              enquiries, claims, or bookings cannot be deleted here.
            </p>
            {deleteError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {deleteError}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingId === deleteTarget.id}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId === deleteTarget.id}
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 disabled:opacity-50"
              >
                {deletingId === deleteTarget.id ? "Deleting…" : "Delete listing"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function AdminUnclaimedListingsSearchParamsClient() {
  const searchParams = useSearchParams();
  const showSavedBanner = searchParams.get("saved") === "1";
  return <AdminUnclaimedListingsPageContent showSavedBanner={showSavedBanner} />;
}

export default function AdminUnclaimedListingsPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <AdminUnclaimedListingsSearchParamsClient />
    </Suspense>
  );
}
