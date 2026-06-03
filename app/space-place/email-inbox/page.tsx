"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { crmDb } from "@/lib/space-place/db";
import { canManageCrmEmail } from "@/lib/space-place/access";
import type { CrmContact, CrmEmailMessageWithRelations } from "@/lib/space-place/types";
import { useSpacePlace } from "../SpacePlaceContext";
import {
  Card,
  PageTitle,
  PrimaryButton,
  SectionHeading,
} from "../components/SpacePlaceShell";
import { CrmEmailList } from "../components/CrmEmailList";
import { FIELD_CLASS, LABEL_CLASS } from "@/lib/space-place/form-ui";
import { getCrmCaptureEmail } from "@/lib/space-place/crm-email";

async function crmApiFetch(path: string, init?: RequestInit) {
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

export default function EmailInboxPage() {
  const router = useRouter();
  const { profile } = useSpacePlace();
  const canManage = profile ? canManageCrmEmail(profile.role) : false;

  const [emails, setEmails] = useState<CrmEmailMessageWithRelations[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkContactId, setLinkContactId] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unlinked">("all");
  const [importStatus, setImportStatus] = useState<{
    configured: boolean;
    host: string | null;
    user: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [emailRes, contactRes] = await Promise.all([
      crmDb
        .emailMessages()
        .select(
          `*,
          crm_contacts ( id, full_name, email ),
          crm_organisations ( id, name )`
        )
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(200),
      crmDb.contacts().select("id, full_name, email, organisation_id").order("full_name"),
    ]);

    setEmails((emailRes.data as CrmEmailMessageWithRelations[]) || []);
    setContacts((contactRes.data as CrmContact[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (!canManage) {
      router.replace("/space-place/today");
      return;
    }
    void load();
    void crmApiFetch("/api/space-place/email-import")
      .then((s) =>
        setImportStatus({
          configured: Boolean(s.configured),
          host: s.host ?? null,
          user: s.user ?? null,
        })
      )
      .catch(() => setImportStatus({ configured: false, host: null, user: null }));
  }, [profile, canManage, load, router]);

  const filtered = useMemo(() => {
    if (filter === "unlinked") {
      return emails.filter((e) => !e.contact_id);
    }
    return emails;
  }, [emails, filter]);

  const unlinkedCount = useMemo(
    () => emails.filter((e) => !e.contact_id).length,
    [emails]
  );

  async function runImport() {
    setImporting(true);
    setMessage(null);
    try {
      const result = await crmApiFetch("/api/space-place/email-import", {
        method: "POST",
        body: JSON.stringify({ daysBack: 30, unreadOnly: false }),
      });
      const errSnippet =
        result.errors?.length > 0 ? ` Errors: ${result.errors.slice(0, 2).join("; ")}` : "";
      setMessage(
        `Scanned ${result.scanned ?? 0}, imported ${result.imported} (${result.matched ?? 0} linked, ${result.unlinked ?? 0} unlinked), ${result.duplicates} duplicates.${errSnippet}`
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function linkEmail(emailId: string) {
    const contactId = linkContactId[emailId]?.trim();
    if (!contactId) {
      setMessage("Select a contact to link.");
      return;
    }
    setLinkingId(emailId);
    setMessage(null);
    try {
      await crmApiFetch(`/api/space-place/email-messages/${emailId}/link`, {
        method: "POST",
        body: JSON.stringify({ contactId }),
      });
      setMessage("Email linked and activity logged.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Link failed.");
    } finally {
      setLinkingId(null);
    }
  }

  if (!canManage) {
    return <p className="text-neutral-600">Loading…</p>;
  }

  return (
    <div>
      <PageTitle
        title="Email inbox"
        subtitle={`Imported from BCC to ${getCrmCaptureEmail()}`}
      />

      <Card className="mb-4">
        <p className="text-sm text-neutral-600">
          BCC outgoing emails to <strong>{getCrmCaptureEmail()}</strong>. Use{" "}
          <strong>Email</strong> on a contact so the subject includes{" "}
          <code className="text-xs">[CRM:contact-id]</code> — the importer matches
          that first, then To/CC against contact emails. Linked messages appear on
          the contact and organisation pages.
        </p>
        {importStatus && !importStatus.configured ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            IMAP is not configured on this server. Add{" "}
            <code className="text-xs">CRM_EMAIL_HOST</code>,{" "}
            <code className="text-xs">CRM_EMAIL_USER</code>, and{" "}
            <code className="text-xs">CRM_EMAIL_PASSWORD</code> in Vercel (and
            locally in <code className="text-xs">.env.local</code>), then redeploy.
          </p>
        ) : importStatus?.configured ? (
          <p className="mt-2 text-xs text-neutral-500">
            IMAP: {importStatus.host} as {importStatus.user}
          </p>
        ) : null}
        <PrimaryButton
          onClick={() => void runImport()}
          disabled={importing || importStatus?.configured === false}
          className="mt-3"
        >
          {importing ? "Importing…" : "Import from mailbox (last 30 days)"}
        </PrimaryButton>
        {message ? (
          <p
            className={`mt-2 text-sm ${
              message.includes("failed") || message.includes("error")
                ? "text-red-600"
                : "text-green-700"
            }`}
          >
            {message}
          </p>
        ) : null}
      </Card>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            filter === "all"
              ? "bg-neutral-900 text-white"
              : "bg-neutral-100 text-neutral-700"
          }`}
        >
          All ({emails.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("unlinked")}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            filter === "unlinked"
              ? "bg-amber-600 text-white"
              : "bg-neutral-100 text-neutral-700"
          }`}
        >
          Unlinked ({unlinkedCount})
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-600">Loading emails…</p>
      ) : (
        <>
          {filter === "unlinked"
            ? filtered.map((email) => (
                <Card key={email.id} className="mb-3">
                  <CrmEmailList emails={[email]} />
                  <div className="mt-3 border-t border-neutral-100 pt-3">
                    <label className="block">
                      <span className={LABEL_CLASS}>Link to contact</span>
                      <select
                        value={linkContactId[email.id] || ""}
                        onChange={(e) =>
                          setLinkContactId((prev) => ({
                            ...prev,
                            [email.id]: e.target.value,
                          }))
                        }
                        className={FIELD_CLASS}
                        disabled={linkingId === email.id}
                      >
                        <option value="">Select contact</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.full_name || c.email || c.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => void linkEmail(email.id)}
                      disabled={linkingId === email.id}
                      className="mt-2 min-h-[44px] w-full rounded-xl bg-[#c1121f] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {linkingId === email.id ? "Linking…" : "Link and log activity"}
                    </button>
                  </div>
                </Card>
              ))
            : null}

          {filter === "all" ? (
            <>
              <SectionHeading>Imported emails</SectionHeading>
              <CrmEmailList emails={filtered} emptyMessage="No imported emails yet." />
            </>
          ) : filtered.length === 0 ? (
            <p className="text-neutral-500">No unlinked emails.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
