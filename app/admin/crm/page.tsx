"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { fetchCrmDesktopOverview } from "@/lib/crm-desktop/api-client";
import { useCrmOverviewRefresh } from "@/lib/crm-desktop/crm-refresh";
import type { CrmOverviewStats } from "@/lib/crm-desktop/types";

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[#c1121f]/30 hover:shadow"
    >
      <p className="text-2xl font-semibold text-[#192a3a]">{value}</p>
      <p className="mt-1 text-sm text-gray-600">{label}</p>
    </Link>
  );
}

export default function CrmOverviewPage() {
  const [stats, setStats] = useState<CrmOverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCrmDesktopOverview();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview.");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useCrmOverviewRefresh(() => {
    void loadOverview();
  });

  if (loading) {
    return <p className="text-sm text-gray-500">Loading overview…</p>;
  }

  if (error || !stats) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || "Overview unavailable."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Cross-organisation relationship health. Every total links to a filtered list.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Due today"
          value={stats.dueToday}
          href="/admin/crm/today?bucket=today"
        />
        <StatCard
          label="Overdue follow-ups"
          value={stats.overdue}
          href="/admin/crm/activities?bucket=overdue"
        />
        <StatCard
          label="Upcoming (7 days)"
          value={stats.upcomingWeek}
          href="/admin/crm/activities?bucket=next7"
        />
        <StatCard
          label="Open pipeline"
          value={stats.openPipeline}
          href="/admin/crm/pipeline"
        />
        <StatCard
          label="Organisations without next step"
          value={stats.orgsNoNextStep}
          href="/admin/crm/organisations?no_next=1"
        />
        <StatCard
          label="Contacts without recent engagement"
          value={stats.contactsStale}
          href="/admin/crm/contacts"
        />
        <StatCard
          label="Notes this week"
          value={stats.recentNotes}
          href="/admin/crm/activities"
        />
        <StatCard
          label="Recently updated organisations"
          value={stats.recentUpdates}
          href="/admin/crm/organisations?sort=updated_at&dir=desc"
        />
      </div>

      {stats.tasksByOwner.length > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#192a3a]">
            Open tasks by CRM user
          </h2>
          <ul className="mt-3 divide-y divide-gray-100">
            {stats.tasksByOwner.map((row) => (
              <li key={row.owner_id || "unassigned"} className="flex items-center justify-between py-2 text-sm">
                <span>{row.owner_name}</span>
                <Link
                  href={`/admin/crm/tasks?owner=${row.owner_id || "unassigned"}`}
                  className="font-medium text-[#c1121f] hover:underline"
                >
                  {row.count}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
