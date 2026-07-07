"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMarketingOverviewStats } from "@/lib/crm-marketing/api-client";
import { MARKETING_COMPLIANCE_NOTICE } from "@/lib/crm-marketing/constants";
import type { CrmMarketingOverviewStats } from "@/lib/crm-marketing/types";

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
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-[#c1121f]/30"
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#192a3a]">{value}</p>
    </Link>
  );
}

export default function MarketingOverviewPage() {
  const [stats, setStats] = useState<CrmMarketingOverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMarketingOverviewStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load."));
  }, []);

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {MARKETING_COMPLIANCE_NOTICE}
      </p>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !stats ? (
        <p className="text-sm text-gray-500">Loading marketing overview…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total marketing contacts" value={stats.total} href="/admin/crm/marketing/contacts" />
            <StatCard label="Sendable contacts" value={stats.sendable} href="/admin/crm/marketing/contacts?sendable=1" />
            <StatCard label="Pending consent" value={stats.pendingConsent} href="/admin/crm/marketing/contacts?status=pending_consent" />
            <StatCard label="Unsubscribed" value={stats.unsubscribed} href="/admin/crm/marketing/contacts?status=unsubscribed" />
            <StatCard label="Suppressed" value={stats.suppressed} href="/admin/crm/marketing/contacts?status=suppressed" />
            <StatCard label="Invalid / missing email" value={stats.invalidEmail} href="/admin/crm/marketing/contacts?status=invalid_email" />
            <StatCard label="Duplicate emails requiring review" value={stats.duplicateEmails} href="/admin/crm/marketing/contacts?review=1" />
            <StatCard label="General updates list" value={stats.generalUpdates} href="/admin/crm/marketing/lists" />
            <StatCard label="Go-live announcements" value={stats.goLive} href="/admin/crm/marketing/lists" />
            <StatCard label="Closed / Not Now" value={stats.closedNotNow} href="/admin/crm/marketing/contacts?status=pending_consent" />
            <StatCard label="Signed Up" value={stats.signedUp} href="/admin/crm/marketing/lists" />
            <StatCard label="Listed organisations" value={stats.listed} href="/admin/crm/marketing/lists" />
            <StatCard label="Recently added (30d)" value={stats.recentlyAdded} href="/admin/crm/marketing/contacts" />
          </div>

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-[#192a3a]">Data requiring review</h2>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href="/admin/crm/marketing/contacts?status=invalid_email" className="rounded-lg border px-3 py-2 hover:bg-gray-50">Missing email</Link>
              <Link href="/admin/crm/marketing/contacts?review=1" className="rounded-lg border px-3 py-2 hover:bg-gray-50">Duplicate email</Link>
              <Link href="/admin/crm/marketing/contacts?status=pending_consent" className="rounded-lg border px-3 py-2 hover:bg-gray-50">Pending consent</Link>
              <Link href="/admin/crm/marketing/contacts?basis=review_required" className="rounded-lg border px-3 py-2 hover:bg-gray-50">Unknown lawful basis</Link>
              <Link href="/admin/crm/marketing/contacts?status=suppressed" className="rounded-lg border px-3 py-2 hover:bg-gray-50">Suppressed</Link>
              <Link href="/admin/crm/marketing/contacts?status=unsubscribed" className="rounded-lg border px-3 py-2 hover:bg-gray-50">Unsubscribed</Link>
            </div>
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/crm/marketing/contacts" className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">
          Marketing contacts
        </Link>
        <Link href="/admin/crm/marketing/lists" className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
          Marketing lists
        </Link>
        <Link href="/admin/crm/marketing/campaigns" className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
          Campaigns (draft)
        </Link>
      </div>
    </div>
  );
}
