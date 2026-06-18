"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Eye,
  Heart,
  MessagesSquare,
} from "lucide-react";
import type { PropertyOnboardingProgress } from "@/lib/property-onboarding-progress";
import {
  buildReadinessAttentionItems,
  buildReadinessBreakdown,
  buildReadinessCompletedItems,
} from "@/lib/property-readiness-ui";
import type {
  PropertySpacesHealth,
  PropertySpacesSummary,
  PropertySpaceHealthFilter,
  PropertySpaceRow,
} from "@/lib/property-space-ops";
import { PropertySpaceReadinessMatrix } from "@/app/components/PropertySpaceReadinessMatrix";

export type PropertyActivitySummary = {
  bookings?: number;
  enquiries?: number;
  favourites?: number;
  views?: number;
};

export type PropertyReadinessDashboardProps = {
  variant: "admin" | "owner";
  summary: PropertySpacesSummary;
  health: PropertySpacesHealth;
  progress: PropertyOnboardingProgress;
  healthFilter?: PropertySpaceHealthFilter;
  onHealthFilterChange?: (filter: PropertySpaceHealthFilter) => void;
  attentionHrefs?: Record<string, string>;
  activity?: PropertyActivitySummary;
  matrixSpaces?: PropertySpaceRow[];
  onMatrixSpaceUpdated?: (spaceId: string, patch: Partial<PropertySpaceRow>) => void;
  onMatrixReload?: () => Promise<void>;
  propertyId?: string;
  matrixArchivedCount?: number;
  matrixShowArchived?: boolean;
  onMatrixToggleArchived?: () => void;
};

function StatStripItem({
  icon: Icon,
  value,
  label,
  tone = "neutral",
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  tone?: "blue" | "green" | "amber" | "grey" | "neutral";
}) {
  const iconClass =
    tone === "blue"
      ? "text-[#0f2740]"
      : tone === "green"
        ? "text-green-600"
        : tone === "amber"
          ? "text-amber-600"
          : tone === "grey"
            ? "text-gray-400"
            : "text-gray-500";

  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1.5">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} aria-hidden />
      <span className="text-sm font-semibold tabular-nums text-gray-900">{value}</span>
      <span className="truncate text-[11px] text-gray-500">{label}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </p>
  );
}

function hasActivityData(activity?: PropertyActivitySummary): boolean {
  if (!activity) return false;
  return (
    activity.bookings != null ||
    activity.enquiries != null ||
    activity.favourites != null ||
    activity.views != null
  );
}

