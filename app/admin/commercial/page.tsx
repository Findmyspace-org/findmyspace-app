"use client";

import { useMemo, useState } from "react";
import { AdminNav } from "@/app/components/AdminNav";
import { AdminCommercialTermsPanel } from "@/app/components/admin/AdminCommercialTermsPanel";
import { adminApiFetch } from "@/lib/admin-api-client";
import type { CommercialScopeType } from "@/lib/commercial-terms";

type SearchKind = "organisation" | "property" | "space";

type SearchHit = {
  kind: SearchKind;
  id: string;
  name: string;
  subtitle: string | null;
  organisationId: string | null;
  propertyId: string | null;
  spaceId: string | null;
};

export default function AdminCommercialPage() {
  const [kind, setKind] = useState<SearchKind>("organisation");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<SearchHit | null>(null);

  const selectedScope = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "organisation") {
      return {
        scopeType: "organisation" as CommercialScopeType,
        scopeId: selected.id,
        organisationId: selected.id,
        propertyId: null as string | null,
        spaceId: null as string | null,
        title: `Organisation override · ${selected.name}`,
      };
    }
    if (selected.kind === "property") {
      return {
        scopeType: "property" as CommercialScopeType,
        scopeId: selected.id,
        organisationId: selected.organisationId,
        propertyId: selected.id,
        spaceId: null as string | null,
        title: `Property override · ${selected.name}`,
      };
    }
    return {
      scopeType: "space" as CommercialScopeType,
      scopeId: selected.id,
      organisationId: selected.organisationId,
      propertyId: selected.propertyId,
      spaceId: selected.id,
      title: `Space override · ${selected.name}`,
    };
  }, [selected]);

  async function handleSearch() {
    setSearching(true);
    setSearchError("");
    try {
      const json = (await adminApiFetch(
        `/api/admin/commercial-terms/search?kind=${kind}&q=${encodeURIComponent(query)}`
      )) as { items?: SearchHit[] };
      setHits(json.items ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Could not search.");
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-6 py-10 text-[#192a3a]">
      <AdminNav current="commercial" />
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Commercial terms</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Global Admin defines the platform default and any organisation,
            property, or space override. Hosts cannot change the commercial model.
            Existing paid bookings stay on the fees snapshotted when they were
            created. Monthly subscription is not invoiced automatically yet.
          </p>
        </div>

        <AdminCommercialTermsPanel
          scopeType="platform"
          title="Platform default"
        />

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Specific overrides
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Search for an organisation, property, or space to inspect inherited
            terms and save a more specific Global Admin override.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as SearchKind);
                setHits([]);
              }}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="organisation">Organisation</option>
              <option value="property">Property</option>
              <option value="space">Space</option>
            </select>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSearch();
              }}
              placeholder={`Search ${kind}s`}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searching || query.trim().length < 2}
              className="rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {searchError ? (
            <p className="mt-2 text-sm text-red-700">{searchError}</p>
          ) : null}
          {hits.length > 0 ? (
            <ul className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200">
              {hits.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(hit)}
                    className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      selected?.id === hit.id ? "bg-slate-100" : ""
                    }`}
                  >
                    <span className="font-medium">{hit.name}</span>
                    {hit.subtitle ? (
                      <span className="text-xs text-gray-500">{hit.subtitle}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {selectedScope ? (
          <AdminCommercialTermsPanel
            key={`${selectedScope.scopeType}-${selectedScope.scopeId}`}
            scopeType={selectedScope.scopeType}
            scopeId={selectedScope.scopeId}
            organisationId={selectedScope.organisationId}
            propertyId={selectedScope.propertyId}
            spaceId={selectedScope.spaceId}
            title={selectedScope.title}
          />
        ) : null}
      </div>
    </main>
  );
}
