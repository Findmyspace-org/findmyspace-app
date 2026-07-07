"use client";

import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import type { CrmContact } from "@/lib/space-place/types";
import { crmContactMailHref, telHref } from "@/lib/space-place/contact-actions";
import { CrmContactQuickActions } from "./CrmContactQuickActions";

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/crm/contacts/${contact.id}`}
              className="font-semibold text-[#192a3a] hover:text-[#c1121f]"
            >
              {name}
            </Link>
            {isPrimary ? (
              <span className="rounded-full bg-[#192a3a]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#192a3a]">
                Primary
              </span>
            ) : null}
          </div>
          {contact.role ? (
            <p className="mt-0.5 text-sm text-gray-600">{contact.role}</p>
          ) : null}
          <div className="mt-1 space-y-0.5 text-sm text-gray-700">
            {email ? (
              mailto ? (
                <a href={mailto} className="block truncate hover:text-[#c1121f] hover:underline">
                  {email}
                </a>
              ) : (
                <p className="truncate">{email}</p>
              )
            ) : null}
            {phone ? (
              tel ? (
                <a href={tel} className="block hover:text-[#c1121f] hover:underline">
                  {phone}
                </a>
              ) : (
                <p>{phone}</p>
              )
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <CrmContactQuickActions
            email={email}
            phone={phone}
            contactId={contact.id}
          />
          {canManagePrimary && onSetPrimary ? (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void handleSetPrimary(isPrimary ? null : contact.id)
              }
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-[#c1121f]/30 hover:text-[#c1121f] disabled:opacity-50"
            >
              <Star className={`h-3.5 w-3.5 ${isPrimary ? "fill-current" : ""}`} />
              {isPrimary ? "Remove primary" : "Set as primary"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
