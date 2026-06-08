"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Building2,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";

type ReviewRow = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
  status: string | null;
  submitted_for_review_at: string | null;
  claimed_at: string | null;
  owner_id: string | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

const QUEUE_STATUSES = ["pending_verification", "needs_changes", "rejected"] as const;

function statusBadge(status: string | null) {
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";
  switch (status) {
    case "pending_verification":
      return `${base} bg-blue-100 text-blue-800`;
    case "needs_changes":
      return `${base} bg-amber-100 text-amber-900`;
    case "rejected":
      return `${base} bg-red-100 text-red-800`;
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
}

function ownerLabel(row: ReviewRow) {
  const p = row.profiles;
  if (!p) return "—";
  const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
  return name || p.email || "—";
}

export default function AdminListingReviewsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("pending_verification");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("spaces")
      .select(
        `id, title, city, suburb, status, submitted_for_review_at, claimed_at, owner_id,
        profiles:owner_id ( first_name, last_name, email )`
      )
      .in("status", [...QUEUE_STATUSES])
      .not("owner_id", "is", null)
      .order("submitted_for_review_at", { ascending: false, nullsFirst: false });

    if (error) {
      setMessage(error.message);
      setRows([]);
    } else {
      setRows((data as ReviewRow[]) || []);
      setMessage("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const r = (profile as { role?: string } | null)?.role ?? null;
      setRole(r);
      if (r === "admin") {
        await load();
      } else {
        setLoading(false);
      }
    }
    void init();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  if (loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (role !== "admin") {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <AdminNav current="listing-reviews" />

        <h1 className="text-2xl font-semibold text-gray-900">Listing reviews</h1>
        <p className="mt-1 text-sm text-gray-600">
          Claimed listings awaiting approval or returned for changes.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["all", ...QUEUE_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                statusFilter === s
                  ? "bg-[#0f2740] text-white"
                  : "bg-white text-gray-700 ring-1 ring-gray-300"
              }`}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Listing</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No listings in this queue.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {row.title || "Untitled"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {[row.suburb, row.city].filter(Boolean).join(", ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{ownerLabel(row)}</td>
                    <td className="px-4 py-3">
                      <span className={statusBadge(row.status)}>
                        {(row.status || "").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.submitted_for_review_at
                        ? format(new Date(row.submitted_for_review_at), "dd MMM yyyy HH:mm")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/listing-reviews/${row.id}`}
                        className="font-medium text-[#0f2740] hover:underline"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
