import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import {
  extractEmailsFromList,
  getCrmCaptureEmail,
  normalizeEmailAddress,
} from "@/lib/space-place/crm-email";
import {
  applyImportOutcome,
  chunkUids,
  emptyEmailImportCounts,
  imapUidFallbackMessageId,
  matchContactFromParsed,
  resolveEmailImportSearch,
  resolveMessageId,
  type ContactEmailRow,
  type EmailImportCounts,
  type EmailImportSearchOptions,
} from "@/lib/space-place/email-import-helpers";

export type EmailImportEnv = {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
};

export function isEmailImportConfigured(): boolean {
  return readEmailImportEnv() !== null;
}

export function readEmailImportEnv(): EmailImportEnv | null {
  const host = process.env.CRM_EMAIL_HOST?.trim();
  const user = process.env.CRM_EMAIL_USER?.trim();
  const password = process.env.CRM_EMAIL_PASSWORD;
  if (!host || !user || !password) return null;

  const port = Number(process.env.CRM_EMAIL_PORT || "993");
  const secure = process.env.CRM_EMAIL_SECURE !== "false";

  return { host, port, user, password, secure };
}

async function loadContactsWithEmail(
  db: SupabaseClient
): Promise<ContactEmailRow[]> {
  const { data, error } = await (db.from("crm_contacts") as ReturnType<
    typeof db.from
  >)
    .select("id, organisation_id, email")
    .not("email", "is", null);

  if (error || !data?.length) return [];
  return data as ContactEmailRow[];
}

async function findProfileByEmail(
  db: SupabaseClient,
  fromEmail: string | null
): Promise<string | null> {
  if (!fromEmail) return null;
  const { data } = await (db.from("crm_profiles") as ReturnType<typeof db.from>)
    .select("id, email")
    .eq("active", true);

  for (const row of (data as { id: string; email: string | null }[]) || []) {
    if (normalizeEmailAddress(row.email) === fromEmail) return row.id;
  }
  return null;
}

