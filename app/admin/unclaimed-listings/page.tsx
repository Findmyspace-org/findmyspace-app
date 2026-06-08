"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  Building2,
  ClipboardList,
  ImageIcon,
  Inbox,
  LayoutDashboard,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminApiFetch } from "@/lib/admin-api-client";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import {
  ADMIN_LISTING_FILTER_OPTIONS,
  adminListingStatusBadgeClass,
  adminListingStatusLabel,
  matchesAdminListingFilter,
  type AdminListingFilterKey,
} from "@/lib/admin-listing-status-display";

type ListingRow = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
  space_type: string | null;
  status: string | null;
  created_at: string;
  enquiry_count: number;
  cover_image_url: string | null;
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
      if (r === "admin") {
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

  if (loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (role !== "admin") {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/venue-scout"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Venue scout
          </Link>
          <Link
            href="/admin/unclaimed-listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Unclaimed listings
          </Link>
          <Link
            href="/admin/listing-enquiries"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Inbox className="h-4 w-4" />
            Listing enquiries
          </Link>
          <Link
            href="/admin/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            Listings
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Verification
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Unclaimed listings</h1>
            <p className="mt-1 text-sm text-gray-600">
              Admin-created venues — scout, publish, and track through claim and review.
            </p>
          </div>
          <Link
            href="/admin/unclaimed-listings/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New unclaimed listing
          </Link>
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
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Image</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 md:table-cell">Category</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Location</th>
                  <th className="px-4 py-3">Enquiries</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredListings.map((row) => {
                  const location =
                    [row.suburb, row.city].filter(Boolean).join(", ") || "—";
                  const editHref = `/admin/unclaimed-listings/${row.id}/edit`;

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50/80"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={editHref}
                          className="block h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
                          title="Edit listing"
                        >
                          {row.cover_image_url ? (
                            <Image
                              src={row.cover_image_url}
                              alt=""
                              width={64}
                              height={64}
                              className="h-full w-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-gray-400">
                              <ImageIcon className="h-6 w-6" />
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={editHref}
                          className="font-semibold text-gray-900 hover:text-[#0f2740] hover:underline"
                        >
                          {row.title || "Untitled"}
                        </Link>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {location}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 md:hidden">
                          {formatSpaceTypeLabel(row.space_type)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={adminListingStatusBadgeClass(row.status)}>
                          {adminListingStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                        {formatSpaceTypeLabel(row.space_type)}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">
                        {location}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.enquiry_count}</td>
                      <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">
                        {format(new Date(row.created_at), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={editHref}
                          className="font-medium text-[#0f2740] hover:underline"
                        >
                          Edit
                        </Link>
                        {row.status === "unclaimed" ? (
                          <>
                            {" · "}
                            <Link
                              href={`/spaces/${row.id}`}
                              className="text-gray-600 hover:underline"
                              target="_blank"
                            >
                              Public
                            </Link>
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
