"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { CrmDesktopDrawer } from "@/app/components/crm-desktop/CrmDesktopDrawer";

export type PropertySearchResult = {
  id: string;
  name: string;
  address: string;
  owner_name: string;
  owner_status: string;
  space_count: number;
  listing_status: string;
  crm_organisation_id: string | null;
  crm_organisation_name: string | null;
  is_linked: boolean;
  admin_url: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  organisationId: string;
  organisationName: string;
  onLinked: (counts: {
    linkedPropertyCount: number;
    linkedSpaceCount: number;
  }) => void;
  stackAboveDrawer?: boolean;
};

export function LinkPropertyPanel({
  open,
  onClose,
  organisationId,
  organisationName,
  onLinked,
  stackAboveDrawer = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<PropertySearchResult | null>(
    null
  );

  const search = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (term.trim()) params.set("q", term.trim());
      const json = await adminApiFetch(
        `/api/admin/crm/desktop/organisation-properties/search?${params.toString()}`
      );
      setResults((json.properties as PropertySearchResult[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void search(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, search]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      setReassignTarget(null);
    }
  }, [open]);

  async function linkProperty(propertyId: string) {
    setSaving(true);
    setError(null);
    try {
      const json = (await adminApiFetch(
        "/api/admin/crm/desktop/organisation-properties/link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organisationId, propertyId }),
        }
      )) as {
        counts: { linkedPropertyCount: number; linkedSpaceCount: number };
      };
      onLinked({
        linkedPropertyCount: json.counts.linkedPropertyCount,
        linkedSpaceCount: json.counts.linkedSpaceCount,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link property.");
    } finally {
      setSaving(false);
    }
  }

  async function reassignProperty(property: PropertySearchResult) {
    setSaving(true);
    setError(null);
    try {
      const json = (await adminApiFetch(
        "/api/admin/crm/desktop/organisation-properties/reassign",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: property.id,
            newOrganisationId: organisationId,
          }),
        }
      )) as {
        newCounts: { linkedPropertyCount: number; linkedSpaceCount: number };
      };
      onLinked({
        linkedPropertyCount: json.newCounts.linkedPropertyCount,
        linkedSpaceCount: json.newCounts.linkedSpaceCount,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reassign property."
      );
    } finally {
      setSaving(false);
      setReassignTarget(null);
    }
  }

  return (
    <CrmDesktopDrawer
      open={open}
      title="Link existing property"
      subtitle={`Link a marketplace property to ${organisationName}`}
      onClose={onClose}
      saving={saving}
      error={error}
      overlayZIndexClass={stackAboveDrawer ? "z-[70]" : "z-50"}
      footer={
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      }
    >
      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-gray-600">Search properties</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Property name, address, owner, listing…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3"
          />
        </span>
      </label>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching…
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-gray-500">No properties found.</p>
      ) : (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {results.map((property) => {
            const linkedElsewhere =
              property.is_linked &&
              property.crm_organisation_id !== organisationId;
            const linkedHere = property.crm_organisation_id === organisationId;

            return (
              <li
                key={property.id}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[#192a3a]">{property.name}</p>
                    <p className="text-xs text-gray-500">{property.address}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Owner: {property.owner_name} · {property.space_count} space
                      {property.space_count === 1 ? "" : "s"} ·{" "}
                      {property.listing_status}
                    </p>
                    {linkedElsewhere ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Linked to {property.crm_organisation_name}
                      </p>
                    ) : null}
                    {linkedHere ? (
                      <p className="mt-1 text-xs text-green-700">
                        Already linked to this organisation
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {linkedHere ? null : linkedElsewhere ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setReassignTarget(property)}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                      >
                        Reassign
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void linkProperty(property.id)}
                        className="rounded-lg bg-[#c1121f] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Link
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reassignTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#192a3a]">
                  Reassign property
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Move <strong>{reassignTarget.name}</strong> from{" "}
                  <strong>{reassignTarget.crm_organisation_name}</strong> to{" "}
                  <strong>{organisationName}</strong>?
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  {reassignTarget.space_count} space
                  {reassignTarget.space_count === 1 ? "" : "s"} will move with this
                  CRM link. Marketplace ownership and listing data stay unchanged.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReassignTarget(null)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReassignTarget(null)}
                disabled={saving}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void reassignProperty(reassignTarget)}
                className="flex-1 rounded-lg bg-[#c1121f] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Reassigning…" : "Reassign property"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CrmDesktopDrawer>
  );
}
