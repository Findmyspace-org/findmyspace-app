"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Archive,
  Building2,
  ExternalLink,
  Eye,
  ImageIcon,
  PauseCircle,
  Pencil,
  PlayCircle,
  RotateCcw,
  Search,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  adminListingStatusBadgeClass,
  adminListingStatusLabel,
} from "@/lib/admin-listing-status-display";
import {
  canAdminToggleLiveStatus,
  getAdminSpaceVisibilityInfo,
} from "@/lib/admin-space-visibility";
import { isLiveListingStatus } from "@/lib/admin-listing-routing";
import type { PublicListingMode } from "@/lib/public-listing-mode";
import { isArchivedSpace } from "@/lib/space-archive";

type SpaceRow = {
  id: string;
  title: string;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  status: string | null;
  public_listing_mode: string | null;
  space_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  property_id: string | null;
  property_name: string | null;
  property_href: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  created_by_admin: boolean;
  enquiry_count: number;
  cover_image_url: string | null;
  edit_href: string;
  view_href: string | null;
};

const STATUS_FILTERS = [
  { key: "all", label: "All statuses" },
  { key: "draft", label: "Draft" },
  { key: "unclaimed", label: "Unclaimed" },
  { key: "owner_claimed", label: "Owner claimed" },
  { key: "pending_verification", label: "Pending review" },
  { key: "needs_changes", label: "Needs changes" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "rejected", label: "Rejected" },
  { key: "deleted", label: "Archived" },
];

