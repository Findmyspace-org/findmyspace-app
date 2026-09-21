"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import OrganisationWorkspaceContext from "@/app/components/OrganisationWorkspaceContext";
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
import {
  ORGANISATION_QUERY_PARAM,
  organisationWorkspaceHref,
  resolveOrganisationWorkspaceSelection,
  type ManageableOrganisation,
} from "@/lib/access/organisation-workspace";
import {
  PEOPLE_STATUS_FILTERS,
  filterPeopleAccessGrants,
  isHistoricalPeopleAccess,
  peopleAccessAllowsManagement,
  type PeopleStatusFilter,
} from "@/lib/access/people-access-view";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get(ORGANISATION_QUERY_PARAM);
  const [organisations, setOrganisations] = useState<ManageableOrganisation[]>(
    []
  );
  const [organisationsLoading, setOrganisationsLoading] = useState(true);
  const [grants, setGrants] = useState<PublicAccessGrantView[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [spaces, setSpaces] = useState<
    Array<{ id: string; title: string | null; propertyId: string }>
  >([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<PeopleStatusFilter>("all");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("org_admin");
  const [propertyId, setPropertyId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [notifyAllBookings, setNotifyAllBookings] = useState(false);

  const selection = useMemo(
    () =>
      resolveOrganisationWorkspaceSelection({
        organisations,
        requestedId,
      }),
    [organisations, requestedId]
  );

  const organisationId =
    selection.kind === "ready" ? selection.organisation.id : "";
  const accessRequestRef = useRef(0);

  const loadOrganisations = useCallback(async () => {
    setOrganisationsLoading(true);
    setMessage("");
    try {
      const orgResult = await fetchManageableOrganisations();
      setOrganisations(orgResult.organisations || []);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not load organisations."
      );
      setOrganisations([]);
    } finally {
      setOrganisationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganisations();
  }, [loadOrganisations]);

  useEffect(() => {
    if (organisationsLoading) return;
    if (requestedId) return;
    if (!organisationId) return;
    router.replace(
      organisationWorkspaceHref("/dashboard/people", organisationId)
    );
  }, [organisationsLoading, requestedId, router, organisationId]);

  const loadAccess = useCallback(async (selectedOrganisationId: string) => {
    const requestId = ++accessRequestRef.current;
    setAccessLoading(true);
    setMessage("");
    setGrants([]);
    setProperties([]);
    setSpaces([]);
    try {
      const access = await fetchOrganisationAccess(selectedOrganisationId);
      if (requestId !== accessRequestRef.current) return;
      if (access.organisation.id !== selectedOrganisationId) {
        setGrants([]);
        setProperties([]);
        setSpaces([]);
        return;
      }
      setGrants(access.grants);
      setProperties(access.properties);
      setSpaces(access.spaces);
    } catch (err) {
      if (requestId !== accessRequestRef.current) return;
      setMessage(err instanceof Error ? err.message : "Could not load people.");
      setGrants([]);
      setProperties([]);
      setSpaces([]);
    } finally {
      if (requestId === accessRequestRef.current) {
        setAccessLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!organisationId) {
      accessRequestRef.current += 1;
      setGrants([]);
      setProperties([]);
      setSpaces([]);
      setAccessLoading(false);
      return;
    }
    void loadAccess(organisationId);
  }, [loadAccess, organisationId]);

  function selectOrganisation(nextId: string) {
    accessRequestRef.current += 1;
    setGrants([]);
    setProperties([]);
    setSpaces([]);
    setFilter("all");
    router.push(organisationWorkspaceHref("/dashboard/people", nextId));
  }

  const filteredGrants = useMemo(
    () => filterPeopleAccessGrants(grants, filter),
    [filter, grants]
  );

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
      await loadAccess(organisationId);
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
      await loadAccess(organisationId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove access.");
    } finally {
      setSaving(false);
    }
  }

  const loading = organisationsLoading || accessLoading;
  const contextOrganisation =
    selection.kind === "ready" || selection.kind === "archived"
      ? selection.organisation
      : null;
  const selectable =
    selection.kind === "empty" ? [] : selection.selectable;

  return (
    <DashboardShell
      workspaceLabel="Hosting"
      pageTitle="People & access"
      pageContext={
        contextOrganisation ? (
          <OrganisationWorkspaceContext
            name={contextOrganisation.name}
            selectedId={contextOrganisation.id}
            organisations={selectable}
            archived={selection.kind === "archived"}
            onSelect={selectOrganisation}
          />
        ) : null
      }
      pageSubtitle="Manage who has access to this organisation, its properties and spaces."
      navItems={HOST_NAV}
      activeHref="/dashboard/people"
    >
      <div className="space-y-6">
        {message ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {message}
          </p>
        ) : null}

        {organisationsLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : null}

        {!organisationsLoading && selection.kind === "empty" ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-600">
            You do not currently manage people for an organisation.
          </div>
        ) : null}

        {!organisationsLoading && selection.kind === "unavailable" ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-600">
            This organisation is not available in your workspace.
          </div>
        ) : null}

        {!organisationsLoading && selection.kind === "archived" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-950">
            This organisation is archived and cannot be managed as an active
            workspace.
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
                <h2 className="text-base font-semibold text-[#0c1d2f]">People</h2>
                <div className="flex gap-2">
                  {PEOPLE_STATUS_FILTERS.map(
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

              {accessLoading ? (
                <p className="mt-6 text-sm text-gray-500">Loading…</p>
              ) : filteredGrants.length === 0 ? (
                <p className="mt-6 text-sm text-gray-500">No people in this view yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-gray-100">
                  {filteredGrants.map((grant) => {
                    const historical = isHistoricalPeopleAccess(grant.status);
                    const canManage = peopleAccessAllowsManagement(grant.status);
                    return (
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
                            {!historical && grant.isPrimary
                              ? " · Primary Space Manager"
                              : ""}
                            {!historical && grant.notifyAllBookings
                              ? " · Booking emails on"
                              : ""}
                          </p>
                        </div>
                        {canManage ? (
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
                                  .then(() => loadAccess(organisationId))
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
                          {grant.role === "org_admin" ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void setNotifyAllBookingsRequest(
                                  organisationId,
                                  grant.id,
                                  !grant.notifyAllBookings
                                )
                                  .then(() => loadAccess(organisationId))
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
                                  .then(() => loadAccess(organisationId))
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
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleRevoke(grant)}
                            className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                        ) : null}
                      </div>
                    </li>
                    );
                  })}
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
      <Suspense fallback={<main className="p-8 text-sm text-gray-600">Loading…</main>}>
        <PeoplePageContent />
      </Suspense>
    </RequireAuth>
  );
}
