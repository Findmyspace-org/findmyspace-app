"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  ClipboardList,
  Compass,
  Inbox,
  LayoutDashboard,
  Link2,
  MapPin,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAdminRole } from "@/lib/use-admin-role";

type ScoutStats = {
  draftScoutListings: number;
  publishedUnclaimed: number;
  claimInterests: number;
  enquiries: number;
  claimedListings: number;
  activeListings: number;
};

const STAT_CARDS: {
  key: keyof ScoutStats;
  label: string;
  icon: typeof MapPin;
}[] = [
  { key: "draftScoutListings", label: "Draft scout listings", icon: MapPin },
  { key: "publishedUnclaimed", label: "Published unclaimed", icon: Building2 },
  { key: "claimInterests", label: "Claim interests", icon: Link2 },
  { key: "enquiries", label: "Enquiries", icon: Inbox },
  { key: "claimedListings", label: "Claimed listings", icon: Users },
  { key: "activeListings", label: "Active listings", icon: ShieldCheck },
];

export default function VenueScoutDashboardPage() {
  const { isAdmin, loading: roleLoading } = useAdminRole();
  const [stats, setStats] = useState<ScoutStats | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApiFetch("/api/admin/venue-scout/stats");
      setStats(result as ScoutStats);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load stats.");
      setStats(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
    else if (!roleLoading) setLoading(false);
  }, [isAdmin, roleLoading, load]);

  if (roleLoading || (isAdmin && loading)) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/venue-scout"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
          >
            <Compass className="h-4 w-4" />
            Venue scout
          </Link>
          <Link
            href="/admin/unclaimed-listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Unclaimed listings
          </Link>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Venue scout</h1>
            <p className="mt-1 max-w-xl text-sm text-gray-600">
              Fast capture for Paarl launch — create unclaimed listings in minutes while
              on site. Enrich details later in the full editor.
            </p>
          </div>
          <Link
            href="/admin/venue-scout/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Scout new space
          </Link>
        </div>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {stats ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STAT_CARDS.map(({ key, label, icon: Icon }) => (
              <div
                key={key}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f2740]/10 text-[#0f2740]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">{stats[key]}</p>
                    <p className="text-sm text-gray-600">{label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/admin/venue-scout/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Scout new space
          </Link>
          <Link
            href="/admin/unclaimed-listings"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            View unclaimed listings
          </Link>
          <Link
            href="/admin/listing-enquiries"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <Inbox className="h-4 w-4" />
            View enquiries
          </Link>
          <Link
            href="/admin/unclaimed-listings"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <Link2 className="h-4 w-4" />
            Claim interests
          </Link>
        </div>
      </div>
    </main>
  );
}
