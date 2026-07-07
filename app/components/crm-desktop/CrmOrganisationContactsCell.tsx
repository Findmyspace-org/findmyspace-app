"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CrmOrganisationContactSummary } from "@/lib/crm-desktop/types";

export function CrmOrganisationContactsCell({
  primaryContactId,
  primaryContactName,
  primaryContactRole,
  additionalContacts,
  contactCount,
}: {
  primaryContactId: string | null;
  primaryContactName: string | null;
  primaryContactRole: string | null;
  additionalContacts: CrmOrganisationContactSummary[];
  contactCount: number;
}) {
  const [open, setOpen] = useState(false);

  if (!primaryContactName) {
    return <span className="text-sm text-gray-400">No contact</span>;
  }

  return (
    <div className="text-sm">
      <Link
        href={`/admin/crm/contacts/${primaryContactId}`}
        className="font-medium text-[#192a3a] hover:text-[#c1121f]"
      >
        {primaryContactName}
      </Link>
      {primaryContactRole ? (
        <p className="text-xs text-gray-500">{primaryContactRole}</p>
      ) : null}
      {contactCount > 1 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 flex items-center gap-1 text-xs text-[#c1121f] hover:underline"
        >
          +{contactCount - 1} more
          {open ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      ) : null}
      {open ? (
        <ul className="mt-2 space-y-1 rounded-lg border border-gray-100 bg-gray-50 p-2">
          {additionalContacts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/crm/contacts/${c.id}`}
                className="text-xs font-medium hover:text-[#c1121f]"
              >
                {c.name}
              </Link>
              {c.role ? (
                <span className="block text-[10px] text-gray-500">{c.role}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
