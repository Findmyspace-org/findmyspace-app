"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  ImageIcon,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  adminSpaceEditSectionHref,
  bookablePillClass,
  matrixStatusLabel,
  matrixStatusPillClass,
  matrixStatusSelectValue,
  resolveMatrixStatus,
  type MatrixStatusValue,
} from "@/lib/admin-space-matrix";
import { adminSpacePublicViewHref } from "@/lib/admin-space-visibility";
import { adminPropertySpaceEditHref } from "@/lib/admin-listing-routing";
import type { PropertySpaceRow } from "@/lib/property-space-ops";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";

type RowFeedback = {
  type: "success" | "error";
  message: string;
} | null;

type PropertySpaceReadinessMatrixProps = {
  propertyId: string;
  spaces: PropertySpaceRow[];
  onSpaceUpdated: (spaceId: string, patch: Partial<PropertySpaceRow>) => void;
  onReload?: () => Promise<void>;
  archivedCount?: number;
  showArchived?: boolean;
  onToggleArchived?: () => void;
};

const STATUS_OPTIONS: { value: MatrixStatusValue; label: string }[] = [
  { value: "hidden", label: "Hidden" },
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
  { value: "enquiry", label: "Enquiry" },
  { value: "archived", label: "Archived" },
];

const BOOKABLE_OPTIONS = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

function ReadinessCell({
  complete,
  href,
  label,
}: {
  complete: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2740]"
      title={complete ? `${label} complete — edit` : `${label} missing — fix`}
      aria-label={
        complete ? `${label} complete, open edit` : `${label} missing, open edit`
      }
    >
      {complete ? (
        <Check className="h-4 w-4 text-green-600" aria-hidden />
      ) : (
        <X className="h-4 w-4 text-gray-400" aria-hidden />
      )}
    </Link>
  );
}

