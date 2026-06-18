"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Archive,
  BadgeDollarSign,
  Bot,
  Building2,
  CalendarCheck,
  Check,
  CircleCheck,
  Eye,
  EyeOff,
  Heart,
  Image,
  ImageOff,
  MailQuestion,
  MapPinOff,
  MessagesSquare,
} from "lucide-react";
import type {
  PropertyOnboardingChecklistItem,
  PropertyOnboardingProgress,
} from "@/lib/property-onboarding-progress";
import type {
  PropertySpacesHealth,
  PropertySpacesSummary,
  PropertySpaceHealthFilter,
} from "@/lib/property-space-ops";

export type PropertyActivitySummary = {
  bookings?: number;
  enquiries?: number;
  favourites?: number;
  views?: number;
};

type AdminPropertyReadinessDashboardProps = {
  summary: PropertySpacesSummary;
  health: PropertySpacesHealth;
  healthFilter: PropertySpaceHealthFilter;
  onHealthFilterChange: (filter: PropertySpaceHealthFilter) => void;
  progress: PropertyOnboardingProgress;
  activity?: PropertyActivitySummary;
};

type AttentionItem = {
  id: string;
  label: string;
  filter?: PropertySpaceHealthFilter;
};

const HEALTH_FILTER_BY_ITEM_ID: Partial<
  Record<string, PropertySpaceHealthFilter>
> = {
  "space-photos": "missing_photos",
  "space-pricing": "missing_pricing",
  "space-location": "missing_location",
  "space-ai-info": "missing_ai_info",
};

function flattenActionableChecklist(
  progress: PropertyOnboardingProgress
): PropertyOnboardingChecklistItem[] {
  return [
    ...progress.checklist.property.filter((item) => item.id !== "created"),
    ...progress.checklist.spaces,
    ...progress.checklist.ownership,
    ...progress.checklist.review,
  ];
}

function attentionLabel(item: PropertyOnboardingChecklistItem): string {
  if (item.id === "space-pricing" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count ? `Add pricing to ${count} spaces` : "Add pricing to spaces";
  }
  if (item.id === "space-photos" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count ? `Add photos to ${count} spaces` : "Add photos to spaces";
  }
  if (item.id === "space-location" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count ? `Add location to ${count} spaces` : "Add location to spaces";
  }
  if (item.id === "space-ai-info" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count
      ? `Add AI information to ${count} spaces`
      : "Add AI information to spaces";
  }
  if (item.id === "invite-accepted" && item.warning) {
    return "Owner invitation not accepted";
  }
  if (item.id === "invite-sent" && item.warning) {
    return "Send owner invite";
  }
  if (item.id === "gallery" && item.warning) {
    return "Add property photos";
  }
  if (item.id === "crm" && !item.done) {
    return "Link CRM organisation";
  }
  if (item.id === "spaces-created" && item.warning) {
    return "Add the first space";
  }
  if (item.id === "approved" && !item.done) {
    return "No spaces approved yet";
  }
  return item.label;
}

function buildAttentionItems(progress: PropertyOnboardingProgress): AttentionItem[] {
  return flattenActionableChecklist(progress)
    .filter((item) => !item.done || item.warning)
    .map((item) => ({
      id: item.id,
      label: attentionLabel(item),
      filter: HEALTH_FILTER_BY_ITEM_ID[item.id],
    }));
}

function buildCompletedItems(
  progress: PropertyOnboardingProgress
): PropertyOnboardingChecklistItem[] {
  const created = progress.checklist.property.find((item) => item.id === "created");
  const done = flattenActionableChecklist(progress).filter(
    (item) => item.done && !item.warning
  );
  return created ? [created, ...done] : done;
}

function buildProgressBreakdown(
  progress: PropertyOnboardingProgress,
  summary: PropertySpacesSummary,
  health: PropertySpacesHealth
) {
  const spaceCount = summary.total - summary.archived;
  const pricingItem = progress.checklist.spaces.find((i) => i.id === "space-pricing");
  const photosItem = progress.checklist.spaces.find((i) => i.id === "space-photos");
  const locationItem = progress.checklist.spaces.find((i) => i.id === "space-location");
  const aiItem = progress.checklist.spaces.find((i) => i.id === "space-ai-info");
  const approvedItem = progress.checklist.review.find((i) => i.id === "approved");
  const ownerItem = progress.checklist.ownership.find(
    (i) => i.id === "invite-accepted"
  );

  const pricingDone = spaceCount - health.missingPricing;
  const photosDone = spaceCount - health.missingPhotos;
  const locationDone = spaceCount - health.missingLocation;
  const aiDone = spaceCount - health.missingAiInformation;
  const approvedMatch = approvedItem?.label.match(/^(\d+)/);
  const approvedCount = approvedMatch ? Number(approvedMatch[1]) : 0;

  return [
    {
      label: "Pricing",
      value: `${pricingDone}/${spaceCount}`,
      complete: pricingItem?.done && !pricingItem.warning,
    },
    {
      label: "Owner accepted",
      value: ownerItem?.done ? "1/1" : "0/1",
      complete: Boolean(ownerItem?.done),
    },
    {
      label: "Approved spaces",
      value: `${approvedCount}/${spaceCount}`,
      complete: Boolean(approvedItem?.done),
    },
    {
      label: "Photos",
      value: `${photosDone}/${spaceCount}`,
      complete: photosItem?.done && !photosItem.warning,
    },
    {
      label: "Location",
      value: `${locationDone}/${spaceCount}`,
      complete: locationItem?.done && !locationItem.warning,
    },
    {
      label: "AI info",
      value: `${aiDone}/${spaceCount}`,
      complete: aiItem?.done && !aiItem.warning,
    },
  ];
}

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

