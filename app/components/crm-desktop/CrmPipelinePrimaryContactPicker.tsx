"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  fetchCrmDesktopContacts,
  setCrmOrganisationPrimaryContact,
} from "@/lib/crm-desktop/api-client";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import { patchOrganisationRowPrimaryContact } from "@/lib/crm-desktop/organisation-contact-status";

type ContactOption = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
};

type Props = {
  row: CrmOrganisationListRow;
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  onRowPatched: (row: CrmOrganisationListRow) => void;
  onAddContact: () => void;
};

export function CrmPipelinePrimaryContactPicker({
  row,
  open,
  onClose,
  anchorRef,
  onRowPatched,
  onAddContact,
}: Props) {
  const listId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCrmDesktopContacts({
        org: row.id,
        pageSize: 50,
      });
      setContacts(
        result.rows.map((c) => ({
          id: c.id,
          name: c.full_name,
          role: c.role,
          email: c.email,
          phone: c.phone || c.whatsapp,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [row.id]);

  useEffect(() => {
    if (!open) return;
    void loadContacts();
  }, [open, loadContacts]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  async function handleSetPrimary(contact: ContactOption) {
    setSavingId(contact.id);
    setError(null);
    const result = await setCrmOrganisationPrimaryContact(row.id, contact.id);
    setSavingId(null);
    if (!result.ok) {
      setError(
        typeof result.error === "string"
          ? result.error
          : "Failed to set primary contact."
      );
      return;
    }
    onRowPatched(
      patchOrganisationRowPrimaryContact(row, {
        id: contact.id,
        name: contact.name,
        role: contact.role,
        email: contact.email,
        phone: contact.phone,
      })
    );
    onClose();
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={`${listId}-title`}
      className="absolute left-0 top-full z-30 mt-1 w-[min(100%,260px)] rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p id={`${listId}-title`} className="text-xs font-semibold text-gray-800">
          Set primary contact
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <p className="px-1 py-2 text-xs text-gray-500">Loading contacts…</p>
      ) : null}
      {error ? (
        <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
      ) : null}

      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className="rounded-md border border-gray-100 px-2 py-1.5"
          >
            <p className="text-xs font-medium text-[#192a3a]">{contact.name}</p>
            {contact.role ? (
              <p className="text-[11px] text-gray-500">{contact.role}</p>
            ) : null}
            {contact.email ? (
              <p className="truncate text-[11px] text-gray-600">{contact.email}</p>
            ) : null}
            {contact.phone ? (
              <p className="text-[11px] text-gray-600">{contact.phone}</p>
            ) : null}
            <button
              type="button"
              disabled={savingId === contact.id}
              onClick={() => void handleSetPrimary(contact)}
              className="mt-1 inline-flex rounded border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-[#c1121f] hover:border-[#c1121f]/30 disabled:opacity-50"
            >
              {savingId === contact.id ? "Saving…" : "Set as primary"}
            </button>
          </li>
        ))}
        {!loading && contacts.length === 0 ? (
          <li className="px-1 py-2 text-xs text-gray-500">No contacts found.</li>
        ) : null}
      </ul>

      <button
        type="button"
        onClick={() => {
          onClose();
          onAddContact();
        }}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:border-[#c1121f]/30 hover:text-[#c1121f]"
      >
        <Plus className="h-3.5 w-3.5" /> Add new contact
      </button>
    </div>
  );
}