export function PropertyReadinessDashboard({
  variant,
  summary,
  health,
  progress,
  healthFilter = null,
  onHealthFilterChange,
  attentionHrefs = {},
  activity,
  matrixSpaces,
  onMatrixSpaceUpdated,
  onMatrixReload,
  propertyId,
  matrixArchivedCount,
  matrixShowArchived,
  onMatrixToggleArchived,
}: PropertyReadinessDashboardProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const attentionItems = useMemo(
    () => buildReadinessAttentionItems(progress, variant, attentionHrefs),
    [progress, variant, attentionHrefs]
  );
  const completedItems = useMemo(
    () => buildReadinessCompletedItems(progress, variant),
    [progress, variant]
  );
  const breakdown = useMemo(
    () => buildReadinessBreakdown(progress, summary, health, variant),
    [progress, summary, health, variant]
  );

  const activeSpaceCount = summary.total - summary.archived;
  const description =
    variant === "admin"
      ? "Track publish readiness, space status, and what needs attention next."
      : "See what is ready to go live and what to complete on your spaces.";

  function toggleFilter(next: PropertySpaceHealthFilter) {
    onHealthFilterChange?.(healthFilter === next ? null : next);
  }

  function renderAttentionChip(item: (typeof attentionItems)[number]) {
    const className =
      item.filter && healthFilter === item.filter
        ? "inline-flex items-center gap-1.5 rounded-md border border-[#0f2740] bg-[#0f2740] px-2.5 py-1 text-xs font-medium text-white"
        : "inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50";

    const content = (
      <>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {item.label}
      </>
    );

    if (item.filter && onHealthFilterChange) {
      return (
        <button key={item.id} type="button" onClick={() => toggleFilter(item.filter!)} className={className}>
          {content}
        </button>
      );
    }

    if (item.href) {
      return (
        <Link key={item.id} href={item.href} className={className}>
          {content}
        </Link>
      );
    }

    return (
      <span
        key={item.id}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-900"
      >
        {content}
      </span>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Property readiness</h2>
          <p className="mt-0.5 text-sm text-gray-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setBreakdownOpen((open) => !open)}
          className="text-right"
          aria-expanded={breakdownOpen}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Ready to publish
          </p>
          <p className="text-2xl font-semibold tabular-nums text-[#0f2740]">
            {progress.completionPercent}%
          </p>
        </button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#0f2740] transition-all"
          style={{ width: `${progress.completionPercent}%` }}
        />
      </div>

      {breakdownOpen ? (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-gray-100 bg-gray-50/80 px-3 py-2 sm:grid-cols-3">
          {breakdown.map((row) => (
            <p key={row.label} className="text-xs text-gray-600">
              <span
                className={
                  row.complete ? "font-medium text-green-700" : "font-medium text-amber-800"
                }
              >
                {row.label}:
              </span>{" "}
              {row.value}
            </p>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-sm text-gray-600">
        <span className="font-medium text-gray-900">{activeSpaceCount}</span>{" "}
        {activeSpaceCount === 1 ? "space" : "spaces"}
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="font-medium text-green-700">{summary.live}</span> live
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="font-medium text-gray-600">{summary.hidden}</span> hidden
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="font-medium text-amber-700">{summary.enquiry}</span>{" "}
        {summary.enquiry === 1 ? "enquiry" : "enquiries"}
      </p>

      <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
        {variant === "admin" && matrixSpaces && onMatrixSpaceUpdated && propertyId ? (
          <div>
            <SectionLabel>Space management</SectionLabel>
            <div className="mt-2">
              <PropertySpaceReadinessMatrix
                propertyId={propertyId}
                spaces={matrixSpaces}
                onSpaceUpdated={onMatrixSpaceUpdated}
                onReload={onMatrixReload}
                archivedCount={matrixArchivedCount}
                showArchived={matrixShowArchived}
                onToggleArchived={onMatrixToggleArchived}
              />
            </div>
          </div>
        ) : null}

        {attentionItems.length > 0 ? (
          <div>
            <SectionLabel>Needs attention</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {attentionItems.map((item) => renderAttentionChip(item))}
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-green-100 bg-green-50/60 px-3 py-2 text-sm text-green-800">
            {variant === "admin"
              ? "All readiness checks passed — monitor review and visibility."
              : "All readiness checks passed — keep your listings up to date."}
          </p>
        )}

        {completedItems.length > 0 ? (
          <div>
            <SectionLabel>Completed</SectionLabel>
            <p className="mt-1.5 flex flex-wrap gap-x-1 gap-y-1 text-xs text-gray-600">
              {completedItems.map((item, index) => (
                <span key={item.id} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    <span className="text-gray-300" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <Check className="h-3 w-3 shrink-0 text-green-600" aria-hidden />
                  {item.label}
                </span>
              ))}
            </p>
          </div>
        ) : null}

        {hasActivityData(activity) ? (
          <div>
            <SectionLabel>Activity</SectionLabel>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {activity?.bookings != null ? (
                <StatStripItem icon={CalendarCheck} value={activity.bookings} label="Bookings" tone="blue" />
              ) : null}
              {activity?.enquiries != null ? (
                <StatStripItem icon={MessagesSquare} value={activity.enquiries} label="Enquiries" tone="amber" />
              ) : null}
              {activity?.favourites != null ? (
                <StatStripItem icon={Heart} value={activity.favourites} label="Saves" tone="green" />
              ) : null}
              {activity?.views != null ? (
                <StatStripItem icon={Eye} value={activity.views} label="Views" tone="blue" />
              ) : null}
            </div>
          </div>
        ) : null}

        {healthFilter && onHealthFilterChange ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <span className="text-xs text-gray-500">Spaces list filtered</span>
            <button
              type="button"
              onClick={() => onHealthFilterChange(null)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear filter
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
