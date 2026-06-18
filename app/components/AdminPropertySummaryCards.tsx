"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BadgeDollarSign,
  Bot,
  Building2,
  CalendarCheck,
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

type AdminPropertySummaryCardsProps = {
  summary: PropertySpacesSummary;
  health: PropertySpacesHealth;
  healthFilter: PropertySpaceHealthFilter;
  onHealthFilterChange: (filter: PropertySpaceHealthFilter) => void;
  activity?: PropertyActivitySummary;
};

type MetricTone = "blue" | "green" | "amber" | "grey" | "neutral";

type MetricTileProps = {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: MetricTone;
};

type ReadinessAction = {
  filter: PropertySpaceHealthFilter;
  label: string;
  show: boolean;
};

const TONE_STYLES: Record<
  MetricTone,
  { tile: string; icon: string; value: string }
> = {
  blue: {
    tile: "border-blue-100 bg-blue-50/70",
    icon: "text-blue-600",
    value: "text-blue-900",
  },
  green: {
    tile: "border-green-100 bg-green-50/70",
    icon: "text-green-600",
    value: "text-green-800",
  },
  amber: {
    tile: "border-amber-100 bg-amber-50/70",
    icon: "text-amber-600",
    value: "text-amber-900",
  },
  grey: {
    tile: "border-gray-200 bg-gray-50",
    icon: "text-gray-500",
    value: "text-gray-700",
  },
  neutral: {
    tile: "border-gray-200 bg-white",
    icon: "text-gray-400",
    value: "text-[#0f2740]",
  },
};

function MetricTile({ icon: Icon, label, value, tone = "neutral" }: MetricTileProps) {
  const styles = TONE_STYLES[tone];

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${styles.tile}`}>
      <Icon className={`mb-1.5 h-4 w-4 ${styles.icon}`} aria-hidden />
      <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-gray-500">
        {label}
      </p>
      <p className={`mt-0.5 text-xl font-semibold leading-tight ${styles.value}`}>
        {value}
      </p>
    </div>
  );
}

function MetricGroup({
  title,
  children,
  actions,
  footer,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
      {footer}
    </div>
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
  activity,
}: AdminPropertySummaryCardsProps) {
  function toggleFilter(next: PropertySpaceHealthFilter) {
    onHealthFilterChange(healthFilter === next ? null : next);
  }

  const readinessActions: ReadinessAction[] = [
    {
      filter: "missing_photos",
      label: "View missing photos",
      show: health.missingPhotos > 0,
    },
    {
      filter: "missing_pricing",
      label: "View missing pricing",
      show: health.missingPricing > 0,
    },
    {
      filter: "missing_location",
      label: "View missing location",
      show: health.missingLocation > 0,
    },
    {
      filter: "missing_ai_info",
      label: "View missing AI info",
      show: health.missingAiInformation > 0,
    },
  ];

  const visibleReadinessActions = readinessActions.filter((action) => action.show);
  const showActivity = hasActivityData(activity);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-sm font-semibold text-gray-900">Property overview</h2>

      <div className="mt-4 space-y-5">
        <MetricGroup title="Space status">
          <MetricTile
            icon={Building2}
            label="Total spaces"
            value={summary.total}
            tone="blue"
          />
          <MetricTile
            icon={EyeOff}
            label="Hidden"
            value={summary.hidden}
            tone="grey"
          />
          <MetricTile
            icon={MailQuestion}
            label="Enquiry"
            value={summary.enquiry}
            tone="amber"
          />
          <MetricTile icon={CircleCheck} label="Live" value={summary.live} tone="green" />
          <MetricTile
            icon={Archive}
            label="Archived"
            value={summary.archived}
            tone="grey"
          />
        </MetricGroup>

        <MetricGroup
          title="Publication readiness"
          actions={
            <>
              {visibleReadinessActions.map((action) => (
                <button
                  key={action.filter}
                  type="button"
                  onClick={() => toggleFilter(action.filter)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    healthFilter === action.filter
                      ? "border-[#0f2740] bg-[#0f2740] text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </>
          }
          footer={
            healthFilter ? (
              <button
                type="button"
                onClick={() => onHealthFilterChange(null)}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Clear filter
              </button>
            ) : null
          }
        >
          <MetricTile
            icon={Image}
            label="With photos"
            value={health.withPhotos}
            tone="green"
          />
          <MetricTile
            icon={ImageOff}
            label="Missing photos"
            value={health.missingPhotos}
            tone={health.missingPhotos > 0 ? "amber" : "neutral"}
          />
          <MetricTile
            icon={BadgeDollarSign}
            label="Missing pricing"
            value={health.missingPricing}
            tone={health.missingPricing > 0 ? "amber" : "neutral"}
          />
          <MetricTile
            icon={MapPinOff}
            label="Missing location"
            value={health.missingLocation}
            tone={health.missingLocation > 0 ? "amber" : "neutral"}
          />
          <MetricTile
            icon={Bot}
            label="Missing AI info"
            value={health.missingAiInformation}
            tone={health.missingAiInformation > 0 ? "amber" : "neutral"}
          />
        </MetricGroup>

        {showActivity ? (
          <MetricGroup title="Activity">
            {activity?.bookings != null ? (
              <MetricTile
                icon={CalendarCheck}
                label="Bookings"
                value={activity.bookings}
                tone="blue"
              />
            ) : null}
            {activity?.enquiries != null ? (
              <MetricTile
                icon={MessagesSquare}
                label="Enquiries"
                value={activity.enquiries}
                tone="amber"
              />
            ) : null}
            {activity?.favourites != null ? (
              <MetricTile
                icon={Heart}
                label="Saves / favourites"
                value={activity.favourites}
                tone="green"
              />
            ) : null}
            {activity?.views != null ? (
              <MetricTile icon={Eye} label="Views" value={activity.views} tone="blue" />
            ) : null}
          </MetricGroup>
        ) : null}
      </div>
    </section>
  );
}
