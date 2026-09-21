"use client";

import { ChevronDown } from "lucide-react";
import type { ManageableOrganisation } from "@/lib/access/organisation-workspace";
import { shouldShowOrganisationSelector } from "@/lib/access/organisation-workspace";

type OrganisationWorkspaceContextProps = {
  name: string;
  selectedId: string;
  organisations: ManageableOrganisation[];
  archived?: boolean;
  onSelect: (organisationId: string) => void;
};

export default function OrganisationWorkspaceContext({
  name,
  selectedId,
  organisations,
  archived = false,
  onSelect,
}: OrganisationWorkspaceContextProps) {
  const showSelector = shouldShowOrganisationSelector(organisations.length);
  const selectedIsSelectable = organisations.some(
    (organisation) => organisation.id === selectedId
  );

  return (
    <div>
      {showSelector ? (
        <div className="relative max-w-xl">
          <label className="sr-only" htmlFor="organisation-workspace-select">
            Organisation
          </label>
          <select
            id="organisation-workspace-select"
            aria-label="Organisation"
            value={selectedIsSelectable ? selectedId : ""}
            onChange={(event) => {
              if (event.target.value) onSelect(event.target.value);
            }}
            className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-10 text-lg font-semibold tracking-tight text-[#0c1d2f] shadow-sm sm:text-2xl"
          >
            {selectedIsSelectable ? null : (
              <option value="" disabled>
                {name}
              </option>
            )}
            {organisations.map((organisation) => (
              <option key={organisation.id} value={organisation.id}>
                {organisation.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            aria-hidden
          />
        </div>
      ) : (
        <p className="text-lg font-semibold tracking-tight text-[#0c1d2f] sm:text-2xl">
          {name}
        </p>
      )}
      {archived ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Archived
        </p>
      ) : null}
    </div>
  );
}
