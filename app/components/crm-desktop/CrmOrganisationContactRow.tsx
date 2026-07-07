"use client";

import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import type { CrmContact } from "@/lib/space-place/types";
import { crmContactMailHref, telHref } from "@/lib/space-place/contact-actions";
import {
  CrmContactEmailActions,
  CrmContactPhoneActions,
} from "./CrmContactQuickActions";

type Props = {
  contact: CrmContact;
  isPrimary?: boolean;
  canManagePrimary?: boolean;
  onSetPrimary?: (contactId: string | null) => Promise<void>;
};

function displayName(contact: CrmContact): string {
  return contact.full_name || contact.first_name || "Unnamed contact";
}

function phoneNumber(contact: CrmContact): string | null {
  return contact.phone?.trim() || contact.whatsapp?.trim() || null;
}

export function CrmOrganisationContactRow({
  contact,
  isPrimary = false,
  canManagePrimary = false,
  onSetPrimary,
}: Props) {
  const [saving, setSaving] = useState(false);
  const name = displayName(contact);
  const email = contact.email?.trim() || null;
  const phone = phoneNumber(contact);
  const mailto = crmContactMailHref(email, contact.id);
  const tel = telHref(phone);

  async function handleSetPrimary(contactId: string | null) {
    if (!onSetPrimary || saving) return;
    setSaving(true);
    try {
      await onSetPrimary(contactId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article
      data-contact-id={contact.id}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link
              href={`/admin/crm/contacts/${contact.id}`}
              className="font-semibold text-[#192a3a] hover:text-[#c1121f]"
              onClick={(event) => event.stopPropagation()}
            >
              {name}
            </Link>
            {contact.role ? (
              <span className="text-sm text-gray-600">{contact.role}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isPrimary ? (
            <span className="rounded-full bg-[#192a3a]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#192a3a]">
              Primary
            </span>
          ) : canManagePrimary && onSetPrimary ? (
            <button
              type="button"
              disabled={saving}
              onClick={(event) => {
                event.stopPropagation();
                void handleSetPrimary(contact.id);
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-[#c1121f]/30 hover:text-[#c1121f] disabled:opacity-50"
            >
              <Star className="h-3.5 w-3.5" />
              Set as primary
            </button>
          ) : null}
          {isPrimary && canManagePrimary && onSetPrimary ? (
            <button
              type="button"
              disabled={saving}
              onClick={(event) => {
                event.stopPropagation();
                void handleSetPrimary(null);
              }}
              className="text-xs font-medium text-gray-500 hover:text-[#c1121f] hover:underline disabled:opacity-50"
            >
              Remove primary
            </button>
          ) : null}
        </div>
      </div>

      {email ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {mailto ? (
            <a
              href={mailto}
              className="min-w-0 flex-1 break-all text-sm text-gray-700 hover:text-[#c1121f] hover:underline sm:truncate"
              onClick={(event) => event.stopPropagation()}
            >
              {email}
            </a>
          ) : (
            <p className="min-w-0 flex-1 break-all text-sm text-gray-700 sm:truncate">
              {email}
            </p>
          )}
          <CrmContactEmailActions email={email} contactId={contact.id} />
        </div>
      ) : null}

      {phone ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {tel ? (
            <a
              href={tel}
              className="min-w-0 flex-1 text-sm text-gray-700 hover:text-[#c1121f] hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {phone}
            </a>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-gray-700">{phone}</p>
          )}
          <CrmContactPhoneActions phone={phone} />
        </div>
      ) : null}
    </article>
  );
}
