"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Loader2,
  Mail,
  ShieldOff,
  ShieldCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAdminRole } from "@/lib/use-admin-role";
import { adminRoleLabel } from "@/lib/admin-roles";

type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  admin_access_disabled: boolean;
  admin_invited_at: string | null;
  last_sign_in_at: string | null;
  active_status: "active" | "disabled" | "invite_pending";
};

function statusBadge(status: AdminUserRow["active_status"]) {
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";
  switch (status) {
    case "active":
      return `${base} bg-green-100 text-green-800`;
    case "disabled":
      return `${base} bg-red-100 text-red-800`;
    case "invite_pending":
      return `${base} bg-amber-100 text-amber-900`;
  }
}

function statusLabel(status: AdminUserRow["active_status"]) {
  switch (status) {
    case "active":
      return "Active";
    case "disabled":
      return "Disabled";
    case "invite_pending":
      return "Invite pending";
  }
}

export default function AdminUsersManagementPage() {
  const { loading: roleLoading, isSuperAdmin } = useAdminRole();
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApiFetch("/api/admin/admin-users");
      setAdmins((result.admins as AdminUserRow[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load admin users.");
      setMessageOk(false);
      setAdmins([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isSuperAdmin) void load();
    else if (!roleLoading) setLoading(false);
  }, [isSuperAdmin, roleLoading, load]);

  function showResult(text: string, ok = true) {
    setMessage(text);
    setMessageOk(ok);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const result = await adminApiFetch("/api/admin/admin-users", {
        method: "POST",
        body: JSON.stringify({
          full_name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: "admin",
        }),
      });
      showResult(String(result.message || "Admin invited."));
      setInviteName("");
      setInviteEmail("");
      await load();
    } catch (err) {
      showResult(err instanceof Error ? err.message : "Invite failed.", false);
    }
    setInviting(false);
  }

  async function handlePromote(e: React.FormEvent) {
    e.preventDefault();
    setPromoting(true);
    try {
      const result = await adminApiFetch("/api/admin/admin-users/promote", {
        method: "POST",
        body: JSON.stringify({ email: promoteEmail.trim() }),
      });
      showResult(String(result.message || "User promoted."));
      setPromoteEmail("");
      await load();
    } catch (err) {
      showResult(err instanceof Error ? err.message : "Promote failed.", false);
    }
    setPromoting(false);
  }

  async function runAction(userId: string, action: "disable" | "enable" | "remove") {
    const label =
      action === "disable"
        ? "disable admin access for"
        : action === "enable"
          ? "enable admin access for"
          : "remove admin access from";
    if (!window.confirm(`Are you sure you want to ${label} this user?`)) return;

    setBusyId(userId);
    try {
      const result = await adminApiFetch(`/api/admin/admin-users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      showResult(String(result.message || "Updated."));
      await load();
    } catch (err) {
      showResult(err instanceof Error ? err.message : "Action failed.", false);
    }
    setBusyId(null);
  }

  async function resendInvite(userId: string) {
    setBusyId(userId);
    try {
      const result = await adminApiFetch(
        `/api/admin/admin-users/${userId}/resend-invite`,
        { method: "POST" }
      );
      showResult(String(result.message || "Invite sent."));
    } catch (err) {
      showResult(err instanceof Error ? err.message : "Could not resend invite.", false);
    }
    setBusyId(null);
  }

  if (roleLoading || (loading && isSuperAdmin)) {
    return (
      <div className="mx-auto max-w-6xl rounded-lg border border-gray-200 bg-white p-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-6xl rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-800">Super admin access required</h1>
        <p className="mt-2 text-sm text-red-700">
          Only Super Admins can manage platform admin users. Ask an existing Super
          Admin to promote your account, or run the bootstrap SQL in migration
          029.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#192a3a]">
          Admin user management
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Invite admins, promote existing users, and control admin access — without
          using the Supabase dashboard.
        </p>
      </header>

      {message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            messageOk
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={(e) => void handleInvite(e)}
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <UserPlus className="h-4 w-4" />
            Invite new admin
          </h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Full name
              </label>
              <input
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Email
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Role
              </label>
              <select
                disabled
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                value="admin"
              >
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#243a4f] disabled:opacity-50"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send invite
            </button>
          </div>
        </form>

        <form
          onSubmit={(e) => void handlePromote(e)}
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Promote existing user
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Grant admin access to a user who already has a FindMySpace account.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                User email
              </label>
              <input
                type="email"
                required
                value={promoteEmail}
                onChange={(e) => setPromoteEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="existing.user@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={promoting}
              className="inline-flex items-center gap-2 rounded-lg border border-[#192a3a] px-4 py-2 text-sm font-medium text-[#192a3a] hover:bg-gray-50 disabled:opacity-50"
            >
              {promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Promote to admin
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-medium text-[#192a3a]">
            Platform admins ({admins.length})
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Last login</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No admin users found.
                  </td>
                </tr>
              ) : null}
              {admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 font-medium text-[#192a3a]">
                    {admin.full_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{admin.email || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {admin.last_sign_in_at
                      ? format(new Date(admin.last_sign_in_at), "dd MMM yyyy HH:mm")
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-[#192a3a]/10 px-2.5 py-0.5 text-xs font-semibold text-[#192a3a]">
                      {adminRoleLabel(admin.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusBadge(admin.active_status)}>
                      {statusLabel(admin.active_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[220px] flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === admin.id}
                        onClick={() => void resendInvite(admin.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Resend invite
                      </button>
                      {admin.admin_access_disabled ? (
                        <button
                          type="button"
                          disabled={busyId === admin.id}
                          onClick={() => void runAction(admin.id, "enable")}
                          className="inline-flex items-center gap-1 rounded-md border border-green-200 px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-50 disabled:opacity-50"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Enable
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === admin.id}
                          onClick={() => void runAction(admin.id, "disable")}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                          Disable
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === admin.id}
                        onClick={() => void runAction(admin.id, "remove")}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        Remove admin
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
