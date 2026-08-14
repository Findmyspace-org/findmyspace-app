"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { ownerApiFetch } from "@/lib/owner-api-client";

type SpaceOption = { id: string; title: string };
type ManagerSpace = { assignment_id: string; space_id: string; title: string };
type ManagerRow = {
  user_id: string;
  email: string | null;
  name: string;
  receive_notifications: boolean;
  spaces: ManagerSpace[];
};
type PendingInvite = {
  id: string;
  email: string;
  receive_notifications: boolean;
  expires_at: string;
  spaces: { space_id: string; title: string }[];
};

type TeamState = {
  spaces: SpaceOption[];
  managers: ManagerRow[];
  pending_invites: PendingInvite[];
};

type Props = {
  propertyId: string;
  mode: "owner" | "admin";
};

export function PropertyTeamPanel({ propertyId, mode }: Props) {
  const [team, setTeam] = useState<TeamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);
  const [receiveNotifications, setReceiveNotifications] = useState(true);

  const fetchJson = mode === "admin" ? adminApiFetch : ownerApiFetch;
  const basePath =
    mode === "admin"
      ? `/api/admin/properties/${propertyId}/managers`
      : `/api/owner/properties/${propertyId}/managers`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = (await fetchJson(basePath)) as TeamState;
      setTeam(result);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load team.");
    }
    setLoading(false);
  }, [basePath, fetchJson]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
  }, [load]);

  function toggleSpace(spaceId: string) {
    setSelectedSpaceIds((current) =>
      current.includes(spaceId)
        ? current.filter((id) => id !== spaceId)
        : [...current, spaceId]
    );
  }

  async function invite() {
    setSaving(true);
    setMessage(null);
    try {
      const result = (await fetchJson(basePath, {
        method: "POST",
        body: JSON.stringify({
          email,
          spaceIds: selectedSpaceIds,
          receiveNotifications,
          sendEmail: true,
        }),
      })) as TeamState & { assigned?: boolean; emailSent?: boolean };
      setTeam(result);
      setEmail("");
      setSelectedSpaceIds([]);
      setMessage(
        result.assigned
          ? "Access granted. They can manage the selected spaces now."
          : result.emailSent
            ? "Invite sent by email."
            : "Invite created. Email could not be sent — ask them to check with you for the link."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not invite.");
    }
    setSaving(false);
  }

  async function removeManager(userId: string) {
    setSaving(true);
    try {
      const result = (await fetchJson(`${basePath}/${userId}`, {
        method: "DELETE",
      })) as TeamState;
      setTeam(result);
      setMessage("Access removed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove access.");
    }
    setSaving(false);
  }

  async function revokeInvite(inviteId: string) {
    setSaving(true);
    try {
      const result = (await fetchJson(`${basePath}/invites/${inviteId}`, {
        method: "DELETE",
      })) as TeamState;
      setTeam(result);
      setMessage("Invite revoked.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not revoke invite.");
    }
    setSaving(false);
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-2">
        <Users className="mt-0.5 h-5 w-5 text-[#0f2740]" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Space managers</h2>
          <p className="mt-1 text-sm text-gray-600">
            Assign people to manage specific spaces. They will not administer the
            whole property or unassigned spaces.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading team…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@school.za"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">
              Assign spaces
            </legend>
            <div className="space-y-1.5">
              {(team?.spaces || []).map((space) => (
                <label key={space.id} className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={selectedSpaceIds.includes(space.id)}
                    onChange={() => toggleSpace(space.id)}
                  />
                  {space.title}
                </label>
              ))}
              {(team?.spaces || []).length === 0 ? (
                <p className="text-sm text-gray-500">Add spaces to this property first.</p>
              ) : null}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={receiveNotifications}
              onChange={(e) => setReceiveNotifications(e.target.checked)}
            />
            Receive booking and enquiry notifications for assigned spaces
          </label>

          <button
            type="button"
            disabled={saving || !email.trim() || selectedSpaceIds.length === 0}
            onClick={() => void invite()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Invite or assign
          </button>
        </div>
      )}

      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}

      {(team?.managers || []).length > 0 ? (
        <ul className="mt-5 space-y-2">
          {team!.managers.map((manager) => (
            <li
              key={manager.user_id}
              className="rounded-lg border border-gray-100 bg-[#fafbfc] px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{manager.name}</p>
                  <p className="text-xs text-gray-500">{manager.email}</p>
                  <p className="mt-1 text-gray-700">
                    {manager.spaces.map((space) => space.title).join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removeManager(manager.user_id)}
                  className="text-xs font-medium text-red-700 hover:underline disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {(team?.pending_invites || []).length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-800">Pending invites</h3>
          <ul className="mt-2 space-y-2">
            {team!.pending_invites.map((invite) => (
              <li
                key={invite.id}
                className="rounded-lg border border-gray-100 bg-[#fafbfc] px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{invite.email}</p>
                    <p className="mt-1 text-gray-700">
                      {invite.spaces.map((space) => space.title).join(", ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void revokeInvite(invite.id)}
                    className="text-xs font-medium text-red-700 hover:underline disabled:opacity-60"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