export default function AdminAllSpacesPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SpaceRow | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const qs = params.toString();
      const result = await adminApiFetch(
        `/api/admin/spaces/all${qs ? `?${qs}` : ""}`
      );
      setSpaces((result.spaces as SpaceRow[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load spaces.");
      setSpaces([]);
    }
    setLoading(false);
  }, [statusFilter, searchQuery]);

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
      setRole((profile as { role?: string | null } | null)?.role || "user");
    }
    void init();
  }, []);

  useEffect(() => {
    if (hasAdminUiAccess(role)) void load();
  }, [role, load]);

  const filteredCount = useMemo(() => spaces.length, [spaces]);

  async function setPublicListingMode(
    space: SpaceRow,
    mode: PublicListingMode,
    overrideNeedsChanges = false
  ) {
    setUpdatingId(space.id);
    setMessage("");
    try {
      const result = await adminApiFetch(
        `/api/admin/spaces/${space.id}/public-listing-mode`,
        {
          method: "POST",
          body: JSON.stringify({ mode, overrideNeedsChanges }),
        }
      );
      const nextMode =
        (result.public_listing_mode as string | undefined) || mode;
      const nextStatus =
        (result.status as string | undefined) || space.status;
      setSpaces((current) =>
        current.map((row) =>
          row.id === space.id
            ? {
                ...row,
                public_listing_mode: nextMode,
                status: nextStatus,
              }
            : row
        )
      );
      setMessage(
        mode === "off"
          ? "Listing hidden from public."
          : mode === "enquiry"
            ? "Listing is now public enquiry-only."
            : "Listing is now live and bookable."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update visibility.");
    }
    setUpdatingId(null);
  }

  async function archiveSpace(space: SpaceRow) {
    setUpdatingId(space.id);
    setArchiveError(null);
    setMessage("");
    try {
      const result = await adminApiFetch(`/api/admin/spaces/${space.id}/archive`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (result.ok !== true) {
        throw new Error(
          (typeof result.error === "string" && result.error) ||
            "Archive did not complete."
        );
      }

      setArchiveTarget(null);
      setArchiveError(null);
      setMessage("Space archived.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not archive space.";
      setArchiveError(msg);
      setMessage(msg);
    } finally {
      setUpdatingId(null);
    }
  }

  async function restoreSpace(space: SpaceRow) {
    if (
      !window.confirm(
        `Restore "${space.title}" to draft (hidden)? You can set enquiry or live visibility again from this table.`
      )
    ) {
      return;
    }
    setUpdatingId(space.id);
    setMessage("");
    try {
      await adminApiFetch(`/api/admin/spaces/${space.id}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (statusFilter === "deleted") {
        setSpaces((current) => current.filter((row) => row.id !== space.id));
      } else {
        setSpaces((current) =>
          current.map((row) =>
            row.id === space.id
              ? {
                  ...row,
                  status: "draft",
                  public_listing_mode: "off",
                }
              : row
          )
        );
      }
      setMessage(`"${space.title}" restored to draft.`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not restore space.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleLiveStatus(space: SpaceRow) {
    if (!canAdminToggleLiveStatus(space)) return;
    const nextStatus = space.status === "active" ? "paused" : "active";
    const nextMode = nextStatus === "paused" ? "off" : "live";
    setUpdatingId(space.id);
    setMessage("");
    try {
      await adminApiFetch(`/api/admin/spaces/${space.id}/live-status`, {
        method: "POST",
        body: JSON.stringify({ status: nextStatus }),
      });
      setSpaces((current) =>
        current.map((row) =>
          row.id === space.id
            ? { ...row, status: nextStatus, public_listing_mode: nextMode }
            : row
        )
      );
      setMessage(
        nextStatus === "paused" ? "Listing paused." : "Listing resumed."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update status.");
    }
    setUpdatingId(null);
  }

  if (loading && role === null) {
    return (
      <div className="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-6">
        Loading…
      </div>
    );
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <div className="mx-auto max-w-7xl rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-800">Access denied</h1>
        <p className="mt-2 text-sm text-red-700">
          You do not have admin access to this area.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#192a3a]">
          All spaces
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Every space across Venue Scout, unclaimed listings, properties, and
          owner listings — one operational view.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Search
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load();
              }}
              placeholder="Title, location, property, owner…"
              className="w-full border-0 bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {STATUS_FILTERS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#243a4f]"
        >
          Apply filters
        </button>
      </div>

      {message ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800">
          {message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-sm text-gray-600">
            {loading ? "Loading…" : `${filteredCount} space${filteredCount === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Space</th>
                <th className="px-4 py-3 font-semibold">Property / venue</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Visibility</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 font-semibold">Enquiries</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!loading && spaces.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No spaces match your filters.
                  </td>
                </tr>
              ) : null}

              {spaces.map((space) => {
                const archived = isArchivedSpace(space.status);
                const visibility = getAdminSpaceVisibilityInfo(space);
                const location =
                  [space.suburb, space.city].filter(Boolean).join(", ") ||
                  space.address_line_1 ||
                  "—";

                return (
                  <tr key={space.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="flex min-w-[200px] items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100">
                          {space.cover_image_url ? (
                            <Image
                              src={space.cover_image_url}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#192a3a]">
                            {space.title}
                          </p>
                          {space.space_type ? (
                            <p className="truncate text-xs text-gray-500">
                              {space.space_type}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {space.property_href && space.property_name ? (
                        <Link
                          href={space.property_href}
                          className="inline-flex items-center gap-1 text-[#192a3a] hover:underline"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          {space.property_name}
                        </Link>
                      ) : space.created_by_admin ? (
                        <span className="text-gray-600">Admin created</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{location}</td>
                    <td className="px-4 py-3">
                      <span className={adminListingStatusBadgeClass(space.status)}>
                        {adminListingStatusLabel(space.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <span className={visibility.visibilityBadgeClass}>
                          {visibility.visibilityLabel}
                        </span>
                        <p className="text-[11px] text-gray-500">
                          {visibility.bookabilityLabel}
                        </p>
                        <select
                          value={space.public_listing_mode || "off"}
                          disabled={updatingId === space.id || archived}
                          onChange={(e) => {
                            const value = e.target.value as PublicListingMode;
                            if (value === space.public_listing_mode) return;
                            if (
                              value === "enquiry" &&
                              space.status === "needs_changes"
                            ) {
                              const ok = window.confirm(
                                "This listing has requested changes. Set it public enquiry-only anyway?"
                              );
                              if (!ok) {
                                e.target.value = space.public_listing_mode || "off";
                                return;
                              }
                              void setPublicListingMode(space, value, true);
                              return;
                            }
                            void setPublicListingMode(space, value);
                          }}
                          className="block w-full min-w-[140px] rounded-md border border-gray-200 px-2 py-1 text-xs disabled:opacity-50"
                        >
                          <option value="off">Hidden</option>
                          <option value="enquiry">Public enquiry-only</option>
                          <option value="live">Live / bookable</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {space.owner_name || space.owner_email ? (
                        <div>
                          <p className="font-medium text-[#192a3a]">
                            {space.owner_name || "Owner"}
                          </p>
                          {space.owner_email ? (
                            <p className="text-xs text-gray-500">
                              {space.owner_email}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {space.updated_at
                        ? format(new Date(space.updated_at), "dd MMM yyyy")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {space.enquiry_count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[180px] flex-wrap gap-1.5">
                        {space.view_href ? (
                          <Link
                            href={space.view_href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium hover:bg-gray-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                        ) : null}
                        <Link
                          href={space.edit_href}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium hover:bg-gray-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                        {space.property_href ? (
                          <Link
                            href={space.property_href}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium hover:bg-gray-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Property
                          </Link>
                        ) : null}
                        {!archived && canAdminToggleLiveStatus(space) ? (
                          <button
                            type="button"
                            disabled={updatingId === space.id}
                            onClick={() => void toggleLiveStatus(space)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                          >
                            {space.status === "active" ? (
                              <>
                                <PauseCircle className="h-3.5 w-3.5" />
                                Pause
                              </>
                            ) : (
                              <>
                                <PlayCircle className="h-3.5 w-3.5" />
                                Resume
                              </>
                            )}
                          </button>
                        ) : null}
                        {archived ? (
                          <button
                            type="button"
                            disabled={updatingId === space.id}
                            onClick={() => void restoreSpace(space)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={updatingId === space.id}
                            onClick={() => {
                              setArchiveError(null);
                              setArchiveTarget(space);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {archiveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-labelledby="archive-space-title"
          >
            <h2
              id="archive-space-title"
              className="text-lg font-semibold text-[#192a3a]"
            >
              Archive this space?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium text-[#192a3a]">{archiveTarget.title}</span>{" "}
              will be removed from public browse and default admin lists.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>Bookings, enquiries, payments, and photos are kept.</li>
              <li>Archive is blocked while open bookings are in progress.</li>
              <li>You can restore to draft later from the Archived filter.</li>
            </ul>
            {archiveError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {archiveError}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={updatingId === archiveTarget.id}
                onClick={() => {
                  setArchiveTarget(null);
                  setArchiveError(null);
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingId === archiveTarget.id}
                onClick={() => void archiveSpace(archiveTarget)}
                className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 disabled:opacity-50"
              >
                {updatingId === archiveTarget.id ? "Archiving…" : "Archive space"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
