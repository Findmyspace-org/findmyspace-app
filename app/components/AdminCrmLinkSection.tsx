"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2, Unlink, Users } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import type { SpaceCrmLinkSummary } from "@/lib/space-crm-link";

type OrgResult = {
  id: string;
  name: string;
  website?: string | null;
  address?: string | null;
};

type ContactResult = {
  id: string;
  display_name: string;
  email?: string | null;
  role?: string | null;
};

type Props = {
  spaceId?: string;
  /** For create mode — parent receives link values in save payload. */
  value?: {
    crm_organisation_id: string | null;
    crm_contact_id: string | null;
  };
  onChange?: (value: {
    crm_organisation_id: string | null;
    crm_contact_id: string | null;
    organisation_name?: string | null;
    contact_name?: string | null;
  }) => void;
  initialLink?: SpaceCrmLinkSummary | null;
  readOnly?: boolean;
  /** Prefill org search when opening from CRM org page. */
  defaultOrganisationId?: string;
  defaultOrganisationName?: string;
  defaultContactId?: string;
  defaultContactName?: string;
};

export function AdminCrmLinkSection({
  spaceId,
  value,
  onChange,
  initialLink,
  readOnly = false,
  defaultOrganisationId,
  defaultOrganisationName,
  defaultContactId,
  defaultContactName,
}: Props) {
  const [link, setLink] = useState<SpaceCrmLinkSummary | null>(
    initialLink ??
      (defaultOrganisationId
        ? {
            crm_organisation_id: defaultOrganisationId,
            crm_contact_id: defaultContactId ?? null,
            organisation_name: defaultOrganisationName ?? null,
            contact_name: defaultContactName ?? null,
          }
        : null)
  );
  const [orgQuery, setOrgQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [orgResults, setOrgResults] = useState<OrgResult[]>([]);
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [searchingOrgs, setSearchingOrgs] = useState(false);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialLink) setLink(initialLink);
  }, [initialLink]);

  useEffect(() => {
    if (defaultOrganisationId && !initialLink && !link && onChange) {
      onChange({
        crm_organisation_id: defaultOrganisationId,
        crm_contact_id: defaultContactId ?? null,
        organisation_name: defaultOrganisationName ?? null,
        contact_name: defaultContactName ?? null,
      });
      setLink({
        crm_organisation_id: defaultOrganisationId,
        crm_contact_id: defaultContactId ?? null,
        organisation_name: defaultOrganisationName ?? null,
        contact_name: defaultContactName ?? null,
      });
    }
  }, [
    defaultOrganisationId,
    defaultOrganisationName,
    defaultContactId,
    defaultContactName,
    initialLink,
    link,
    onChange,
  ]);

  const selectedOrgId =
    value?.crm_organisation_id ?? link?.crm_organisation_id ?? null;
  const selectedContactId =
    value?.crm_contact_id ?? link?.crm_contact_id ?? null;

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
      setOrgResults((result.organisations as OrgResult[]) || []);
    } catch {
      setOrgResults([]);
    } finally {
      setSearchingOrgs(false);
    }
  }, []);

  const searchContacts = useCallback(
    async (q: string, organisationId: string) => {
      setSearchingContacts(true);
      try {
        const params = new URLSearchParams({ organisationId });
        if (q.trim()) params.set("q", q.trim());
        const result = await adminApiFetch(
          `/api/admin/crm/contacts/search?${params.toString()}`
        );
        setContactResults((result.contacts as ContactResult[]) || []);
      } catch {
        setContactResults([]);
      } finally {
        setSearchingContacts(false);
      }
    },
    []
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void searchOrgs(orgQuery);
    }, 300);
    return () => window.clearTimeout(t);
  }, [orgQuery, searchOrgs]);

  useEffect(() => {
    if (!selectedOrgId) {
      setContactResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchContacts(contactQuery, selectedOrgId);
    }, 300);
    return () => window.clearTimeout(t);
  }, [contactQuery, selectedOrgId, searchContacts]);

  async function persistLink(next: SpaceCrmLinkSummary | null) {
    if (!spaceId) {
      onChange?.({
        crm_organisation_id: next?.crm_organisation_id ?? null,
        crm_contact_id: next?.crm_contact_id ?? null,
        organisation_name: next?.organisation_name ?? null,
        contact_name: next?.contact_name ?? null,
      });
      setLink(next);
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      if (!next?.crm_organisation_id && !next?.crm_contact_id) {
        await adminApiFetch(`/api/admin/spaces/${spaceId}/crm-link`, {
          method: "DELETE",
        });
        setLink(null);
        onChange?.({
          crm_organisation_id: null,
          crm_contact_id: null,
        });
        return;
      }

      const result = await adminApiFetch(`/api/admin/spaces/${spaceId}/crm-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crm_organisation_id: next.crm_organisation_id,
          crm_contact_id: next.crm_contact_id,
        }),
      });
      const saved = (result.link as SpaceCrmLinkSummary) || next;
      setLink(saved);
      onChange?.({
        crm_organisation_id: saved.crm_organisation_id,
        crm_contact_id: saved.crm_contact_id,
        organisation_name: saved.organisation_name,
        contact_name: saved.contact_name,
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save CRM link.");
    } finally {
      setSaving(false);
    }
  }

  function selectOrganisation(org: OrgResult) {
    const next: SpaceCrmLinkSummary = {
      crm_organisation_id: org.id,
      crm_contact_id: null,
      organisation_name: org.name,
      contact_name: null,
    };
    setOrgQuery("");
    setOrgResults([]);
    void persistLink(next);
  }

  function selectContact(contact: ContactResult) {
    if (!selectedOrgId) return;
    const next: SpaceCrmLinkSummary = {
      crm_organisation_id: selectedOrgId,
      crm_contact_id: contact.id,
      organisation_name: link?.organisation_name ?? null,
      contact_name: contact.display_name,
    };
    setContactQuery("");
    void persistLink(next);
  }

  const hasLink = Boolean(selectedOrgId || selectedContactId);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0f2740]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">Space Place CRM link</h2>
          <p className="mt-1 text-xs text-gray-600">
            Optional — connect this listing to a CRM organisation or contact for
            acquisition tracking.
          </p>
        </div>
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden />
        ) : null}
      </div>

      {hasLink ? (
        <div className="mt-4 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-sm">
          {link?.organisation_name || selectedOrgId ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Organisation
                </p>
                <p className="font-medium text-gray-900">
                  {link?.organisation_name || "Linked organisation"}
                </p>
              </div>
              {selectedOrgId ? (
                <Link
                  href={`/space-place/organisations/${selectedOrgId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0f2740] hover:underline"
                  target="_blank"
                >
                  Open in CRM
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          ) : null}
          {link?.contact_name || selectedContactId ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f0] pt-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Contact
                </p>
                <p className="font-medium text-gray-900">
                  {link?.contact_name || "Linked contact"}
                </p>
              </div>
              {selectedContactId ? (
                <Link
                  href={`/space-place/contacts/${selectedContactId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0f2740] hover:underline"
                  target="_blank"
                >
                  Open contact
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              onClick={() => void persistLink(null)}
              disabled={saving}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
            >
              <Unlink className="h-3.5 w-3.5" />
              Unlink CRM
            </button>
          ) : null}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Search organisation
            </label>
            <input
              type="search"
              value={orgQuery}
              onChange={(e) => setOrgQuery(e.target.value)}
              placeholder="Type organisation name…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
            />
            {searchingOrgs ? (
              <p className="mt-1 text-xs text-gray-500">Searching…</p>
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
            ) : null}
          </div>

          {selectedOrgId ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Search contact (optional)
              </label>
              <input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Filter contacts in this organisation…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
              />
              {searchingContacts ? (
                <p className="mt-1 text-xs text-gray-500">Loading contacts…</p>
              ) : null}
              {contactResults.length > 0 ? (
                <ul className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                  {contactResults.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        onClick={() => selectContact(contact)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span className="font-medium text-gray-900">
                          {contact.display_name}
                        </span>
                        {contact.email ? (
                          <span className="block text-xs text-gray-500">
                            {contact.email}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="mt-3 text-xs text-red-600">{message}</p> : null}
    </section>
  );
}
