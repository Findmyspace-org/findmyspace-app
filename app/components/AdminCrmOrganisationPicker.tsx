"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Unlink, Users } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";

export type CrmOrganisationOption = {
  id: string;
  name: string;
  website?: string | null;
  address?: string | null;
};

type Props = {
  value: string | null;
  organisationName?: string | null;
  onChange: (org: CrmOrganisationOption | null) => void;
  readOnly?: boolean;
};

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]";

export function AdminCrmOrganisationPicker({
  value,
  organisationName,
  onChange,
  readOnly = false,
}: Props) {
  const [displayName, setDisplayName] = useState(organisationName ?? "");
  const [orgQuery, setOrgQuery] = useState("");
  const [orgResults, setOrgResults] = useState<CrmOrganisationOption[]>([]);
  const [searchingOrgs, setSearchingOrgs] = useState(false);

  useEffect(() => {
    setDisplayName(organisationName ?? "");
  }, [organisationName]);

  const searchOrgs = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setOrgResults([]);
      return;
    }
    setSearchingOrgs(true);
    try {
      const result = await adminApiFetch(
        `/api/admin/crm/organisations/search?q=${encodeURIComponent(q.trim())}`
      );
      setOrgResults((result.organisations as CrmOrganisationOption[]) || []);
    } catch {
      setOrgResults([]);
    } finally {
      setSearchingOrgs(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void searchOrgs(orgQuery);
    }, 300);
    return () => window.clearTimeout(t);
  }, [orgQuery, searchOrgs]);

  function selectOrganisation(org: CrmOrganisationOption) {
    setDisplayName(org.name);
    setOrgQuery("");
    setOrgResults([]);
    onChange(org);
  }

  function clearSelection() {
    setDisplayName("");
    setOrgQuery("");
    setOrgResults([]);
    onChange(null);
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">
          CRM organisation (optional)
        </span>
        <p className="mb-2 text-xs text-gray-500">
          Link this property to a Space Place CRM organisation for acquisition
          tracking.
        </p>
      </div>

      {value ? (
        <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Organisation
              </p>
              <p className="font-medium text-gray-900">
                {displayName || "Linked organisation"}
              </p>
            </div>
            <Link
              href={`/space-place/organisations/${value}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0f2740] hover:underline"
              target="_blank"
            >
              Open in CRM
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {!readOnly ? (
            <button
              type="button"
              onClick={clearSelection}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:underline"
            >
              <Unlink className="h-3.5 w-3.5" />
              Clear selection
            </button>
          ) : null}
        </div>
      ) : null}

      {!readOnly && !value ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Search organisation
          </label>
          <input
            type="search"
            value={orgQuery}
            onChange={(e) => setOrgQuery(e.target.value)}
            placeholder="Type organisation name…"
            className={FIELD_CLASS}
          />
          {searchingOrgs ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching…
            </p>
          ) : null}
          {orgResults.length > 0 ? (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">
              {orgResults.map((org) => (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() => selectOrganisation(org)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <span>
                      <span className="font-medium text-gray-900">{org.name}</span>
                      {org.address ? (
                        <span className="block text-xs text-gray-500">{org.address}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : orgQuery.trim().length >= 2 && !searchingOrgs ? (
            <p className="mt-1 text-xs text-gray-500">No organisations found.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
