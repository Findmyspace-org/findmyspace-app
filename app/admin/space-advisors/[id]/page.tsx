"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  History,
  LayoutDashboard,
  Loader2,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import {
  getCanonicalAdvisorReferralUrl,
  normalizeAdvisorCode,
} from "@/lib/advisor-code";
import AdvisorReferralQrModal from "@/app/components/AdvisorReferralQrModal";

type Advisor = {
  id: string;
  full_name: string;
  display_name: string;
  advisor_code: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type Stats = {
  range: "all" | "7d" | "30d";
  linked_users_count: number;
  listings_created_count: number;
  active_listings_count: number;
  verified_listings_count: number;
  listings_with_bookings_count: number;
  total_bookings_count: number;
};

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  advisor_source: string | null;
  advisor_assigned_at: string | null;
};

type ListingRow = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  status: string | null;
  verification_status: string | null;
  advisor_source: string | null;
  created_at: string | null;
};

function displayUserName(u: UserRow) {
  const j = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return j || u.full_name || u.email || u.id.slice(0, 8);
}

function locationLine(s: ListingRow) {
  return [s.address_line_1, s.suburb, s.city].filter(Boolean).join(", ") || "—";
}

export default function AdminSpaceAdvisorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [advisor, setAdvisor] = useState<Advisor | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [statsRange, setStatsRange] = useState<"all" | "7d" | "30d">("all");

  const siteBase =
    (typeof window !== "undefined" && window.location.origin) ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "";

  const checkRole = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRole("guest");
      return false;
    }
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("role")
      .eq("id", user.id)
      .single();
    if ((profile as { role?: string } | null)?.role !== "admin") {
      setRole("user");
      return false;
    }
    setRole("admin");
    return true;
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setMessage("");
    try {
      const ok = await checkRole();
      if (!ok) {
        setLoading(false);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Sign in again.");
        setLoading(false);
        return;
      }
      const qs =
        statsRange !== "all" ? `?range=${encodeURIComponent(statsRange)}` : "";
      const res = await fetch(`/api/admin/space-advisors/${id}${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Could not load.");
        setLoading(false);
        return;
      }
      setAdvisor(json.advisor as Advisor);
      setStats(json.stats as Stats);
      setUsers((json.users || []) as UserRow[]);
      setListings((json.listings || []) as ListingRow[]);
    } catch {
      setMessage("Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [checkRole, id, statsRange]);

  useEffect(() => {
    load();
  }, [load]);

  function copyLink(code: string) {
    const c = normalizeAdvisorCode(code);
    if (!c || !siteBase) return;
    const full = getCanonicalAdvisorReferralUrl(siteBase, c);
    void navigator.clipboard.writeText(full);
    setMessage("Referral link copied.");
  }

  if (loading && role === null) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-6xl">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-md border border-red-300 bg-red-50 p-6">
          <h1 className="mb-3 text-2xl font-bold">Access denied</h1>
        </div>
      </main>
    );
  }

  if (!advisor && !loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-gray-700">{message || "Not found."}</p>
          <Link href="/admin/space-advisors" className="mt-4 inline-block text-sm text-blue-700 underline">
            Back to Space Advisors
          </Link>
        </div>
      </main>
    );
  }

  if (!advisor) return null;

  const referralUrl =
    siteBase && advisor.advisor_code
      ? getCanonicalAdvisorReferralUrl(siteBase, advisor.advisor_code)
      : "";

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={() => router.push("/admin/space-advisors")}
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-700 hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Space Advisors
        </button>

        <AdminNav current="space-advisors" />

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-[#192a3a]">{advisor.display_name}</h1>
            <p className="mt-1 font-mono text-sm text-gray-600">{advisor.advisor_code}</p>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                advisor.status === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {advisor.status === "active" ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyLink(advisor.advisor_code)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm"
            >
              <Copy className="h-4 w-4" />
              Copy link
            </button>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white"
            >
              Show QR
            </button>
          </div>
        </div>

        {message && (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-900">{message}</div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-gray-600">Metrics period</label>
          <select
            value={statsRange}
            onChange={(e) =>
              setStatsRange(e.target.value as "all" | "7d" | "30d")
            }
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <span className="text-xs text-gray-500">
            Users/listings by created date; bookings by booking date.
          </span>
        </div>

        {stats && (
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ["Users linked", stats.linked_users_count],
              ["Listings created", stats.listings_created_count],
              ["Active listings", stats.active_listings_count],
              ["Verified listings", stats.verified_listings_count],
              ["Listings w/ booking", stats.listings_with_bookings_count],
              ["Bookings", stats.total_bookings_count],
            ].map(([label, val]) => (
              <div
                key={String(label)}
                className="rounded-md border border-gray-200 bg-gray-50 p-4"
              >
                <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-[#192a3a]">{val}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mb-2 text-xs text-gray-500 break-all">
          Referral URL: {referralUrl || "—"}
        </p>

        <section className="mb-10">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-[#192a3a]">
            <Users className="h-5 w-5" />
            Linked users (first-touch)
          </h2>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{displayUserName(u)}</td>
                    <td className="px-3 py-2">{u.email || "—"}</td>
                    <td className="px-3 py-2">{u.phone || "—"}</td>
                    <td className="px-3 py-2">{u.advisor_source || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {u.advisor_assigned_at
                        ? new Date(u.advisor_assigned_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {u.created_at ? new Date(u.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <p className="p-4 text-sm text-gray-600">No linked users.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-[#192a3a]">
            <ClipboardList className="h-5 w-5" />
            Linked listings
          </h2>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Verification</th>
                  <th className="px-3 py-2">Attribution</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      <Link
                        href={`/spaces/${s.id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {s.title || "Untitled"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{locationLine(s)}</td>
                    <td className="px-3 py-2">{s.status || "—"}</td>
                    <td className="px-3 py-2">{s.verification_status || "—"}</td>
                    <td className="px-3 py-2">{s.advisor_source || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {s.created_at ? new Date(s.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listings.length === 0 && (
              <p className="p-4 text-sm text-gray-600">No linked listings.</p>
            )}
          </div>
        </section>

        <AdvisorReferralQrModal
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          referralUrl={referralUrl}
          advisorLabel={advisor.advisor_code}
        />
      </div>
    </main>
  );
}
