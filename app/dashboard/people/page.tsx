"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { HOST_NAV } from "@/lib/dashboard-nav";
import type { PublicAccessGrantView } from "@/lib/access/organisation-access-policy";
import {
  fetchManageableOrganisations,
  fetchOrganisationAccess,
  grantOrganisationAccessRequest,
  reassignOrganisationAccessRequest,
  revokeOrganisationAccessRequest,
  setNotifyAllBookingsRequest,
  setPrimarySpaceManagerRequest,
} from "@/lib/access/organisation-access-client";

type StatusFilter = "all" | "active" | "pending" | "revoked";

function roleLabel(role: string) {
  if (role === "org_admin") return "Organisation Admin";
  if (role === "property_manager") return "Property Manager";
  if (role === "space_manager") return "Space Manager";
  return role;
}

function statusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "pending") return "Pending";
  if (status === "all") return "All";
  return "Removed";
}

function PeoplePageContent() {
  const [organisations, setOrganisations] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [organisationId, setOrganisationId] = useState("");
  const [grants, setGrants] = useState<PublicAccessGrantView[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [spaces, setSpaces] = useState<
    Array<{ id: string; title: string | null; propertyId: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("org_admin");
  const [propertyId, setPropertyId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [notifyAllBookings, setNotifyAllBookings] = useState(false);

  const load = useCallback(async (selectedId?: string) => {
    setLoading(true);
    setMessage("");
    try {
      const orgResult = await fetchManageableOrganisations();
      const nextOrgs = orgResult.organisations || [];
      setOrganisations(nextOrgs);
      const nextId = selectedId || nextOrgs[0]?.id || "";
      setOrganisationId(nextId);
      if (!nextId) {
        setGrants([]);
        setProperties([]);
        setSpaces([]);
        return;
      }
      const access = await fetchOrganisationAccess(nextId);
      setGrants(access.grants);
      setProperties(access.properties);
      setSpaces(access.spaces);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load people.");
      setGrants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredGrants = useMemo(() => {
    if (filter === "all") return grants;
    return grants.filter((grant) => grant.status === filter);
  }, [filter, grants]);

  const spacesForProperty = useMemo(
    () => spaces.filter((space) => space.propertyId === propertyId),
    [propertyId, spaces]
  );

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!organisationId) return;
    setSaving(true);
    setMessage("");
    try {
      await grantOrganisationAccessRequest(organisationId, {
        email,
        role,
        propertyId: role === "org_admin" ? null : propertyId || null,
        spaceId: role === "space_manager" ? spaceId || null : null,
        isPrimary: role === "space_manager" ? isPrimary : false,
        notifyAllBookings: role === "org_admin" ? notifyAllBookings : false,
      });
      setEmail("");
      setIsPrimary(false);
      setNotifyAllBookings(false);
      await load(organisationId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add access.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(grant: PublicAccessGrantView) {
    if (!organisationId) return;
    if (!window.confirm(`Remove access for ${grant.email}?`)) return;
    setSaving(true);
    setMessage("");
    try {
      await revokeOrganisationAccessRequest(organisationId, grant.id);
      await load(organisationId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell
      workspaceLabel="Hosting"
      pageTitle="People"
      pageSubtitle="Give people access to this organisation. Access is granted by email — they do not need to claim a listing."
      navItems={HOST_NAV}
      activeHref="/dashboard/people"
    >
      <div className="space-y-6">
        {organisations.length > 1 ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[#192a3a]">Organisation</span>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              value={organisationId}
              onChange={(event) => {
                void load(event.target.value);
              }}
            >
              {organisations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {message ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {message}
          </p>
        ) : null}

        {!loading && organisations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-600">
            You do not currently manage people for an organisation.
          </div>
        ) : null}

        {organisationId ? (
          <>
            <form
              onSubmit={handleAdd}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <h2 className="text-base font-semibold text-[#0c1d2f]">Add person</h2>
              <p className="mt-1 text-sm text-gray-600">
                Enter their email. If they already have a verified FindMySpace
                account, access becomes active immediately. Otherwise it stays
                pending until they sign in with that email.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    placeholder="name@example.com"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Role</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="org_admin">Organisation Admin</option>
                    <option value="property_manager">Property Manager</option>
                    <option value="space_manager">Space Manager</option>
                  </select>
                </label>
                {role !== "org_admin" ? (
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Property</span>
                    <select
                      required
                      value={propertyId}
                      onChange={(event) => {
                        setPropertyId(event.target.value);
                        setSpaceId("");
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    >
                      <option value="">Select a property</option>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {role === "space_manager" ? (
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">My Spaces</span>
                    <select
                      required
                      value={spaceId}
                      onChange={(event) => setSpaceId(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    >
                      <option value="">Select a space</option>
                      {spacesForProperty.map((space) => (
                        <option key={space.id} value={space.id}>
                          {space.title || "Untitled space"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              {role === "space_manager" ? (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(event) => setIsPrimary(event.target.checked)}
                  />
                  Make this person the primary Space Manager
                </label>
              ) : null}
              {role === "org_admin" ? (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={notifyAllBookings}
                    onChange={(event) =>
                      setNotifyAllBookings(event.target.checked)
                    }
                  />
                  Email this Organisation Admin about every booking
                </label>
              ) : null}
              <button
                type="submit"
                disabled={saving || loading}
                className="mt-4 rounded-full bg-[#0c1d2f] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Add access"}
              </button>
            </form>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-[#0c1d2f]">People & access</h2>
                <div className="flex gap-2">
                  {(["all", "active", "pending", "revoked"] as StatusFilter[]).map(
                    (value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                          filter === value
                            ? "border-[#0c1d2f] bg-[#0c1d2f] text-white"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        {statusLabel(value)}
                      </button>
                    )
                  )}
                </div>
              </div>

              {loading ? (
                <p className="mt-6 text-sm text-gray-500">Loading…</p>
              ) : filteredGrants.length === 0 ? (
                <p className="mt-6 text-sm text-gray-500">No people in this view yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-gray-100">
                  {filteredGrants.map((grant) => (
                    <li key={grant.id} className="py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-[#0c1d2f]">
                            {grant.displayName || grant.email}
                          </p>
                          <p className="text-sm text-gray-600">{grant.email}</p>
                          <p className="mt-1 text-sm text-gray-700">
                            {roleLabel(grant.role)}
                            {grant.propertyName ? ` · ${grant.propertyName}` : ""}
                            {grant.spaceTitle ? ` · ${grant.spaceTitle}` : ""}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                            {statusLabel(grant.status)}
                            {grant.isPrimary ? " · Primary Space Manager" : ""}
                            {grant.notifyAllBookings
                              ? " · Booking emails on"
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {grant.role === "space_manager" &&
                          grant.status === "active" ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void setPrimarySpaceManagerRequest(
                                  organisationId,
                                  grant.id,
                                  !grant.isPrimary
                                )
                                  .then(() => load(organisationId))
                                  .catch((err) =>
                                    setMessage(
                                      err instanceof Error
                                        ? err.message
                                        : "Could not update primary."
                                    )
                                  )
                              }
                              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs"
                            >
                              {grant.isPrimary ? "Remove primary" : "Make primary"}
                            </button>
                          ) : null}
                          {grant.role === "org_admin" &&
                          grant.status !== "revoked" ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void setNotifyAllBookingsRequest(
                                  organisationId,
                                  grant.id,
                                  !grant.notifyAllBookings
                                )
                                  .then(() => load(organisationId))
                                  .catch((err) =>
                                    setMessage(
                                      err instanceof Error
                                        ? err.message
                                        : "Could not update emails."
                                    )
                                  )
                              }
                              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs"
                            >
                              {grant.notifyAllBookings
                                ? "Stop booking emails"
                                : "Email all bookings"}
                            </button>
                          ) : null}
                          {grant.role === "space_manager" &&
                          grant.status !== "revoked" &&
                          spaces.length > 0 ? (
                            <select
                              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs"
                              value={grant.spaceId || ""}
                              onChange={(event) => {
                                const nextSpace = spaces.find(
                                  (space) => space.id === event.target.value
                                );
                                if (!nextSpace) return;
                                void reassignOrganisationAccessRequest(
                                  organisationId,
                                  grant.id,
                                  {
                                    propertyId: nextSpace.propertyId,
                                    spaceId: nextSpace.id,
                                  }
                                )
                                  .then(() => load(organisationId))
                                  .catch((err) =>
                                    setMessage(
                                      err instanceof Error
                                        ? err.message
                                        : "Could not change space."
                                    )
                                  );
                              }}
                            >
                              {spaces.map((space) => (
                                <option key={space.id} value={space.id}>
                                  {space.title || "Untitled space"}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {grant.status !== "revoked" ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleRevoke(grant)}
                              className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-700"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}

export default function PeoplePage() {
  return (
    <RequireAuth>
      <PeoplePageContent />
    </RequireAuth>
  );
}
