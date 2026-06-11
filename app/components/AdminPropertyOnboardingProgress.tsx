"use client";

import type { PropertyOnboardingProgress } from "@/lib/property-onboarding-progress";

function ChecklistSection({
  title,
  items,
}: {
  title: string;
  items: PropertyOnboardingProgress["checklist"]["property"];
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm">
            <span
              className={
                item.done && !item.warning
                  ? "text-emerald-600"
                  : item.warning
                    ? "text-amber-600"
                    : "text-gray-400"
              }
              aria-hidden
            >
              {item.done && !item.warning ? "✓" : item.warning ? "⚠" : "○"}
            </span>
            <span
              className={
                item.done && !item.warning
                  ? "text-gray-800"
                  : item.warning
                    ? "text-amber-900"
                    : "text-gray-600"
              }
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type AdminPropertyOnboardingProgressProps = {
  progress: PropertyOnboardingProgress;
};

export function AdminPropertyOnboardingProgress({
  progress,
}: AdminPropertyOnboardingProgressProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Property onboarding</h2>
          <p className="mt-1 text-sm text-gray-600">
            Track what is still needed before this property can go live.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Property completion
          </p>
          <p className="text-2xl font-semibold text-[#0f2740]">
            {progress.completionPercent}%
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#0f2740] transition-all"
          style={{ width: `${progress.completionPercent}%` }}
        />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <ChecklistSection title="Property" items={progress.checklist.property} />
        <ChecklistSection title="Spaces" items={progress.checklist.spaces} />
        <ChecklistSection title="Ownership" items={progress.checklist.ownership} />
        <ChecklistSection title="Review" items={progress.checklist.review} />
        <ChecklistSection title="Visibility" items={progress.checklist.visibility} />
      </div>

      <div className="mt-5 rounded-lg border border-[#0f2740]/15 bg-[#0f2740]/5 px-4 py-3">
        <p className="text-sm font-medium text-[#0f2740]">{progress.nextAction}</p>
      </div>
    </section>
  );
}
