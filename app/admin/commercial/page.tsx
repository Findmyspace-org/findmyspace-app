"use client";

import { useState } from "react";
import { AdminNav } from "@/app/components/AdminNav";
import { AdminCommercialTermsPanel } from "@/app/components/admin/AdminCommercialTermsPanel";
import { adminApiFetch } from "@/lib/admin-api-client";
import type { CommercialScopeType } from "@/lib/commercial-terms";
import type { DecoratedCommercialSearchHit } from "@/lib/commercial-admin-display";

type SearchKind = "all" | "organisation" | "property" | "space";

export default function AdminCommercialPage() {
  const [kind, setKind] = useState<SearchKind>("all");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DecoratedCommercialSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<DecoratedCommercialSearchHit | null>(
    null
  );

  const selectedScope = selected
    ? {
        scopeType: selected.kind as CommercialScopeType,
        scopeId: selected.id,
        organisationId: selected.organisationId,
        propertyId: selected.propertyId,
        spaceId: selected.spaceId,
        title: `${selected.kindLabel} · ${selected.name}`,
      }
    : null;

  async function handleSearch() {
    setSearching(true);
    setSearchError("");
    try {
      const json = (await adminApiFetch(
        `/api/admin/commercial-terms/search?kind=${kind}&q=${encodeURIComponent(query)}`
      )) as { items?: DecoratedCommercialSearchHit[] };
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
            Organisation owns properties; each property contains bookable spaces.
            Global Admin sets the platform default and any more specific override.
            Hosts cannot change the commercial model. Monthly subscription invoices
            are created from Global Admin → Subscriptions, not from this page.
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
            Search organisations, properties or spaces. Results show the entity
            type, parent context, and where current terms come from.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as SearchKind);
                setHits([]);
              }}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
              aria-label="Search scope"
            >
              <option value="all">Organisations, properties and spaces</option>
              <option value="organisation">Organisations only</option>
              <option value="property">Properties only</option>
              <option value="space">Spaces only</option>
            </select>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSearch();
              }}
              placeholder="Search organisations, properties or spaces"
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
                      selected?.id === hit.id && selected.kind === hit.kind
                        ? "bg-slate-100"
                        : ""
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {hit.kindLabel}
                    </span>
                    <span className="font-medium">{hit.name}</span>
                    {hit.parentContext ? (
                      <span className="text-xs text-gray-500">{hit.parentContext}</span>
                    ) : null}
                    <span className="mt-1 text-xs text-gray-600">
                      {hit.commercialSummary}
                      {" · "}
                      {hit.isLegacy ? "Legacy fallback" : hit.inheritedFrom}
                    </span>
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