function InlineMatrixSelect<T extends string | boolean>({
  value,
  displayLabel,
  pillClass,
  options,
  disabled,
  loading,
  onSelect,
}: {
  value: T;
  displayLabel: string;
  pillClass: string;
  options: { value: T; label: string }[];
  disabled?: boolean;
  loading?: boolean;
  onSelect: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex items-center gap-1 rounded-full transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${pillClass}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : null}
        <span>{displayLabel}</span>
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 z-20 mt-1 min-w-[7.5rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((option) => (
            <li
              key={String(option.value)}
              role="option"
              aria-selected={option.value === value}
            >
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  option.value === value
                    ? "font-semibold text-[#0f2740]"
                    : "text-gray-700"
                }`}
                onClick={() => {
                  setOpen(false);
                  if (option.value !== value) onSelect(option.value);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SpaceThumbnail({ space }: { space: PropertySpaceRow }) {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
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
          <ImageIcon className="h-4 w-4 text-gray-400" aria-hidden />
        </div>
      )}
    </div>
  );
}

function MatrixActionLink({
  href,
  label,
  icon: Icon,
  external,
  disabled,
}: {
  href: string;
  label: string;
  icon: typeof ExternalLink;
  external?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-400">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-800 transition hover:bg-gray-50"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}

function useMatrixRowActions(
  space: PropertySpaceRow,
  propertyId: string,
  onSpaceUpdated: PropertySpaceReadinessMatrixProps["onSpaceUpdated"],
  onReload?: () => Promise<void>
) {
  const [statusLoading, setStatusLoading] = useState(false);
  const [bookableLoading, setBookableLoading] = useState(false);
  const [feedback, setFeedback] = useState<RowFeedback>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const matrixStatus = resolveMatrixStatus({
    status: space.status,
    public_listing_mode: space.public_listing_mode,
  });
  const statusValue = matrixStatusSelectValue(matrixStatus);
  const editHref = adminPropertySpaceEditHref(propertyId, space.id);
  const viewHref =
    adminSpacePublicViewHref({
      id: space.id,
      status: space.status,
      public_listing_mode: space.public_listing_mode,
    }) ?? null;

  const patchSpace = useCallback(
    (patch: Partial<PropertySpaceRow>) => {
      onSpaceUpdated(space.id, patch);
    },
    [onSpaceUpdated, space.id]
  );

  async function applyStatus(next: MatrixStatusValue) {
    setStatusLoading(true);
    setFeedback(null);
    try {
      const result = await adminApiFetch(`/api/admin/spaces/${space.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      patchSpace({
        status: result.status as string | null,
        public_listing_mode: result.public_listing_mode as string | null,
        is_bookable: Boolean(result.is_bookable),
        is_archived: next === "archived",
      });

      setFeedback({ type: "success", message: "Status updated." });
      await onReload?.();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Could not update status.",
      });
    } finally {
      setStatusLoading(false);
      setArchiveConfirm(false);
    }
  }

  function requestStatus(next: MatrixStatusValue) {
    if (next === "archived" && next !== statusValue) {
      setArchiveConfirm(true);
      return;
    }
    void applyStatus(next);
  }

  async function updateBookable(next: boolean) {
    setBookableLoading(true);
    setFeedback(null);
    try {
      const result = await adminApiFetch(`/api/admin/spaces/${space.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_bookable: next }),
      });

      patchSpace({ is_bookable: Boolean(result.is_bookable) });
      setFeedback({ type: "success", message: "Bookable updated." });
      await onReload?.();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Could not update bookable.",
      });
    } finally {
      setBookableLoading(false);
    }
  }

  return {
    matrixStatus,
    statusValue,
    editHref,
    viewHref,
    statusLoading,
    bookableLoading,
    feedback,
    archiveConfirm,
    setArchiveConfirm,
    requestStatus,
    applyStatus,
    updateBookable,
  };
}

function ArchiveConfirmDialog({
  spaceTitle,
  busy,
  onCancel,
  onConfirm,
}: {
  spaceTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-labelledby="matrix-archive-title"
      >
        <h2 id="matrix-archive-title" className="text-lg font-semibold text-gray-900">
          Archive this space?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{spaceTitle}</span> will be
          removed from public browse and default admin lists.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>Bookings, enquiries, payments, and photos are kept.</li>
          <li>Archive is blocked while open bookings are in progress.</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 disabled:opacity-50"
          >
            {busy ? "Archiving…" : "Archive space"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MatrixRow({
  space,
  propertyId,
  onSpaceUpdated,
  onReload,
}: {
  space: PropertySpaceRow;
  propertyId: string;
  onSpaceUpdated: PropertySpaceReadinessMatrixProps["onSpaceUpdated"];
  onReload?: () => Promise<void>;
}) {
  const actions = useMatrixRowActions(space, propertyId, onSpaceUpdated, onReload);

  return (
    <>
      <tr className="group border-b border-gray-100 last:border-0 hover:bg-gray-50/70">
        <td className="px-2 py-2.5">
          <SpaceThumbnail space={space} />
        </td>
        <td className="px-2 py-2.5">
          <div className="min-w-[120px] max-w-[180px]">
            <p className="truncate text-sm font-medium text-gray-900">{space.title}</p>
            {space.space_type ? (
              <p className="truncate text-[11px] text-gray-500">
                {formatSpaceTypeLabel(space.space_type)}
              </p>
            ) : null}
          </div>
        </td>
        <td className="px-2 py-2.5">
          <InlineMatrixSelect
            value={actions.statusValue}
            displayLabel={matrixStatusLabel(actions.matrixStatus)}
            pillClass={matrixStatusPillClass(actions.matrixStatus)}
            options={STATUS_OPTIONS}
            loading={actions.statusLoading}
            onSelect={actions.requestStatus}
          />
        </td>
        <td className="px-2 py-2.5">
          <InlineMatrixSelect
            value={space.is_bookable}
            displayLabel={space.is_bookable ? "Yes" : "No"}
            pillClass={bookablePillClass(space.is_bookable)}
            options={BOOKABLE_OPTIONS}
            loading={actions.bookableLoading}
            disabled={space.is_archived}
            onSelect={(value) => void actions.updateBookable(value)}
          />
        </td>
        <td className="px-2 py-2.5 text-center">
          <ReadinessCell
            complete={space.has_photos}
            href={adminSpaceEditSectionHref(actions.editHref, "photos")}
            label="Photos"
          />
        </td>
        <td className="px-2 py-2.5 text-center">
          <ReadinessCell
            complete={space.has_pricing}
            href={adminSpaceEditSectionHref(actions.editHref, "pricing")}
            label="Pricing"
          />
        </td>
        <td className="px-2 py-2.5 text-center">
          <ReadinessCell
            complete={space.has_location}
            href={adminSpaceEditSectionHref(actions.editHref, "location")}
            label="Location"
          />
        </td>
        <td className="px-2 py-2.5 text-center">
          <ReadinessCell
            complete={space.has_ai_information}
            href={adminSpaceEditSectionHref(actions.editHref, "ai")}
            label="AI Information"
          />
        </td>
        <td className="px-2 py-2.5">
          <MatrixActionLink
            href={actions.viewHref ?? "#"}
            label="View"
            icon={ExternalLink}
            external
            disabled={!actions.viewHref}
          />
        </td>
        <td className="px-2 py-2.5">
          <MatrixActionLink href={actions.editHref} label="Edit" icon={Pencil} />
        </td>
      </tr>
      {actions.feedback ? (
        <tr className="border-b border-gray-100 last:border-0">
          <td colSpan={10} className="px-3 pb-2 pt-0">
            <p
              className={`text-xs ${
                actions.feedback.type === "success" ? "text-green-700" : "text-red-600"
              }`}
              role="status"
            >
              {actions.feedback.message}
            </p>
          </td>
        </tr>
      ) : null}
      {actions.archiveConfirm ? (
        <ArchiveConfirmDialog
          spaceTitle={space.title}
          busy={actions.statusLoading}
          onCancel={() => actions.setArchiveConfirm(false)}
          onConfirm={() => void actions.applyStatus("archived")}
        />
      ) : null}
    </>
  );
}

function MobileMatrixCard({
  space,
  propertyId,
  onSpaceUpdated,
  onReload,
}: {
  space: PropertySpaceRow;
  propertyId: string;
  onSpaceUpdated: PropertySpaceReadinessMatrixProps["onSpaceUpdated"];
  onReload?: () => Promise<void>;
}) {
  const actions = useMatrixRowActions(space, propertyId, onSpaceUpdated, onReload);

  const readinessItems = [
    { key: "photos" as const, label: "Photos", complete: space.has_photos },
    { key: "pricing" as const, label: "Pricing", complete: space.has_pricing },
    { key: "location" as const, label: "Location", complete: space.has_location },
    { key: "ai" as const, label: "AI Info", complete: space.has_ai_information },
  ];

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <SpaceThumbnail space={space} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{space.title}</p>
            {space.space_type ? (
              <p className="truncate text-xs text-gray-500">
                {formatSpaceTypeLabel(space.space_type)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <InlineMatrixSelect
            value={actions.statusValue}
            displayLabel={matrixStatusLabel(actions.matrixStatus)}
            pillClass={matrixStatusPillClass(actions.matrixStatus)}
            options={STATUS_OPTIONS}
            loading={actions.statusLoading}
            onSelect={actions.requestStatus}
          />
          <InlineMatrixSelect
            value={space.is_bookable}
            displayLabel={space.is_bookable ? "Yes" : "No"}
            pillClass={bookablePillClass(space.is_bookable)}
            options={BOOKABLE_OPTIONS}
            loading={actions.bookableLoading}
            disabled={space.is_archived}
            onSelect={(value) => void actions.updateBookable(value)}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {readinessItems.map((item) => (
            <Link
              key={item.key}
              href={adminSpaceEditSectionHref(actions.editHref, item.key)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
            >
              {item.complete ? (
                <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />
              ) : (
                <X className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              )}
              {item.label}
            </Link>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <MatrixActionLink
            href={actions.viewHref ?? "#"}
            label="View"
            icon={ExternalLink}
            external
            disabled={!actions.viewHref}
          />
          <MatrixActionLink href={actions.editHref} label="Edit" icon={Pencil} />
        </div>

        {actions.feedback ? (
          <p
            className={`mt-2 text-xs ${
              actions.feedback.type === "success" ? "text-green-700" : "text-red-600"
            }`}
            role="status"
          >
            {actions.feedback.message}
          </p>
        ) : null}
      </div>
      {actions.archiveConfirm ? (
        <ArchiveConfirmDialog
          spaceTitle={space.title}
          busy={actions.statusLoading}
          onCancel={() => actions.setArchiveConfirm(false)}
          onConfirm={() => void actions.applyStatus("archived")}
        />
      ) : null}
    </>
  );
}

export function PropertySpaceReadinessMatrix({
  propertyId,
  spaces,
  onSpaceUpdated,
  onReload,
  archivedCount = 0,
  showArchived = false,
  onToggleArchived,
}: PropertySpaceReadinessMatrixProps) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {spaces.length} {spaces.length === 1 ? "space" : "spaces"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {archivedCount > 0 && onToggleArchived ? (
            <button
              type="button"
              onClick={onToggleArchived}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
            >
              {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
            </button>
          ) : null}
          <Link
            href={`/admin/properties/${propertyId}/spaces/new`}
            className="rounded-lg bg-[#0f2740] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
          >
            Add space
          </Link>
        </div>
      </div>

      {spaces.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center text-sm text-gray-500">
          No spaces match this view.{" "}
          <Link
            href={`/admin/properties/${propertyId}/spaces/new`}
            className="font-semibold text-[#0f2740] hover:underline"
          >
            Add a space
          </Link>
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
                  <tr>
                    {[
                      "Photo",
                      "Space",
                      "Status",
                      "Bookable",
                      "Photos",
                      "Pricing",
                      "Location",
                      "AI Info",
                      "View",
                      "Edit",
                    ].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className={`whitespace-nowrap px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${
                          ["Photos", "Pricing", "Location", "AI Info"].includes(heading)
                            ? "text-center"
                            : "text-left"
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {spaces.map((space) => (
                    <MatrixRow
                      key={space.id}
                      space={space}
                      propertyId={propertyId}
                      onSpaceUpdated={onSpaceUpdated}
                      onReload={onReload}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {spaces.map((space) => (
              <MobileMatrixCard
                key={space.id}
                space={space}
                propertyId={propertyId}
                onSpaceUpdated={onSpaceUpdated}
                onReload={onReload}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