export function AdminPropertySummaryCards({
  summary,
  health,
  healthFilter,
  onHealthFilterChange,
  progress,
  activity,
}: AdminPropertyReadinessDashboardProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const attentionItems = useMemo(() => buildAttentionItems(progress), [progress]);
  const completedItems = useMemo(() => buildCompletedItems(progress), [progress]);
  const breakdown = useMemo(
    () => buildProgressBreakdown(progress, summary, health),
    [progress, summary, health]
  );

  const activeSpaceCount = summary.total - summary.archived;

  function toggleFilter(next: PropertySpaceHealthFilter) {
    onHealthFilterChange(healthFilter === next ? null : next);
  }

  function handleAttentionClick(item: AttentionItem) {
    if (item.filter) toggleFilter(item.filter);
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Property readiness</h2>
          <p className="mt-0.5 text-sm text-gray-600">
            Track publish readiness, space status, and what needs attention next.
          </p>
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
        <div>
          <SectionLabel>Space status</SectionLabel>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
            <StatStripItem
              icon={Building2}
              value={summary.total}
              label="Total"
              tone="blue"
            />
            <StatStripItem
              icon={EyeOff}
              value={summary.hidden}
              label="Hidden"
              tone="grey"
            />
            <StatStripItem
              icon={MailQuestion}
              value={summary.enquiry}
              label="Enquiry"
              tone="amber"
            />
            <StatStripItem
              icon={CircleCheck}
              value={summary.live}
              label="Live"
              tone="green"
            />
            <StatStripItem
              icon={Archive}
              value={summary.archived}
              label="Archived"
              tone="grey"
            />
          </div>
        </div>

        <div>
          <SectionLabel>Publication readiness</SectionLabel>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
            <StatStripItem
              icon={Image}
              value={health.withPhotos}
              label="With photos"
              tone="green"
            />
            <StatStripItem
              icon={ImageOff}
              value={health.missingPhotos}
              label="Missing photos"
              tone={health.missingPhotos > 0 ? "amber" : "neutral"}
            />
            <StatStripItem
              icon={BadgeDollarSign}
              value={health.missingPricing}
              label="Missing pricing"
              tone={health.missingPricing > 0 ? "amber" : "neutral"}
            />
            <StatStripItem
              icon={MapPinOff}
              value={health.missingLocation}
              label="Missing location"
              tone={health.missingLocation > 0 ? "amber" : "neutral"}
            />
            <StatStripItem
              icon={Bot}
              value={health.missingAiInformation}
              label="Missing AI info"
              tone={health.missingAiInformation > 0 ? "amber" : "neutral"}
            />
          </div>
        </div>

        {attentionItems.length > 0 ? (
          <div>
            <SectionLabel>Needs attention</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {attentionItems.map((item) =>
                item.filter ? (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAttentionClick(item)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                      healthFilter === item.filter
                        ? "border-[#0f2740] bg-[#0f2740] text-white"
                        : "border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-50"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {item.label}
                  </button>
                ) : (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-900"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {item.label}
                  </span>
                )
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-green-100 bg-green-50/60 px-3 py-2 text-sm text-green-800">
            All readiness checks passed — monitor review and visibility.
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
                <StatStripItem
                  icon={CalendarCheck}
                  value={activity.bookings}
                  label="Bookings"
                  tone="blue"
                />
              ) : null}
              {activity?.enquiries != null ? (
                <StatStripItem
                  icon={MessagesSquare}
                  value={activity.enquiries}
                  label="Enquiries"
                  tone="amber"
                />
              ) : null}
              {activity?.favourites != null ? (
                <StatStripItem
                  icon={Heart}
                  value={activity.favourites}
                  label="Saves"
                  tone="green"
                />
              ) : null}
              {activity?.views != null ? (
                <StatStripItem
                  icon={Eye}
                  value={activity.views}
                  label="Views"
                  tone="blue"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {healthFilter ? (
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

/** @deprecated Use AdminPropertySummaryCards — merged readiness dashboard */
export const AdminPropertyReadinessDashboard = AdminPropertySummaryCards;
