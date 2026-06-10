"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Compass,
  Inbox,
  LayoutGrid,
  Link2,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminActionRequiredPanel } from "@/app/components/AdminActionRequiredPanel";
import type { AdminActionQueue } from "@/app/components/AdminActionRequiredPanel";
import { adminApiFetch } from "@/lib/admin-api-client";

type ScoutStats = {
  draftScoutListings: number;
  publishedUnclaimed: number;
  claimInterests: number;
  enquiries: number;
  claimedListings: number;
  activeListings: number;
};

export default function AdminPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoutStats, setScoutStats] = useState<ScoutStats | null>(null);
  const [actionQueue, setActionQueue] = useState<AdminActionQueue | null>(null);

  useEffect(() => {
    async function checkRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const userRole = (data as { role?: string | null } | null)?.role || "user";
      setRole(userRole);

      if (userRole === "admin") {
        try {
          const [stats, queue] = await Promise.all([
            adminApiFetch("/api/admin/venue-scout/stats"),
            adminApiFetch("/api/admin/action-queue"),
          ]);
          setScoutStats({
            draftScoutListings: (stats.draftScoutListings as number) ?? 0,
            publishedUnclaimed: (stats.publishedUnclaimed as number) ?? 0,
            claimInterests: (stats.claimInterests as number) ?? 0,
            enquiries: (stats.enquiries as number) ?? 0,
            claimedListings: (stats.claimedListings as number) ?? 0,
            activeListings: (stats.activeListings as number) ?? 0,
          });
          setActionQueue(queue as AdminActionQueue);
        } catch {
          setScoutStats(null);
          setActionQueue(null);
        }
      }

      setLoading(false);
    }

    void checkRole();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl rounded-lg border border-gray-200 bg-white p-6">
        Loading admin workspace…
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-7xl rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-800">Access denied</h1>
        <p className="mt-2 text-sm text-red-700">
          You do not have admin access to this area.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#192a3a]">
          Admin workspace
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          What needs action, acquisition progress, and space operations at a
          glance.
        </p>
      </header>

      {actionQueue ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Action required
          </h2>
          <AdminActionRequiredPanel queue={actionQueue} />
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Acquisition pipeline
          </h2>
          <Link
            href="/admin/spaces/all"
            className="text-sm font-medium text-[#192a3a] hover:underline"
          >
            View all spaces
          </Link>
        </div>
        {scoutStats ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "Draft scout listings",
                value: scoutStats.draftScoutListings,
                href: "/admin/venue-scout",
                icon: Compass,
              },
              {
                label: "Unclaimed listings",
                value: scoutStats.publishedUnclaimed,
                href: "/admin/unclaimed-listings",
                icon: Building2,
              },
              {
                label: "Claim interests",
                value: scoutStats.claimInterests,
                href: "/admin/listing-claim-interests",
                icon: Link2,
              },
              {
                label: "Enquiries",
                value: scoutStats.enquiries,
                href: "/admin/listing-enquiries",
                icon: Inbox,
              },
              {
                label: "Claimed listings",
                value: scoutStats.claimedListings,
                href: "/admin/listing-reviews",
                icon: Users,
              },
              {
                label: "Active listings",
                value: scoutStats.activeListings,
                href: "/admin/listings",
                icon: ShieldCheck,
              },
            ].map(({ label, value, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[#192a3a]/20 hover:shadow"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#192a3a]/10 text-[#192a3a]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xl font-semibold text-[#192a3a]">{value}</p>
                    <p className="text-xs text-gray-600">{label}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            Acquisition stats unavailable.
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Space operations
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Manage live listings, verification, and marketplace operations.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { href: "/admin/spaces/all", label: "All spaces", icon: LayoutGrid },
              { href: "/admin/spaces", label: "Space verification", icon: ShieldCheck },
              { href: "/admin/listings", label: "Listings", icon: ClipboardList },
              { href: "/admin/bookings", label: "Bookings", icon: Wallet },
              { href: "/admin/messages", label: "Messages", icon: Inbox },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Verification & trust
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Review owner identity, bank details, and listing approvals.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { href: "/admin/verification", label: "Verification queue" },
              { href: "/admin/listing-reviews", label: "Listing reviews" },
              { href: "/admin/listing-enquiries", label: "Listing enquiries" },
              { href: "/admin/listing-claim-interests", label: "Claim interests" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center rounded-md border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Quick links
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { href: "/admin/users", label: "Users" },
            { href: "/admin/properties", label: "Properties" },
            { href: "/admin/venue-scout", label: "Venue Scout" },
            { href: "/admin/finance", label: "Finance" },
            { href: "/admin/activity", label: "Activity log" },
            { href: "/space-place", label: "Space Place CRM" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
