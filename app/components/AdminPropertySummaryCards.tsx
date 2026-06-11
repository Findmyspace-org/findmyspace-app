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

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "default" | "muted" | "green" | "amber" | "slate";
}) {
  const toneClass =
    tone === "green"
      ? "text-green-800"
      : tone === "amber"
        ? "text-amber-900"
        : tone === "slate"
          ? "text-slate-700"
          : tone === "muted"
            ? "text-gray-500"
            : "text-[#0f2740]";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function AdminPropertySummaryCards({
  summary,
  health,
  healthFilter,
  onHealthFilterChange,
}: AdminPropertySummaryCardsProps) {
  function toggleFilter(next: PropertySpaceHealthFilter) {
    onHealthFilterChange(healthFilter === next ? null : next);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Spaces summary
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryStat label="Total" value={summary.total} />
          <SummaryStat label="Hidden" value={summary.hidden} tone="muted" />
          <SummaryStat label="Enquiry" value={summary.enquiry} tone="amber" />
          <SummaryStat label="Live" value={summary.live} tone="green" />
          <SummaryStat label="Archived" value={summary.archived} tone="slate" />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Ready to publish
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label="With photos" value={health.withPhotos} tone="green" />
          <SummaryStat label="Missing photos" value={health.missingPhotos} />
          <SummaryStat label="Missing pricing" value={health.missingPricing} />
          <SummaryStat label="Missing location" value={health.missingLocation} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleFilter("missing_photos")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              healthFilter === "missing_photos"
                ? "border-[#0f2740] bg-[#0f2740] text-white"
                : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
            }`}
          >
            View missing photos
          </button>
          <button
            type="button"
            onClick={() => toggleFilter("missing_pricing")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              healthFilter === "missing_pricing"
                ? "border-[#0f2740] bg-[#0f2740] text-white"
                : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
            }`}
          >
            View missing pricing
          </button>
          {healthFilter ? (
            <button
              type="button"
              onClick={() => onHealthFilterChange(null)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear filter
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
