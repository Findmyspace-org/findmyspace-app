"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Archive,
  Eye,
  ImageIcon,
  PauseCircle,
  Pencil,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { adminListingStatusBadgeClass } from "@/lib/admin-listing-status-display";
import { canAdminToggleLiveStatus } from "@/lib/admin-space-visibility";
import {
  matchesPropertySpaceHealthFilter,
  type PropertySpaceHealthFilter,
  type PropertySpaceRow,
} from "@/lib/property-space-ops";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import type { PublicListingMode } from "@/lib/public-listing-mode";

type AdminPropertySpacesHubProps = {
  propertyId: string;
  spaces: PropertySpaceRow[];
  archivedSpaces: PropertySpaceRow[];
  healthFilter: PropertySpaceHealthFilter;
  onReload: () => Promise<void>;
  onMessage: (message: string) => void;
};

export function AdminPropertySpacesHub({
  propertyId,
  spaces,
  archivedSpaces,
  healthFilter,
  onReload,
  onMessage,
}: AdminPropertySpacesHubProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<PropertySpaceRow | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const visibleSpaces = useMemo(() => {
    const list = showArchived ? [...spaces, ...archivedSpaces] : spaces;
    if (!healthFilter) return list;
    return list.filter((space) => matchesPropertySpaceHealthFilter(space, healthFilter));
  }, [archivedSpaces, healthFilter, showArchived, spaces]);

  const selectableSpaces = useMemo(
    () => visibleSpaces.filter((space) => !space.is_archived),
    [visibleSpaces]
  );

  const allSelected =
    selectableSpaces.length > 0 &&
    selectableSpaces.every((space) => selectedIds.has(space.id));

  function toggleSelect(spaceId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableSpaces.map((space) => space.id)));
  }

  async function setPublicListingMode(
    space: PropertySpaceRow,
    mode: PublicListingMode,
    overrideNeedsChanges = false
  ) {
    setUpdatingId(space.id);
    onMessage("");
    try {
      await adminApiFetch(
        `/api/admin/spaces/${space.id}/public-listing-mode`,
        {
          method: "POST",
          body: JSON.stringify({ mode, overrideNeedsChanges }),
        }
      );
      await onReload();
      onMessage(
        mode === "off"
          ? `"${space.title}" hidden from public.`
          : mode === "enquiry"
            ? `"${space.title}" is now enquiry-only.`
            : `"${space.title}" is now live.`
      );
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not update visibility.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function archiveSpace(space: PropertySpaceRow) {
    setUpdatingId(space.id);
    setArchiveError(null);
    onMessage("");
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
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(space.id);
        return next;
      });
      await onReload();
      onMessage(`"${space.title}" archived.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not archive space.";
      setArchiveError(msg);
      onMessage(msg);
    } finally {
      setUpdatingId(null);
    }
  }

  async function restoreSpace(space: PropertySpaceRow) {
    if (
      !window.confirm(
        `Restore "${space.title}" to draft (hidden)? You can set enquiry or live visibility again from this page.`
      )
    ) {
      return;
    }
    setUpdatingId(space.id);
    onMessage("");
    try {
      await adminApiFetch(`/api/admin/spaces/${space.id}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await onReload();
      onMessage(`"${space.title}" restored to draft.`);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not restore space.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleLiveStatus(space: PropertySpaceRow) {
    if (!canAdminToggleLiveStatus(space)) return;
    const nextStatus = space.status === "active" ? "paused" : "active";
    setUpdatingId(space.id);
    onMessage("");
    try {
      await adminApiFetch(`/api/admin/spaces/${space.id}/live-status`, {
        method: "POST",
        body: JSON.stringify({ status: nextStatus }),
      });
      await onReload();
      onMessage(
        nextStatus === "paused"
          ? `"${space.title}" paused.`
          : `"${space.title}" resumed.`
      );
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not update live status.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function runBulkAction(action: "hidden" | "enquiry" | "archive") {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    if (action === "archive") {
      const ok = window.confirm(
        `Archive ${ids.length} selected space(s)? Open bookings will block archive for affected listings.`
      );
      if (!ok) return;
    }

    setBulkUpdating(true);
    onMessage("");
    let success = 0;
    const failures: string[] = [];

    for (const spaceId of ids) {
      const space = spaces.find((row) => row.id === spaceId);
      if (!space) continue;
      try {
        if (action === "archive") {
          const result = await adminApiFetch(
            `/api/admin/spaces/${spaceId}/archive`,
            { method: "POST", body: JSON.stringify({}) }
          );
          if (result.ok !== true) {
            throw new Error(
              (typeof result.error === "string" && result.error) || "Archive failed."
            );
          }
        } else {
          await adminApiFetch(`/api/admin/spaces/${spaceId}/public-listing-mode`, {
            method: "POST",
            body: JSON.stringify({
              mode: action === "hidden" ? "off" : "enquiry",
            }),
          });
        }
        success++;
      } catch (err) {
        failures.push(
          `${space.title}: ${err instanceof Error ? err.message : "Failed"}`
        );
      }
    }

    setSelectedIds(new Set());
    await onReload();
    if (failures.length === 0) {
      onMessage(`Updated ${success} space(s).`);
    } else {
      onMessage(
        `${success} updated, ${failures.length} failed. ${failures.slice(0, 2).join("; ")}`
      );
    }
    setBulkUpdating(false);
  }

  function handleVisibilityClick(
    space: PropertySpaceRow,
    mode: PublicListingMode
  ) {
    if (space.public_listing_mode === mode) return;
    if (mode === "enquiry" && space.status === "needs_changes") {
      const ok = window.confirm(
        "This listing has requested changes. Set it public enquiry-only anyway?"
      );
      if (!ok) return;
      void setPublicListingMode(space, mode, true);
      return;
    }
    void setPublicListingMode(space, mode);
  }

  function actionButtonClass(active = false) {
    return `rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
      active
        ? "border-[#0f2740] bg-[#0f2740] text-white"
        : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
    }`;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Spaces</h2>
          <p className="text-sm text-gray-600">
            Manage visibility, archive, and edits without leaving this property.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {archivedSpaces.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              {showArchived ? "Hide archived" : `Show archived (${archivedSpaces.length})`}
            </button>
          ) : null}
          <Link
            href={`/admin/properties/${propertyId}/spaces/new`}
            className="rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
          >
            Add space
          </Link>
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#0f2740]/20 bg-[#0f2740]/5 px-3 py-2">
          <span className="text-sm font-medium text-[#0f2740]">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            disabled={bulkUpdating}
            onClick={() => void runBulkAction("hidden")}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Set hidden
          </button>
          <button
            type="button"
            disabled={bulkUpdating}
            onClick={() => void runBulkAction("enquiry")}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Set enquiry only
          </button>
          <button
            type="button"
            disabled={bulkUpdating}
            onClick={() => void runBulkAction("archive")}
            className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
          >
            Archive
          </button>
          <button
            type="button"
            disabled={bulkUpdating}
            onClick={() => setSelectedIds(new Set())}
            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
          >
            Clear
          </button>
        </div>
      ) : null}

      {visibleSpaces.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">
          {healthFilter
            ? "No spaces match this filter."
            : "No spaces yet."}{" "}
          {!healthFilter ? (
            <Link
              href={`/admin/properties/${propertyId}/spaces/new`}
              className="font-semibold text-[#0f2740] hover:underline"
            >
              Add the first space
            </Link>
          ) : null}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all spaces"
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-2 py-2">Space</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Visibility</th>
                <th className="px-2 py-2">Bookings</th>
                <th className="px-2 py-2">Updated</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleSpaces.map((space) => {
                const mode = space.public_listing_mode || "off";
                const busy = updatingId === space.id || bulkUpdating;
                const archived = space.is_archived;

                return (
                  <tr key={space.id} className="align-top">
                    <td className="px-2 py-3">
                      {!archived ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(space.id)}
                          onChange={() => toggleSelect(space.id)}
                          aria-label={`Select ${space.title}`}
                          className="rounded border-gray-300"
                        />
                      ) : null}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex min-w-[180px] items-center gap-3">
                        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                          {space.cover_image_url ? (
                            <Image
                              src={space.cover_image_url}
                              alt=""
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#0f2740]">
                            {space.title}
                          </p>
                          {space.space_type ? (
                            <p className="truncate text-xs text-gray-500">
                              {formatSpaceTypeLabel(space.space_type)}
                            </p>
                          ) : null}
                          <p
                            className={`mt-0.5 text-xs ${
                              space.has_ai_information
                                ? "text-green-700"
                                : "text-amber-800"
                            }`}
                          >
                            AI Information:{" "}
                            {space.has_ai_information ? "✓ Added" : "⚠ Missing"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={adminListingStatusBadgeClass(space.status)}
                      >
                        {space.status_label}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <p className="text-xs font-medium text-gray-800">
                        {space.visibility_label}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      <p className="text-xs text-gray-600">
                        {space.bookability_label}
                      </p>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-gray-600">
                      {space.updated_at
                        ? format(new Date(space.updated_at), "dd MMM yyyy")
                        : "—"}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex min-w-[220px] flex-wrap gap-1.5">
                        <Link
                          href={space.admin_edit_url}
                          className={actionButtonClass()}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </span>
                        </Link>
                        {space.view_href ? (
                          <Link
                            href={space.view_href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={actionButtonClass()}
                          >
                            <span className="inline-flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </span>
                          </Link>
                        ) : null}
                        {!archived ? (
                          <>
                            {mode !== "off" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  handleVisibilityClick(space, "off")
                                }
                                className={actionButtonClass(mode === "off")}
                              >
                                Hidden
                              </button>
                            ) : null}
                            {mode !== "enquiry" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  handleVisibilityClick(space, "enquiry")
                                }
                                className={actionButtonClass(mode === "enquiry")}
                              >
                                Enquiry
                              </button>
                            ) : null}
                            {mode !== "live" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  handleVisibilityClick(space, "live")
                                }
                                className={actionButtonClass(mode === "live")}
                              >
                                Live
                              </button>
                            ) : null}
                            {canAdminToggleLiveStatus(space) ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void toggleLiveStatus(space)}
                                className={actionButtonClass()}
                              >
                                <span className="inline-flex items-center gap-1">
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
                                </span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setArchiveError(null);
                                setArchiveTarget(space);
                              }}
                              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                            >
                              <span className="inline-flex items-center gap-1">
                                <Archive className="h-3.5 w-3.5" />
                                Archive
                              </span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void restoreSpace(space)}
                            className={actionButtonClass()}
                          >
                            <span className="inline-flex items-center gap-1">
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </span>
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
      )}

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
              <span className="font-medium text-[#192a3a]">
                {archiveTarget.title}
              </span>{" "}
              will be removed from public browse and default admin lists.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>Bookings, enquiries, payments, and photos are kept.</li>
              <li>Archive is blocked while open bookings are in progress.</li>
              <li>You can restore to draft later from this property page.</li>
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
    </section>
  );
}
