"use client";

import type {
  PropertySpacesHealth,
  PropertySpacesSummary,
  PropertySpaceHealthFilter,
} from "@/lib/property-space-ops";

type AdminPropertySummaryCardsProps = {
  summary: PropertySpacesSummary;
  health: PropertySpacesHealth;
  healthFilter: PropertySpaceHealthFilter;
  onHealthFilterChange: (filter: PropertySpaceHealthFilter) => void;
};

function CompactStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "muted" | "green" | "amber" | "slate" | "warn";
}) {
  const valueClass =
    tone === "green"
      ? "text-green-800"
      : tone === "amber"
        ? "text-amber-900"
        : tone === "slate"
          ? "text-slate-700"
          : tone === "muted"
            ? "text-gray-500"
            : tone === "warn"
              ? "text-amber-800"
              : "text-[#0f2740]";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className={`text-xl font-semibold leading-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

type ActionButton = {
  filter: PropertySpaceHealthFilter;
  label: string;
  show: boolean;
};

export function AdminPropertySummaryCards({
  summary,
  health,
  healthFilter,
  onHealthFilterChange,
}: AdminPropertySummaryCardsProps) {
  function toggleFilter(next: PropertySpaceHealthFilter) {
    onHealthFilterChange(healthFilter === next ? null : next);
  }

  const actionButtons: ActionButton[] = [
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

  const visibleActions = actionButtons.filter((action) => action.show);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Property readiness
      </h2>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10">
        <CompactStat label="Total spaces" value={summary.total} />
        <CompactStat label="Hidden" value={summary.hidden} tone="muted" />
        <CompactStat label="Enquiry" value={summary.enquiry} tone="amber" />
        <CompactStat label="Live" value={summary.live} tone="green" />
        <CompactStat label="Archived" value={summary.archived} tone="slate" />
        <CompactStat label="With photos" value={health.withPhotos} tone="green" />
        <CompactStat
          label="Missing photos"
          value={health.missingPhotos}
          tone={health.missingPhotos > 0 ? "warn" : "default"}
        />
        <CompactStat
          label="Missing pricing"
          value={health.missingPricing}
          tone={health.missingPricing > 0 ? "warn" : "default"}
        />
        <CompactStat
          label="Missing location"
          value={health.missingLocation}
          tone={health.missingLocation > 0 ? "warn" : "default"}
        />
        <CompactStat
          label="Missing AI info"
          value={health.missingAiInformation}
          tone={health.missingAiInformation > 0 ? "warn" : "default"}
        />
      </div>

      {visibleActions.length > 0 || healthFilter ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
          {visibleActions.map((action) => (
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
          {healthFilter ? (
            <button
              type="button"
              onClick={() => onHealthFilterChange(null)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear filter
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
