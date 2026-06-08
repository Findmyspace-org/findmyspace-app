"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  ClipboardList,
  History,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";

type AdminUserRow = {
  id: string;
  role: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  is_host?: boolean | null;
  owner_verification_status?: string | null;
  bank_verification_status?: string | null;
  listingCount: number;
  bookingCountAsRenter: number;
  bookingCountAsOwner: number;
};

function displayName(u: AdminUserRow) {
  const joined = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return joined || u.full_name || u.email || "Name not set";
}

export default function AdminUsersPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editFull, setEditFull] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingUser, setSavingUser] = useState(false);

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

  const loadUsers = useCallback(async () => {
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
        setMessage("Sign in to view users.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (appliedSearch.trim()) params.set("q", appliedSearch.trim());

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Could not load users.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }

      setUsers((json?.users || []) as AdminUserRow[]);
    } catch {
      setMessage("Something went wrong while loading. Try again.");
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  }, [checkRole, appliedSearch]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function applySearch() {
    setAppliedSearch(searchInput);
  }

  function openEdit(u: AdminUserRow) {
    setEditUser(u);
    setEditReason("");
    setEditFirst(u.first_name ?? "");
    setEditLast(u.last_name ?? "");
    setEditFull(u.full_name ?? "");
    setEditPhone(u.phone ?? "");
  }

  function closeEdit() {
    setEditUser(null);
  }

  async function saveUserEdit() {
    if (!editUser) return;
    const reason = editReason.trim();
    if (reason.length < 3) {
      setMessage("Enter a short reason (at least 3 characters).");
      setMessageIsError(true);
      return;
    }
    setSavingUser(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Please sign in again.");
        setMessageIsError(true);
        setSavingUser(false);
        return;
      }

      const body: Record<string, unknown> = {
        reason,
        first_name: editFirst.trim() === "" ? null : editFirst.trim(),
        last_name: editLast.trim() === "" ? null : editLast.trim(),
        full_name: editFull.trim() === "" ? null : editFull.trim(),
        phone: editPhone.trim() === "" ? null : editPhone.trim(),
      };

      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Could not save user.");
        setMessageIsError(true);
        setSavingUser(false);
        return;
      }

      setMessage("Profile updated.");
      closeEdit();
      await loadUsers();
    } catch {
      setMessage("Something went wrong while saving.");
      setMessageIsError(true);
    } finally {
      setSavingUser(false);
    }
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
          <p className="text-sm text-red-700">
            You do not have admin access to this area.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-4xl font-bold">Admin — Users</h1>
        <p className="mb-6 text-gray-600">
          User directory with safe edits for name and phone (admin API + audit log).
        </p>

        <AdminNav current="users" />

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 rounded-md border border-gray-300 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-[#192a3a]">
              Search users
            </label>
            <div className="flex items-center gap-3 rounded-md border border-gray-300 px-3 py-2">
              <Search className="h-4 w-4 text-gray-500" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
                placeholder="Name, email, phone…"
                className="w-full border-0 bg-transparent text-sm text-[#192a3a] outline-none"
              />
            </div>
            <button
              type="button"
              onClick={applySearch}
              className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Search
            </button>
          </div>
          <button
            type="button"
            onClick={() => loadUsers()}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
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
          <div className="flex items-center gap-2 text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-300 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Host</th>
                  <th className="px-4 py-3">Listings</th>
                  <th className="px-4 py-3">Bookings (R/O)</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 w-[100px]">Edit</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-[#192a3a]">
                      {displayName(u)}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-gray-700">
                      {u.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{u.phone || "—"}</td>
                    <td className="px-4 py-3">{u.role || "user"}</td>
                    <td className="px-4 py-3">
                      {u.is_host ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">{u.listingCount}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      R {u.bookingCountAsRenter} / O {u.bookingCountAsOwner}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {u.created_at
                        ? new Date(u.created_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-600">
                No users match.
              </p>
            )}
          </div>
        )}

        {editUser && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white p-6 shadow-xl"
              role="dialog"
              aria-labelledby="edit-user-title"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="edit-user-title" className="text-lg font-semibold text-[#192a3a]">
                  Edit user
                </h2>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-md p-1 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-4 text-xs text-gray-500">
                Email and role cannot be changed here. Provide a short reason for the audit log.
              </p>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Reason (required)
                  </label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                    placeholder="Why are you making this change?"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    First name
                  </label>
                  <input
                    type="text"
                    value={editFirst}
                    onChange={(e) => setEditFirst(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={editLast}
                    onChange={(e) => setEditLast(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={editFull}
                    onChange={(e) => setEditFull(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Email (read-only): {editUser.email || "—"}
                </p>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveUserEdit}
                  disabled={savingUser}
                  className="inline-flex items-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {savingUser ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
