"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList,
  Copy,
  History,
  LayoutDashboard,
  Loader2,
  QrCode,
  RefreshCw,
  Trophy,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getCanonicalAdvisorReferralUrl,
  normalizeAdvisorCode,
} from "@/lib/advisor-code";
import AdvisorReferralQrModal from "@/app/components/AdvisorReferralQrModal";

type AdvisorRow = {
  id: string;
  full_name: string;
  display_name: string;
  advisor_code: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  linked_users_count: number;
  listings_created_count: number;
  active_listings_count: number;
  verified_listings_count: number;
  listings_with_bookings_count: number;
  total_bookings_count: number;
};

type LeaderboardRow = {
  rank: number;
  id: string;
  display_name: string;
  advisor_code: string;
  listings_created_count: number;
  active_listings_count: number;
};

export default function AdminSpaceAdvisorsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [advisors, setAdvisors] = useState<AdvisorRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [metricsRangeLabel, setMetricsRangeLabel] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    display_name: "",
    advisor_code: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [form, setForm] = useState({
    full_name: "",
    display_name: "",
    advisor_code: "",
    email: "",
    phone: "",
    notes: "",
  });

  const [searchInput, setSearchInput] = useState("");
  const [statusInput, setStatusInput] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [rangeInput, setRangeInput] = useState<"all" | "7d" | "30d">("all");
  const [appliedRange, setAppliedRange] = useState<"all" | "7d" | "30d">("all");
  const [leaderboardSortInput, setLeaderboardSortInput] = useState<
    "listings" | "active"
  >("listings");
  const [appliedLeaderboardSort, setAppliedLeaderboardSort] = useState<
    "listings" | "active"
  >("listings");

  const [qrModal, setQrModal] = useState<{
    url: string;
    label: string;
  } | null>(null);

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
    setMessage("");
    setMessageIsError(false);
    setLoading(true);
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
        setMessageIsError(true);
        setLoading(false);
        return;
      }
      const params = new URLSearchParams();
      if (appliedSearch.trim()) params.set("q", appliedSearch.trim());
      if (appliedStatus !== "all") params.set("status", appliedStatus);
      if (appliedRange !== "all") params.set("range", appliedRange);
      params.set("leaderboard_sort", appliedLeaderboardSort);
      const qs = params.toString();
      const res = await fetch(
        `/api/admin/space-advisors${qs ? `?${qs}` : ""}`,
        {
        headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Could not load advisors.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }
      setAdvisors((json?.advisors || []) as AdvisorRow[]);
      setLeaderboard((json?.leaderboard || []) as LeaderboardRow[]);
      setMetricsRangeLabel(
        typeof json?.range === "string" ? json.range : "all"
      );
    } catch {
      setMessage("Failed to load.");
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  }, [checkRole, appliedSearch, appliedStatus, appliedRange, appliedLeaderboardSort]);

  useEffect(() => {
    load();
  }, [load]);

  function applyFilters() {
    setAppliedSearch(searchInput.trim());
    setAppliedStatus(statusInput);
    setAppliedRange(rangeInput);
    setAppliedLeaderboardSort(leaderboardSortInput);
  }

  async function exportCsv() {
    setMessage("");
    setMessageIsError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Sign in again.");
        setMessageIsError(true);
        return;
      }
      const params = new URLSearchParams();
      params.set("format", "csv");
      if (appliedSearch.trim()) params.set("q", appliedSearch.trim());
      if (appliedStatus !== "all") params.set("status", appliedStatus);
      if (appliedRange !== "all") params.set("range", appliedRange);
      const res = await fetch(`/api/admin/space-advisors?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setMessage(j?.error || "Export failed.");
        setMessageIsError(true);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `space-advisors-${appliedRange}.csv`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("CSV downloaded.");
    } catch {
      setMessage("Export failed.");
      setMessageIsError(true);
    }
  }

  async function createAdvisor(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Sign in again.");
        setMessageIsError(true);
        setCreating(false);
        return;
      }
      const res = await fetch("/api/admin/space-advisors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          display_name: form.display_name.trim(),
          advisor_code: form.advisor_code.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          notes: form.notes.trim() || null,
          status: "active",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Could not create.");
        setMessageIsError(true);
        setCreating(false);
        return;
      }
      setForm({
        full_name: "",
        display_name: "",
        advisor_code: "",
        email: "",
        phone: "",
        notes: "",
      });
      setMessage("Space Advisor created.");
      await load();
    } catch {
      setMessage("Request failed.");
      setMessageIsError(true);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(a: AdvisorRow) {
    setEditingId(a.id);
    setEditForm({
      full_name: a.full_name,
      display_name: a.display_name,
      advisor_code: a.advisor_code,
      email: a.email || "",
      phone: a.phone || "",
      notes: a.notes || "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/admin/space-advisors/${editingId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        full_name: editForm.full_name.trim(),
        display_name: editForm.display_name.trim(),
        advisor_code: editForm.advisor_code.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        notes: editForm.notes.trim() || null,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(json?.error || "Update failed.");
      setMessageIsError(true);
      return;
    }
    setEditingId(null);
    setMessage("Advisor updated.");
    setMessageIsError(false);
    await load();
  }

  async function setStatus(id: string, status: "active" | "inactive") {
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/admin/space-advisors/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(json?.error || "Update failed.");
      setMessageIsError(true);
      return;
    }
    await load();
  }

  function copyLink(code: string) {
    const c = normalizeAdvisorCode(code);
    if (!c || !siteBase) return;
    const full = getCanonicalAdvisorReferralUrl(siteBase, c);
    void navigator.clipboard.writeText(full);
    setMessage("Referral link copied.");
    setMessageIsError(false);
  }

  function openQr(code: string, displayName: string) {
    const c = normalizeAdvisorCode(code);
    if (!c || !siteBase) return;
    setQrModal({
      url: getCanonicalAdvisorReferralUrl(siteBase, c),
      label: displayName || c,
    });
  }

  if (loading && role === null) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-6xl rounded-md border border-gray-300 p-6 shadow-sm">
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
          <p className="text-sm text-red-700">Admin only.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-4xl font-bold">Admin — Space Advisors</h1>
        <p className="mb-6 text-gray-600">
          Referral codes and links. Advisors do not get access to user accounts or
          payments. Conversion metrics use the selected period (users and listings by{" "}
          <code className="rounded bg-gray-100 px-1">created_at</code>, bookings by{" "}
          <code className="rounded bg-gray-100 px-1">bookings.created_at</code>).
        </p>

        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/activity"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            Activity
          </Link>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
          <Link
            href="/admin/listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            Listings
          </Link>
          <Link
            href="/admin/space-advisors"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            Space Advisors
          </Link>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-md p-3 text-sm ${
              messageIsError
                ? "border border-red-200 bg-red-50 text-red-800"
                : "bg-green-50 text-green-900"
            }`}
          >
            {message}
          </div>
        )}

        <form
          onSubmit={createAdvisor}
          className="mb-8 rounded-md border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-[#192a3a]">
            Create Space Advisor
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Full name</label>
              <input
                required
                value={form.full_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, full_name: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Display name</label>
              <input
                required
                value={form.display_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, display_name: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Advisor code</label>
              <input
                required
                value={form.advisor_code}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    advisor_code: e.target.value.toUpperCase(),
                  }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
                placeholder="SPACER1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Phone</label>
              <input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="mt-4 rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {creating ? "Saving…" : "Create advisor"}
          </button>
        </form>

        <div className="mb-6 flex flex-col gap-3 rounded-md border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Search name or code
            </label>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Display name, code…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Status
            </label>
            <select
              value={statusInput}
              onChange={(e) =>
                setStatusInput(e.target.value as "all" | "active" | "inactive")
              }
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Metrics period
            </label>
            <select
              value={rangeInput}
              onChange={(e) =>
                setRangeInput(e.target.value as "all" | "7d" | "30d")
              }
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Leaderboard sort
            </label>
            <select
              value={leaderboardSortInput}
              onChange={(e) =>
                setLeaderboardSortInput(
                  e.target.value === "active" ? "active" : "listings"
                )
              }
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="listings">Listings created</option>
              <option value="active">Active listings</option>
            </select>
          </div>
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => exportCsv()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>

        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#192a3a]">
            <Trophy className="h-4 w-4 text-amber-700" />
            Top advisors
            <span className="font-normal text-gray-600">
              (
              {metricsRangeLabel === "7d"
                ? "last 7 days"
                : metricsRangeLabel === "30d"
                  ? "last 30 days"
                  : "all time"}
              ,{" "}
              {appliedLeaderboardSort === "active"
                ? "sorted by active listings"
                : "sorted by listings created"}
              ; inactive excluded unless Status = Inactive)
            </span>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-600">No advisors in this leaderboard.</p>
          ) : (
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {leaderboard.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded-md border border-amber-100 bg-white px-3 py-2 text-sm"
                >
                  <div>
                    <span className="mr-2 font-mono text-xs text-gray-500">
                      #{row.rank}
                    </span>
                    <Link
                      href={`/admin/space-advisors/${row.id}`}
                      className="font-medium text-blue-800 hover:underline"
                    >
                      {row.display_name}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-gray-600">
                      {row.advisor_code}
                    </span>
                  </div>
                  <div className="text-right text-xs text-gray-700">
                    <div>
                      {appliedLeaderboardSort === "active"
                        ? `${row.active_listings_count} active`
                        : `${row.listings_created_count} listings`}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {editingId && (
          <form
            onSubmit={saveEdit}
            className="mb-8 rounded-md border border-amber-200 bg-amber-50/50 p-6"
          >
            <h2 className="mb-4 text-lg font-semibold text-[#192a3a]">Edit advisor</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Full name</label>
                <input
                  required
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Display name</label>
                <input
                  required
                  value={editForm.display_name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, display_name: e.target.value }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Advisor code</label>
                <input
                  required
                  value={editForm.advisor_code}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      advisor_code: e.target.value.toUpperCase(),
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Phone</label>
                <input
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white"
              >
                Save changes
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-md border border-gray-300 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2">Display</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Users</th>
                <th className="px-3 py-2">Listings</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Verified</th>
                <th className="px-3 py-2">W/ booking</th>
                <th className="px-3 py-2">Bookings</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {advisors.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b border-gray-100 ${
                    a.status === "inactive" ? "bg-gray-50/80 text-gray-700" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/space-advisors/${a.id}`}
                      className="font-medium text-blue-800 hover:underline"
                    >
                      {a.display_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono">{a.advisor_code}</td>
                  <td className="px-3 py-2">{a.email || "—"}</td>
                  <td className="px-3 py-2">{a.phone || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        a.status === "active"
                          ? "text-green-800"
                          : "text-gray-500"
                      }
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{a.linked_users_count ?? 0}</td>
                  <td className="px-3 py-2">{a.listings_created_count ?? 0}</td>
                  <td className="px-3 py-2">{a.active_listings_count ?? 0}</td>
                  <td className="px-3 py-2">{a.verified_listings_count ?? 0}</td>
                  <td className="px-3 py-2">
                    {a.listings_with_bookings_count ?? 0}
                  </td>
                  <td className="px-3 py-2">{a.total_bookings_count ?? 0}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/space-advisors/${a.id}`}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => copyLink(a.advisor_code)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <Copy className="mr-1 inline h-3 w-3" />
                        Copy link
                      </button>
                      <button
                        type="button"
                        onClick={() => openQr(a.advisor_code, a.display_name)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                        title="Show QR (same URL as copy link)"
                      >
                        <QrCode className="mr-1 inline h-3 w-3" />
                        QR
                      </button>
                      {a.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => setStatus(a.id, "inactive")}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setStatus(a.id, "active")}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {advisors.length === 0 && !loading && (
            <p className="p-6 text-sm text-gray-600">No Space Advisors yet.</p>
          )}
        </div>

        <p className="mt-6 text-xs text-gray-500">
          Canonical referral path:{" "}
          <code className="rounded bg-gray-100 px-1">
            /dashboard/new-space?advisor=CODE
          </code>{" "}
          (also <code className="rounded bg-gray-100 px-1">/list-your-space?advisor=CODE</code>{" "}
          redirects here). QR encodes the same full URL as Copy link.
        </p>

        <AdvisorReferralQrModal
          open={!!qrModal}
          onClose={() => setQrModal(null)}
          referralUrl={qrModal?.url ?? ""}
          advisorLabel={qrModal?.label ?? ""}
        />
      </div>
    </main>
  );
}