async function createEngagementForEmail(
  db: SupabaseClient,
  row: {
    organisation_id: string;
    contact_id: string;
    subject: string | null;
    sent_at: string;
    created_by: string | null;
  }
): Promise<string | null> {
  const { data, error } = await (db.from("crm_engagements") as ReturnType<
    typeof db.from
  >)
    .insert({
      organisation_id: row.organisation_id,
      contact_id: row.contact_id,
      type: "email",
      summary: row.subject?.trim() || "(No subject)",
      outcome: "Email sent",
      direction: "outbound",
      occurred_at: row.sent_at,
      created_by: row.created_by,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[email-import] engagement insert failed", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

async function isDuplicateMessage(
  db: SupabaseClient,
  input: {
    messageId: string;
    imapUid: number;
    mailboxHost: string;
    mailboxFolder: string;
  }
): Promise<boolean> {
  const { data: byMessageId } = await (
    db.from("crm_email_messages") as ReturnType<typeof db.from>
  )
    .select("id")
    .eq("message_id", input.messageId)
    .maybeSingle();
  if (byMessageId) return true;

  const { data: byUid } = await (
    db.from("crm_email_messages") as ReturnType<typeof db.from>
  )
    .select("id")
    .eq("mailbox_host", input.mailboxHost)
    .eq("mailbox_folder", input.mailboxFolder)
    .eq("imap_uid", input.imapUid)
    .maybeSingle();

  return Boolean(byUid);
}

async function importParsedMessage(
  db: SupabaseClient,
  parsed: ParsedMail,
  meta: {
    fallbackMessageId: string;
    imapUid: number;
    mailboxHost: string;
    mailboxFolder: string;
    contacts: ContactEmailRow[];
  }
): Promise<
  | { status: "imported"; linked: boolean }
  | { status: "duplicate" }
  | { status: "skipped" }
> {
  const messageId = resolveMessageId(parsed, meta.fallbackMessageId);

  if (
    await isDuplicateMessage(db, {
      messageId,
      imapUid: meta.imapUid,
      mailboxHost: meta.mailboxHost,
      mailboxFolder: meta.mailboxFolder,
    })
  ) {
    return { status: "duplicate" };
  }

  const match = matchContactFromParsed(
    meta.contacts,
    parsed,
    getCrmCaptureEmail()
  );
  const contact = match.status === "matched" ? match.contact : null;
  const organisationId =
    contact?.organisation_id ??
    (match.status === "matched_organisation" ? match.organisationId : null);

  const fromList = extractEmailsFromList(parsed.from);
  const fromEmail = fromList[0] ?? null;
  const createdBy = await findProfileByEmail(db, fromEmail);
  const sentAt = parsed.date?.toISOString() ?? new Date().toISOString();

  const { data: inserted, error: insertErr } = await (
    db.from("crm_email_messages") as ReturnType<typeof db.from>
  )
    .insert({
      organisation_id: organisationId,
      contact_id: contact?.id ?? null,
      message_id: messageId,
      from_email: fromEmail,
      to_emails: extractEmailsFromList(parsed.to),
      cc_emails: extractEmailsFromList(parsed.cc),
      bcc_emails: extractEmailsFromList(parsed.bcc),
      subject: parsed.subject ?? null,
      body_text: parsed.text ?? null,
      body_html: typeof parsed.html === "string" ? parsed.html : null,
      direction: "outbound",
      sent_at: sentAt,
      created_by: createdBy,
      imap_uid: meta.imapUid,
      mailbox_folder: meta.mailboxFolder,
      mailbox_host: meta.mailboxHost,
    })
    .select("id, organisation_id, contact_id, subject, sent_at, created_by")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") return { status: "duplicate" };
    console.error("[email-import] insert failed", insertErr.message);
    return { status: "skipped" };
  }

  const emailRow = inserted as {
    id: string;
    organisation_id: string | null;
    contact_id: string | null;
    subject: string | null;
    sent_at: string;
    created_by: string | null;
  };

  if (emailRow.contact_id && emailRow.organisation_id) {
    const engagementId = await createEngagementForEmail(db, {
      organisation_id: emailRow.organisation_id,
      contact_id: emailRow.contact_id,
      subject: emailRow.subject,
      sent_at: emailRow.sent_at,
      created_by: emailRow.created_by,
    });
    if (engagementId) {
      await (db.from("crm_email_messages") as ReturnType<typeof db.from>)
        .update({ engagement_id: engagementId })
        .eq("id", emailRow.id);
    }
  }

  return {
    status: "imported",
    // Org-only multi-recipient matches count as linked (leave unlinked inbox).
    linked: Boolean(emailRow.contact_id || emailRow.organisation_id),
  };
}

export type EmailImportResult = EmailImportCounts & {
  /** Alias for UI / backwards compatibility */
  duplicates: number;
  skipped: number;
  unlinked: number;
  errors: string[];
  folder: string;
  daysBack: number;
  unreadOnly: boolean;
  lastSuccessfulImportAt: string | null;
  lastError: string | null;
};

export type EmailImportOptions = EmailImportSearchOptions & {
  createdBy?: string | null;
};

function toPublicResult(
  counts: EmailImportCounts,
  extras: {
    errors: string[];
    folder: string;
    daysBack: number;
    unreadOnly: boolean;
    lastSuccessfulImportAt: string | null;
    lastError: string | null;
  }
): EmailImportResult {
  return {
    ...counts,
    duplicates: counts.duplicatesSkipped,
    skipped: 0,
    unlinked: counts.unmatched,
    errors: extras.errors,
    folder: extras.folder,
    daysBack: extras.daysBack,
    unreadOnly: extras.unreadOnly,
    lastSuccessfulImportAt: extras.lastSuccessfulImportAt,
    lastError: extras.lastError,
  };
}

async function recordImportRun(
  db: SupabaseClient,
  input: {
    mailboxHost: string;
    folder: string;
    daysBack: number;
    unreadOnly: boolean;
    counts: EmailImportCounts;
    success: boolean;
    errorMessage: string | null;
    createdBy: string | null;
    startedAt: string;
  }
) {
  try {
    await (db.from("crm_email_import_runs") as ReturnType<typeof db.from>).insert({
      mailbox_host: input.mailboxHost,
      mailbox_folder: input.folder,
      days_back: input.daysBack,
      unread_only: input.unreadOnly,
      scanned: input.counts.scanned,
      imported: input.counts.imported,
      matched: input.counts.matched,
      unmatched: input.counts.unmatched,
      duplicates_skipped: input.counts.duplicatesSkipped,
      failed: input.counts.failed,
      marked_read: input.counts.markedRead,
      success: input.success,
      error_message: input.errorMessage,
      started_at: input.startedAt,
      finished_at: new Date().toISOString(),
      created_by: input.createdBy,
    });
  } catch (err) {
    console.error(
      "[email-import] failed to record import run",
      err instanceof Error ? err.message : err
    );
  }
}

export async function getLastEmailImportRun(
  db: SupabaseClient
): Promise<{
  lastSuccessfulImportAt: string | null;
  lastError: string | null;
  lastRun: Record<string, unknown> | null;
}> {
  const { data: success } = await (
    db.from("crm_email_import_runs") as ReturnType<typeof db.from>
  )
    .select("*")
    .eq("success", true)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: failed } = await (
    db.from("crm_email_import_runs") as ReturnType<typeof db.from>
  )
    .select("*")
    .eq("success", false)
    .not("error_message", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    lastSuccessfulImportAt:
      (success as { finished_at?: string } | null)?.finished_at ?? null,
    lastError:
      (failed as { error_message?: string } | null)?.error_message ?? null,
    lastRun: (success as Record<string, unknown> | null) ?? null,
  };
}

/**
 * Import CRM capture mailbox messages.
 *
 * Behaviour:
 * - Default lookback 90 days (SINCE), includes read + unread
 * - Explicit folder (default INBOX)
 * - SEARCH then FETCH in UID batches (no nested IMAP STORE inside fetch)
 * - Message-ID + IMAP UID deduplication
 * - One malformed message does not abort the batch
 */
export async function runCrmEmailImport(
  db: SupabaseClient,
  env: EmailImportEnv,
  options: EmailImportOptions = {}
): Promise<EmailImportResult> {
  const resolved = resolveEmailImportSearch(options);
  const startedAt = new Date().toISOString();
  let counts = emptyEmailImportCounts();
  const errors: string[] = [];
  let fatalError: string | null = null;

  const client = new ImapFlow({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.password },
    logger: false,
  });

  const contacts = await loadContactsWithEmail(db);

  try {
    await client.connect();
    const lock = await client.getMailboxLock(resolved.folder);
    try {
      // 1) SEARCH all matching UIDs first (read + unread within lookback).
      const uids = await client.search(resolved.searchQuery, { uid: true });
      const uidList = Array.isArray(uids)
        ? uids.filter((u): u is number => typeof u === "number")
        : [];

      // 2) Process in batches — never nest additional IMAP commands in fetch.
      const batches = chunkUids(uidList, resolved.batchSize);
      for (const batch of batches) {
        if (!batch.length) continue;
        const processedUids: number[] = [];

        for await (const msg of client.fetch(
          batch,
          { source: true, uid: true },
          { uid: true }
        )) {
          if (!msg.uid) continue;
          try {
            if (!msg.source) {
              counts = applyImportOutcome(counts, { status: "failed" });
              errors.push(`UID ${msg.uid}: missing message source`);
              continue;
            }

            const parsed = await simpleParser(msg.source);
            const importResult = await importParsedMessage(db, parsed, {
              fallbackMessageId: imapUidFallbackMessageId(
                msg.uid,
                env.host,
                resolved.folder
              ),
              imapUid: msg.uid,
              mailboxHost: env.host,
              mailboxFolder: resolved.folder,
              contacts,
            });

            if (importResult.status === "imported") {
              counts = applyImportOutcome(counts, {
                status: "imported",
                linked: importResult.linked,
              });
            } else if (importResult.status === "duplicate") {
              counts = applyImportOutcome(counts, { status: "duplicate" });
            } else {
              counts = applyImportOutcome(counts, { status: "failed" });
              errors.push(`UID ${msg.uid}: insert skipped`);
            }
            processedUids.push(msg.uid);
          } catch (err) {
            counts = applyImportOutcome(counts, { status: "failed" });
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`UID ${msg.uid}: ${message}`);
          }
        }

        // 3) Mark read AFTER the fetch stream finishes (ImapFlow-safe).
        if (processedUids.length) {
          try {
            await client.messageFlagsAdd(processedUids, ["\\Seen"], {
              uid: true,
            });
            counts.markedRead += processedUids.length;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`Mark-read failed for batch: ${message}`);
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err);
    errors.push(fatalError);
    try {
      await client.logout();
    } catch {
      /* ignore logout errors after failure */
    }
  }

  const success = !fatalError;
  await recordImportRun(db, {
    mailboxHost: env.host,
    folder: resolved.folder,
    daysBack: resolved.daysBack,
    unreadOnly: resolved.unreadOnly,
    counts,
    success,
    errorMessage: fatalError || (errors.length ? errors[0]! : null),
    createdBy: options.createdBy ?? null,
    startedAt,
  });

  const last = await getLastEmailImportRun(db);

  const result = toPublicResult(counts, {
    errors,
    folder: resolved.folder,
    daysBack: resolved.daysBack,
    unreadOnly: resolved.unreadOnly,
    lastSuccessfulImportAt: last.lastSuccessfulImportAt,
    lastError: fatalError || last.lastError,
  });

  if (fatalError) {
    throw new Error(fatalError);
  }

  return result;
}

export { linkEmailToContact, applyEmailLinkAction } from "@/lib/space-place/crm-email-link";
