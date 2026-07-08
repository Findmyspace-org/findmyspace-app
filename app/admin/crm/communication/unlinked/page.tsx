"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Link2, RefreshCw, Search, Unlink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { canManageCrmEmail } from "@/lib/space-place/access";
import { emailPreview } from "@/lib/space-place/crm-email";
import { formatDateTime } from "@/lib/space-place/format";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { CrmEmailDetailDrawer } from "@/app/components/crm-desktop/CrmEmailDetailDrawer";
import {
  fetchCrmDesktopContacts,
  fetchCrmDesktopOrganisations,
} from "@/lib/crm-desktop/api-client";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";

async function crmEmailApiFetch(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || res.statusText || "Request failed.");
  }
  return json;
}

type LinkMode = "contact" | "organisation";

export default function CrmUnlinkedEmailsPage() {
  const { profile } = useSpacePlace();
  const canManage = profile ? canManageCrmEmail(profile.role) : false;

  const [rows, setRows] = useState<CrmEmailMessageWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkMode>("contact");
  const [contactQ, setContactQ] = useState("");
  const [orgQ, setOrgQ] = useState("");
  const [contactResults, setContactResults] = useState<
    {
      id: string;
      full_name: string;
      email: string | null;
      role: string | null;
      organisation_id: string;
      organisation_name: string;
    }[]
  >([]);
  const [orgResults, setOrgResults] = useState<{ id: string; name: string }[]>(
    []
  );
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        unlinked: "1",
        pageSize: "100",
      });
      if (q.trim()) params.set("q", q.trim());
      if (dateFrom) params.set("from", `${dateFrom}T00:00:00.000Z`);
      const json = await crmEmailApiFetch(
        `/api/space-place/email-messages?${params.toString()}`
      );
      setRows((json.rows as CrmEmailMessageWithRelations[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load emails.");
    } finally {
      setLoading(false);
    }
  }, [q, dateFrom]);

  useEffect(() => {
    if (!canManage) return;
    const handle = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [canManage, load]);

  const selected = rows.find((r) => r.id === openId) ?? null;

  async function searchContacts(query: string) {
    setContactQ(query);
    if (query.trim().length < 2) {
      setContactResults([]);
      return;
    }
    try {
      const result = await fetchCrmDesktopContacts({
        q: query.trim(),
        pageSize: 20,
      });
      setContactResults(
        result.rows.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          email: r.email,
          role: r.role,
          organisation_id: r.organisation_id,
          organisation_name: r.organisation_name,
        }))
      );
    } catch {
      setContactResults([]);
    }
  }

  async function searchOrgs(query: string) {
    setOrgQ(query);
    if (query.trim().length < 2) {
      setOrgResults([]);
      return;
    }
    try {
      const result = await fetchCrmDesktopOrganisations({
        q: query.trim(),
        pageSize: 20,
      });
      setOrgResults(
        result.rows.map((r) => ({
          id: r.id,
          name: r.name,
        }))
      );
    } catch {
      setOrgResults([]);
    }
  }

  function openLinkPanel(emailId: string) {
    setLinkingId(emailId);
    setOpenId(emailId);
    setSelectedContactId("");
    setSelectedOrgId("");
    setContactQ("");
    setOrgQ("");
    setContactResults([]);
    setOrgResults([]);
    setLinkMode("contact");
    setMessage(null);
  }

  async function saveLink(action: "link" | "unlink" = "link") {
    if (!linkingId && action !== "unlink") return;
    const emailId = linkingId || openId;
    if (!emailId) return;

    if (action === "unlink") {
      if (!window.confirm("Unlink this email from its contact and organisation?")) {
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await crmEmailApiFetch(`/api/space-place/email-messages/${emailId}`, {
        method: "PATCH",
        body: JSON.stringify(
          action === "unlink"
            ? { action: "unlink" }
            : {
                action: "link",
                contactId:
                  linkMode === "contact" ? selectedContactId || null : null,
                organisationId: selectedOrgId || null,
              }
        ),
      });
      setMessage(
        action === "unlink" ? "Email unlinked." : "Email linked successfully."
      );
      setLinkingId(null);
      setOpenId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Email linking is available to CRM admins and office managers.{" "}
        <Link href="/admin/crm/communication" className="font-medium underline">
          Back to Communication
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/crm/communication"
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#c1121f]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Communication
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-[#192a3a]">
            Unlinked emails
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Manually match imported emails to CRM contacts and organisations.
            Desktop CRM only — not the Space Place mobile inbox.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject, sender, recipient…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <label className="text-sm text-gray-600">
          From date
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-gray-500">Loading unlinked emails…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No unlinked emails.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((email) => {
            const subject = email.subject?.trim() || "(No subject)";
            const preview = emailPreview(email.body_text || email.body_html);
            const toPreview = (email.to_emails || []).slice(0, 2).join(", ");
            return (
              <li
                key={email.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Open email: ${subject}`}
                    onClick={() => setOpenId(email.id)}
                  >
                    <p className="font-semibold text-[#192a3a] hover:underline">
                      {subject}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      From {email.from_email || "—"}
                      {toPreview ? ` · To ${toPreview}` : ""}
                      {(email.cc_emails || []).length
                        ? ` · Cc ${(email.cc_emails || []).slice(0, 2).join(", ")}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {email.sent_at ? formatDateTime(email.sent_at) : "—"}
                    </p>
                    {preview ? (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                        {preview}
                      </p>
                    ) : null}
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                      Unlinked
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenId(email.id)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium"
                    >
                      Open email
                    </button>
                    <button
                      type="button"
                      onClick={() => openLinkPanel(email.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#192a3a] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Link email
                    </button>
                  </div>
                </div>

                {linkingId === email.id ? (
                  <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setLinkMode("contact")}
                        className={`rounded-lg px-3 py-1.5 text-xs ${
                          linkMode === "contact"
                            ? "bg-[#192a3a] text-white"
                            : "bg-white ring-1 ring-gray-200"
                        }`}
                      >
                        Link to contact
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkMode("organisation")}
                        className={`rounded-lg px-3 py-1.5 text-xs ${
                          linkMode === "organisation"
                            ? "bg-[#192a3a] text-white"
                            : "bg-white ring-1 ring-gray-200"
                        }`}
                      >
                        Link to organisation only
                      </button>
                    </div>

                    {linkMode === "contact" ? (
                      <div className="mt-3 space-y-2">
                        <input
                          value={contactQ}
                          onChange={(e) => void searchContacts(e.target.value)}
                          placeholder="Search contacts by name or email…"
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                        <ul className="max-h-40 overflow-auto rounded-lg border bg-white text-sm">
                          {contactResults.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                className={`block w-full px-3 py-2 text-left hover:bg-gray-50 ${
                                  selectedContactId === c.id ? "bg-emerald-50" : ""
                                }`}
                                onClick={() => {
                                  setSelectedContactId(c.id);
                                  setSelectedOrgId(c.organisation_id);
                                }}
                              >
                                <span className="font-medium">{c.full_name}</span>
                                <span className="text-gray-500">
                                  {" "}
                                  · {c.email || "no email"}
                                  {c.role ? ` · ${c.role}` : ""}
                                  {" · "}
                                  {c.organisation_name}
                                </span>
                              </button>
                            </li>
                          ))}
                          {!contactResults.length && contactQ.trim().length >= 2 ? (
                            <li className="px-3 py-2 text-gray-500">No contacts found.</li>
                          ) : null}
                        </ul>
                        {selectedContactId ? (
                          <p className="text-xs text-gray-600">
                            Organisation inferred from contact
                            {selectedOrgId
                              ? ` (${
                                  contactResults.find(
                                    (c) => c.id === selectedContactId
                                  )?.organisation_name || selectedOrgId
                                })`
                              : ""}
                            .
                          </p>
                        ) : null}
                        <Link
                          href="/admin/crm/contacts"
                          className="text-xs font-medium text-[#c1121f] hover:underline"
                        >
                          Add contact
                        </Link>
                        <p className="text-xs text-gray-500">
                          Create the contact first, then return here to link.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <input
                          value={orgQ}
                          onChange={(e) => void searchOrgs(e.target.value)}
                          placeholder="Search organisations…"
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                        <ul className="max-h-40 overflow-auto rounded-lg border bg-white text-sm">
                          {orgResults.map((o) => (
                            <li key={o.id}>
                              <button
                                type="button"
                                className={`block w-full px-3 py-2 text-left hover:bg-gray-50 ${
                                  selectedOrgId === o.id ? "bg-emerald-50" : ""
                                }`}
                                onClick={() => setSelectedOrgId(o.id)}
                              >
                                {o.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          saving ||
                          (linkMode === "contact"
                            ? !selectedContactId
                            : !selectedOrgId)
                        }
                        onClick={() => void saveLink("link")}
                        className="rounded-lg bg-[#c1121f] px-3 py-2 text-sm text-white disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkingId(null)}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <CrmEmailDetailDrawer
        email={selected}
        open={Boolean(selected)}
        onClose={() => setOpenId(null)}
        adminLinks
        linkControls={
          selected ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openLinkPanel(selected.id)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#192a3a] px-3 py-2 text-sm text-white"
              >
                <Link2 className="h-4 w-4" /> Link email
              </button>
              {(selected.contact_id || selected.organisation_id) ? (
                <button
                  type="button"
                  onClick={() => {
                    setLinkingId(selected.id);
                    void saveLink("unlink");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
                >
                  <Unlink className="h-4 w-4" /> Unlink
                </button>
              ) : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}
