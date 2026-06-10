"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  History,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";

type ActivityEntry = {
  id: string;
  created_at: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  meta: unknown;
  adminEmail: string | null;
  adminLabel: string;
};

export default function AdminActivityPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [actionInput, setActionInput] = useState("");
  const [targetTypeInput, setTargetTypeInput] = useState("");
  const [adminUserIdInput, setAdminUserIdInput] = useState("");
  const [qInput, setQInput] = useState("");
  const [applied, setApplied] = useState({
    action: "",
    targetType: "",
    adminUserId: "",
    q: "",
  });

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
    if (!hasAdminUiAccess((profile as { role?: string | null } | null)?.role)) {
      setRole("user");
      return false;
    }
    setRole("admin");
    return true;
  }, []);

  const loadActivity = useCallback(async () => {
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
        setMessage("Sign in to view activity.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.set("limit", "200");
      if (applied.action) params.set("action", applied.action);
      if (applied.targetType) params.set("targetType", applied.targetType);
      if (applied.adminUserId) params.set("adminUserId", applied.adminUserId);
      if (applied.q) params.set("q", applied.q);

      const res = await fetch(`/api/admin/activity?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Could not load activity.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }

      setEntries((json?.entries || []) as ActivityEntry[]);
    } catch {
      setMessage("Something went wrong while loading.");
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  }, [checkRole, applied]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  function applyFilters() {
    setApplied({
      action: actionInput.trim(),
      targetType: targetTypeInput.trim(),
      adminUserId: adminUserIdInput.trim(),
      q: qInput.trim(),
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

  if (!hasAdminUiAccess(role)) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-md border border-red-300 bg-red-50 p-6">
          <h1 className="mb-3 text-2xl font-bold">Access denied</h1>
          <p className="text-sm text-red-700">
            You do not have admin access to this area.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-4xl font-bold">Admin — Activity</h1>
        <p className="mb-6 text-gray-600">
          Recent admin actions (audit log). Filters apply to the loaded window (max 200 rows).
        </p>

        <AdminNav current="activity" />

        <div className="mb-6 grid gap-3 rounded-md border border-gray-300 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Action (exact)
            </label>
            <input
              type="text"
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder="e.g. profile_update"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Target type (exact)
            </label>
            <input
              type="text"
              value={targetTypeInput}
              onChange={(e) => setTargetTypeInput(e.target.value)}
              placeholder="profile, space, booking"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Admin user id
            </label>
            <input
              type="text"
              value={adminUserIdInput}
              onChange={(e) => setAdminUserIdInput(e.target.value)}
              placeholder="UUID"
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Search (action / target id / reason)
            </label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-gray-300 px-2 py-1.5">
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <input
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyFilters();
                  }}
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={() => void loadActivity()}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-md p-3 text-sm ${
              messageIsError
                ? "border border-red-200 bg-red-50 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
            role={messageIsError ? "alert" : "status"}
          >
            {message}
          </div>
        )}

        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-300 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-3">Time (UTC)</th>
                  <th className="px-3 py-3">Admin</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Target</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <Fragment key={e.id}>
                    <tr className="border-b border-gray-100 align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-700">
                        {new Date(e.created_at).toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="max-w-[180px] px-3 py-2 text-xs">
                        <div className="font-medium text-[#192a3a]">{e.adminLabel}</div>
                        {e.adminEmail && (
                          <div className="truncate text-gray-500">{e.adminEmail}</div>
                        )}
                        <div className="font-mono text-[10px] text-gray-400">
                          {e.admin_user_id}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-gray-600">{e.target_type || "—"}</span>
                        <br />
                        <span className="font-mono text-[11px]">{e.target_id || "—"}</span>
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-xs text-gray-700">
                        {e.reason || "—"}
                      </td>
                      <td className="px-2 py-2">
                        {e.meta != null && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId((id) => (id === e.id ? null : e.id))
                            }
                            className="rounded p-1 hover:bg-gray-100"
                            aria-label="Toggle meta"
                          >
                            {expandedId === e.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === e.id && e.meta != null && (
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <td colSpan={6} className="px-3 py-2">
                          <pre className="max-h-40 overflow-auto text-[10px] text-gray-800">
                            {JSON.stringify(e.meta, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {entries.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-600">
                No audit entries yet, or no matches for filters.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
