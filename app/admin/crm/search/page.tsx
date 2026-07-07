"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchCrmDesktopSearch } from "@/lib/crm-desktop/api-client";
import type { CrmSearchResultGroup } from "@/lib/crm-desktop/types";

const GROUP_LABELS: Record<CrmSearchResultGroup["type"], string> = {
  organisation: "Organisations",
  contact: "Contacts",
  space: "Marketplace spaces",
  property: "Properties",
};

function SearchPageInner() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const [groups, setGroups] = useState<CrmSearchResultGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setGroups([]);
      return;
    }
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchCrmDesktopSearch(q);
        setGroups(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        setLoading(false);
      }
    })();
  }, [q]);

  return (
    <div className="space-y-4">
      {!q ? (
        <p className="text-sm text-gray-600">
          Use the search field in the top bar or enter a query:{" "}
          <code className="rounded bg-gray-100 px-1">?q=...</code>
        </p>
      ) : null}

      {loading ? <p className="text-sm text-gray-500">Searching…</p> : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.type}
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-[#192a3a]">
            {GROUP_LABELS[group.type]}
          </h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {group.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block py-2 hover:text-[#c1121f]"
                >
                  <p className="font-medium">{item.title}</p>
                  {item.subtitle ? (
                    <p className="text-sm text-gray-500">{item.subtitle}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {q && !loading && !error && groups.length === 0 ? (
        <p className="text-sm text-gray-500">No results for “{q}”.</p>
      ) : null}
    </div>
  );
}

export default function CrmSearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <SearchPageInner />
    </Suspense>
  );
}
