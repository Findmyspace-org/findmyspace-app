"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  adminSpaceEditSectionHref,
  bookablePillClass,
  matrixStatusLabel,
  matrixStatusPillClass,
  resolveMatrixStatus,
  type MatrixStatusDisplay,
  type MatrixStatusValue,
} from "@/lib/admin-space-matrix";
import type { PropertySpaceRow } from "@/lib/property-space-ops";

type RowFeedback = {
  type: "success" | "error";
  message: string;
} | null;

type PropertySpaceReadinessMatrixProps = {
  spaces: PropertySpaceRow[];
  onSpaceUpdated: (spaceId: string, patch: Partial<PropertySpaceRow>) => void;
  onReload?: () => Promise<void>;
};

const STATUS_OPTIONS: { value: MatrixStatusValue; label: string }[] = [
  { value: "hidden", label: "Hidden" },
  { value: "live", label: "Live" },
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
        <X className="h-4 w-4 text-amber-500/80" aria-hidden />
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
            <li key={String(option.value)} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  option.value === value ? "font-semibold text-[#0f2740]" : "text-gray-700"
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

function MatrixRow({
  space,
  onSpaceUpdated,
  onReload,
}: {
  space: PropertySpaceRow;
  onSpaceUpdated: PropertySpaceReadinessMatrixProps["onSpaceUpdated"];
  onReload?: () => Promise<void>;
}) {
  const [statusLoading, setStatusLoading] = useState(false);
  const [bookableLoading, setBookableLoading] = useState(false);
  const [feedback, setFeedback] = useState<RowFeedback>(null);

  const matrixStatus = resolveMatrixStatus({
    status: space.status,
    public_listing_mode: space.public_listing_mode,
  });

  const patchSpace = useCallback(
    (patch: Partial<PropertySpaceRow>) => {
      onSpaceUpdated(space.id, patch);
    },
    [onSpaceUpdated, space.id]
  );

  async function updateStatus(next: MatrixStatusValue) {
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
    }
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

  const statusForSelect: MatrixStatusValue =
    matrixStatus === "archived"
      ? "archived"
      : matrixStatus === "live"
        ? "live"
        : "hidden";

  return (
    <>
      <tr className="group border-b border-gray-100 last:border-0 hover:bg-gray-50/70">
        <td className="px-3 py-2.5">
          <Link
            href={space.admin_edit_url}
            className="text-sm font-medium text-gray-900 hover:text-[#0f2740] hover:underline"
          >
            {space.title}
          </Link>
        </td>
        <td className="px-3 py-2.5">
          <InlineMatrixSelect
            value={statusForSelect}
            displayLabel={matrixStatusLabel(matrixStatus)}
            pillClass={matrixStatusPillClass(matrixStatus)}
            options={STATUS_OPTIONS}
            loading={statusLoading}
            onSelect={(value) => void updateStatus(value)}
          />
        </td>
        <td className="px-3 py-2.5">
          <InlineMatrixSelect
            value={space.is_bookable}
            displayLabel={space.is_bookable ? "Yes" : "No"}
            pillClass={bookablePillClass(space.is_bookable)}
            options={BOOKABLE_OPTIONS}
            loading={bookableLoading}
            disabled={space.is_archived}
            onSelect={(value) => void updateBookable(value)}
          />
        </td>
        <td className="px-3 py-2.5 text-center">
          <ReadinessCell
            complete={space.has_photos}
            href={adminSpaceEditSectionHref(space.admin_edit_url, "photos")}
            label="Photos"
          />
        </td>
        <td className="px-3 py-2.5 text-center">
          <ReadinessCell
            complete={space.has_pricing}
            href={adminSpaceEditSectionHref(space.admin_edit_url, "pricing")}
            label="Pricing"
          />
        </td>
        <td className="px-3 py-2.5 text-center">
          <ReadinessCell
            complete={space.has_location}
            href={adminSpaceEditSectionHref(space.admin_edit_url, "location")}
            label="Location"
          />
        </td>
        <td className="px-3 py-2.5 text-center">
          <ReadinessCell
            complete={space.has_ai_information}
            href={adminSpaceEditSectionHref(space.admin_edit_url, "ai")}
            label="AI Information"
          />
        </td>
      </tr>
      {feedback ? (
        <tr className="border-b border-gray-100 last:border-0">
          <td colSpan={7} className="px-3 pb-2 pt-0">
            <p
              className={`text-xs ${
                feedback.type === "success" ? "text-green-700" : "text-red-600"
              }`}
              role="status"
            >
              {feedback.message}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MobileMatrixCard({
  space,
  onSpaceUpdated,
  onReload,
}: {
  space: PropertySpaceRow;
  onSpaceUpdated: PropertySpaceReadinessMatrixProps["onSpaceUpdated"];
  onReload?: () => Promise<void>;
}) {
  const [statusLoading, setStatusLoading] = useState(false);
  const [bookableLoading, setBookableLoading] = useState(false);
  const [feedback, setFeedback] = useState<RowFeedback>(null);

  const matrixStatus = resolveMatrixStatus({
    status: space.status,
    public_listing_mode: space.public_listing_mode,
  });

  const statusForSelect: MatrixStatusValue =
    matrixStatus === "archived"
      ? "archived"
      : matrixStatus === "live"
        ? "live"
        : "hidden";

  async function updateStatus(next: MatrixStatusValue) {
    setStatusLoading(true);
    setFeedback(null);
    try {
      const result = await adminApiFetch(`/api/admin/spaces/${space.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      onSpaceUpdated(space.id, {
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
    }
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
      onSpaceUpdated(space.id, { is_bookable: Boolean(result.is_bookable) });
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

  const readinessItems = [
    { key: "photos", label: "Photos", complete: space.has_photos },
    { key: "pricing", label: "Pricing", complete: space.has_pricing },
    { key: "location", label: "Location", complete: space.has_location },
    { key: "ai", label: "AI Info", complete: space.has_ai_information },
  ] as const;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <Link
        href={space.admin_edit_url}
        className="text-sm font-semibold text-gray-900 hover:text-[#0f2740] hover:underline"
      >
        {space.title}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <InlineMatrixSelect
          value={statusForSelect}
          displayLabel={matrixStatusLabel(matrixStatus)}
          pillClass={matrixStatusPillClass(matrixStatus)}
          options={STATUS_OPTIONS}
          loading={statusLoading}
          onSelect={(value) => void updateStatus(value)}
        />
        <InlineMatrixSelect
          value={space.is_bookable}
          displayLabel={space.is_bookable ? "Yes" : "No"}
          pillClass={bookablePillClass(space.is_bookable)}
          options={BOOKABLE_OPTIONS}
          loading={bookableLoading}
          disabled={space.is_archived}
          onSelect={(value) => void updateBookable(value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        {readinessItems.map((item) => (
          <Link
            key={item.key}
            href={adminSpaceEditSectionHref(
              space.admin_edit_url,
              item.key === "ai" ? "ai" : item.key
            )}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
          >
            {item.complete ? (
              <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5 text-amber-500/80" aria-hidden />
            )}
            {item.label}
          </Link>
        ))}
      </div>

      {feedback ? (
        <p
          className={`mt-2 text-xs ${
            feedback.type === "success" ? "text-green-700" : "text-red-600"
          }`}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

export function PropertySpaceReadinessMatrix({
  spaces,
  onSpaceUpdated,
  onReload,
}: PropertySpaceReadinessMatrixProps) {
  if (spaces.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center text-sm text-gray-500">
        No spaces yet. Add a space to track readiness here.
      </p>
    );
  }

  return (
    <div>
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                {[
                  "Space",
                  "Status",
                  "Bookable",
                  "Photos",
                  "Pricing",
                  "Location",
                  "AI Info",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${
                      heading === "Space" ? "text-left" : "text-center"
                    } ${heading === "Space" || heading === "Status" || heading === "Bookable" ? "text-left" : ""}`}
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
            onSpaceUpdated={onSpaceUpdated}
            onReload={onReload}
          />
        ))}
      </div>
    </div>
  );
}

export type { MatrixStatusDisplay };
