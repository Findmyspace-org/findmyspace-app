"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mail, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { crmDb } from "@/lib/space-place/db";
import { canManageCrmEmail } from "@/lib/space-place/access";
import { getCrmCaptureEmail } from "@/lib/space-place/crm-email";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { CrmEmailList } from "@/app/space-place/components/CrmEmailList";
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

export default function CrmCommunicationPage() {
  const { profile } = useSpacePlace();
  const canManage = profile ? canManageCrmEmail(profile.role) : false;
  const captureEmail = getCrmCaptureEmail();

  const [emails, setEmails] = useState<CrmEmailMessageWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{
    configured: boolean;
    host: string | null;
    user: string | null;
    secure?: boolean;
    port?: number | null;
    folder?: string | null;
    defaultDaysBack?: number | null;
    lastSuccessfulImportAt?: string | null;
    lastError?: string | null;
    hint?: string | null;
  } | null>(null);
  const [lastImport, setLastImport] = useState<{
    scanned?: number;
    imported?: number;
    matched?: number;
    unmatched?: number;
    unlinked?: number;
    duplicatesSkipped?: number;
    duplicates?: number;
    failed?: number;
    folder?: string;
    daysBack?: number;
    errors?: string[];
    lastSuccessfulImportAt?: string | null;
    lastError?: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await crmDb
        .emailMessages()
        .select(
          `*,
          crm_contacts ( id, full_name, email ),
          crm_organisations ( id, name )`
        )
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(200);
      setEmails((data as CrmEmailMessageWithRelations[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load emails.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    void crmEmailApiFetch("/api/space-place/email-import")
      .then((json) => setImportStatus(json))
      .catch((e) => setError(e instanceof Error ? e.message : "Config check failed."));
  }, [canManage]);

  const counts = useMemo(() => {
    const unlinked = emails.filter((e) => !e.contact_id).length;
    return { total: emails.length, unlinked };
  }, [emails]);

  async function runImport() {
    setImporting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await crmEmailApiFetch("/api/space-place/email-import", {
        method: "POST",
        body: JSON.stringify({
          daysBack: importStatus?.defaultDaysBack ?? 90,
          unreadOnly: false,
          folder: importStatus?.folder || "INBOX",
        }),
      });
      setLastImport(result);
      const duplicates =
        result.duplicatesSkipped ?? result.duplicates ?? 0;
      setMessage(
        `Scanned ${result.scanned ?? 0}. Imported ${result.imported ?? 0}. Matched ${result.matched ?? 0}. Unmatched ${result.unmatched ?? result.unlinked ?? 0}. Duplicates skipped ${duplicates}. Failed ${result.failed ?? 0}.`
      );
      const status = await crmEmailApiFetch("/api/space-place/email-import");
      setImportStatus(status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Email import is available to CRM admins and office managers. Desktop CRM
        admins can use the{" "}
        <Link href="/space-place/email-inbox" className="font-medium text-[#c1121f] hover:underline">
          mobile email inbox
        </Link>{" "}
        when signed in with an eligible role.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        BCC outbound emails to the CRM capture address to log them against contacts
        and organisations.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Capture address</p>
          <p className="mt-1 text-sm font-medium break-all">{captureEmail}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">IMAP import</p>
          <p className="mt-1 text-sm font-medium">
            {importStatus?.configured ? "Configured" : "Not configured"}
          </p>
          {importStatus?.host ? (
            <p className="text-xs text-gray-500">{importStatus.host}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Messages imported</p>
          <p className="mt-1 text-2xl font-semibold text-[#192a3a]">{counts.total}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Unlinked messages</p>
          <p className="mt-1 text-2xl font-semibold text-[#192a3a]">{counts.unlinked}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#192a3a]">Mailbox import</h2>
            <p className="mt-1 text-sm text-gray-600">
              Manual import only. Searches {importStatus?.folder || "INBOX"} for
              messages from the last{" "}
              {importStatus?.defaultDaysBack ?? 90} days (read and unread).
              Re-runs skip duplicates by Message-ID and IMAP UID.
            </p>
            {importStatus?.user ? (
              <p className="mt-1 text-xs text-gray-500">Mailbox user: {importStatus.user}</p>
            ) : null}
            {importStatus?.lastSuccessfulImportAt ? (
              <p className="mt-1 text-xs text-gray-500">
                Last successful import:{" "}
                {new Date(importStatus.lastSuccessfulImportAt).toLocaleString()}
              </p>
            ) : null}
            {importStatus?.lastError ? (
              <p className="mt-1 text-xs text-red-600">
                Last error: {importStatus.lastError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={importing || !importStatus?.configured}
              className="inline-flex items-center gap-2 rounded-lg bg-[#c1121f] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {importing ? "Importing…" : "Import from mailbox"}
            </button>
            <Link
              href="/space-place/email-inbox"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Unlinked emails
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
        {!importStatus?.configured ? (
          <p className="mt-3 text-sm text-amber-800">
            Set CRM_EMAIL_HOST, CRM_EMAIL_USER, and CRM_EMAIL_PASSWORD on the server
            to enable import.
          </p>
        ) : null}
        {lastImport?.errors?.length ? (
          <p className="mt-3 text-sm text-red-600">
            Latest import errors: {lastImport.errors.join("; ")}
          </p>
        ) : null}
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading emails…</p>
      ) : (
        <CrmEmailList emails={emails} adminLinks />
      )}
    </div>
  );
}
