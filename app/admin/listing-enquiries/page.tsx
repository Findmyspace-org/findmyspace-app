"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Building2,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LISTING_ENQUIRY_STATUSES } from "@/lib/listing-lifecycle";

type EnquiryRow = {
  id: string;
  listing_id: string;
  requester_id: string;
  name: string;
  email: string;
  phone: string | null;
  requested_start: string | null;
  requested_end: string | null;
  duration_type: string;
  purpose: string | null;
  message: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  spaces: { id: string; title: string | null; status: string | null } | null;
};

function statusBadge(status: string) {
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";
  switch (status) {
    case "new":
      return `${base} bg-blue-100 text-blue-800`;
    case "contacted":
      return `${base} bg-amber-100 text-amber-900`;
    case "owner_contacted":
      return `${base} bg-violet-100 text-violet-800`;
    case "converted":
      return `${base} bg-green-100 text-green-800`;
    case "closed":
      return `${base} bg-gray-100 text-gray-700`;
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
}

export default function AdminListingEnquiriesPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EnquiryRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("listing_enquiries" as never)
      .select(
        `*,
        spaces ( id, title, status )`
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setRows([]);
    } else {
      setRows((data as EnquiryRow[]) || []);
      const notes: Record<string, string> = {};
      for (const row of (data as EnquiryRow[]) || []) {
        notes[row.id] = row.admin_notes || "";
      }
      setDraftNotes(notes);
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
      setRole((profile as { role?: string } | null)?.role ?? null);
      if ((profile as { role?: string } | null)?.role === "admin") {
        await load();
      } else {
        setLoading(false);
      }
    }
    void init();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [rows, statusFilter]);

  async function updateEnquiry(
    id: string,
    patch: { status?: string; adminNotes?: string | null }
  ) {
    setSavingId(id);
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setMessage("Not signed in.");
      setSavingId(null);
      return;
    }

    const res = await fetch(`/api/admin/listing-enquiries/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error || "Update failed.");
      setSavingId(null);
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: patch.status ?? row.status,
              admin_notes:
                patch.adminNotes !== undefined ? patch.adminNotes : row.admin_notes,
            }
          : row
      )
    );
    setSavingId(null);
    setMessage("Saved.");
  }

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
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/listing-enquiries"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
          >
            <Inbox className="h-4 w-4" />
            Listing enquiries
          </Link>
          <Link
            href="/admin/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            Listings
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Verification
          </Link>
          <Link
            href="/admin/messages"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <MessageSquare className="h-4 w-4" />
            Messages
          </Link>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900">Listing enquiries</h1>
        <p className="mt-1 text-sm text-gray-600">
          Requests submitted for unclaimed listings (not yet bookable).
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {LISTING_ENQUIRY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}

        {filtered.length === 0 ? (
          <p className="mt-8 text-gray-500">No enquiries yet.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {filtered.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{row.name}</p>
                    <p className="text-sm text-gray-600">
                      {row.email}
                      {row.phone ? ` · ${row.phone}` : ""}
                    </p>
                    <p className="mt-1 text-sm">
                      <Link
                        href={`/spaces/${row.listing_id}`}
                        className="font-medium text-[#0f2740] hover:underline"
                      >
                        {row.spaces?.title || "Untitled listing"}
                      </Link>
                      {row.spaces?.status ? (
                        <span className="ml-2 text-xs text-gray-500">
                          ({row.spaces.status})
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className={statusBadge(row.status)}>{row.status}</span>
                </div>

                <dl className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Submitted</dt>
                    <dd>{format(new Date(row.created_at), "dd MMM yyyy HH:mm")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Duration</dt>
                    <dd className="capitalize">{row.duration_type}</dd>
                  </div>
                  {row.requested_start ? (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Preferred start</dt>
                      <dd>
                        {format(new Date(row.requested_start), "dd MMM yyyy HH:mm")}
                      </dd>
                    </div>
                  ) : null}
                  {row.purpose ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase text-gray-500">Purpose</dt>
                      <dd>{row.purpose}</dd>
                    </div>
                  ) : null}
                  {row.message ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase text-gray-500">Message</dt>
                      <dd className="whitespace-pre-wrap">{row.message}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      Status
                    </span>
                    <select
                      value={row.status}
                      disabled={savingId === row.id}
                      onChange={(e) =>
                        void updateEnquiry(row.id, { status: e.target.value })
                      }
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {LISTING_ENQUIRY_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-[220px] flex-1 block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      Admin notes
                    </span>
                    <input
                      value={draftNotes[row.id] ?? ""}
                      onChange={(e) =>
                        setDraftNotes((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingId === row.id}
                    onClick={() =>
                      void updateEnquiry(row.id, {
                        adminNotes: draftNotes[row.id] ?? "",
                      })
                    }
                    className="rounded-md bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Save notes
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
