import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import {
  extractEmailsFromList,
  getCrmCaptureEmail,
  normalizeEmailAddress,
} from "@/lib/space-place/crm-email";

export type EmailImportEnv = {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
};

export function readEmailImportEnv(): EmailImportEnv | null {
  const host = process.env.CRM_EMAIL_HOST?.trim();
  const user = process.env.CRM_EMAIL_USER?.trim();
  const password = process.env.CRM_EMAIL_PASSWORD;
  if (!host || !user || !password) return null;

  const port = Number(process.env.CRM_EMAIL_PORT || "993");
  const secure = process.env.CRM_EMAIL_SECURE !== "false";

  return { host, port, user, password, secure };
}

type ContactMatch = {
  id: string;
  organisation_id: string;
  email: string | null;
};

function recipientEmails(parsed: ParsedMail): string[] {
  const logNorm = normalizeEmailAddress(getCrmCaptureEmail());
  const all = [
    ...extractEmailsFromList(parsed.to),
    ...extractEmailsFromList(parsed.cc),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of all) {
    if (logNorm && email === logNorm) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function resolveMessageId(parsed: ParsedMail, fallback: string): string {
  const id = parsed.messageId?.trim();
  if (id) return id;
  return fallback;
}

async function findContactByEmails(
  db: SupabaseClient,
  emails: string[]
): Promise<ContactMatch | null> {
  if (emails.length === 0) return null;

  const { data, error } = await (db.from("crm_contacts") as ReturnType<
    typeof db.from
  >)
    .select("id, organisation_id, email")
    .not("email", "is", null);

  if (error || !data?.length) return null;

  const wanted = new Set(emails);
  for (const row of data as ContactMatch[]) {
    const norm = normalizeEmailAddress(row.email);
    if (norm && wanted.has(norm)) return row;
  }
  return null;
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

async function importParsedMessage(
  db: SupabaseClient,
  parsed: ParsedMail,
  fallbackMessageId: string
): Promise<"imported" | "duplicate" | "skipped"> {
  const messageId = resolveMessageId(parsed, fallbackMessageId);

  const { data: existing } = await (db.from("crm_email_messages") as ReturnType<
    typeof db.from
  >)
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();

  if (existing) return "duplicate";

  const recipients = recipientEmails(parsed);
  const contact = await findContactByEmails(db, recipients);
  const fromList = extractEmailsFromList(parsed.from);
  const fromEmail = fromList[0] ?? null;
  const createdBy = await findProfileByEmail(db, fromEmail);
  const sentAt = parsed.date?.toISOString() ?? new Date().toISOString();

  const { data: inserted, error: insertErr } = await (
    db.from("crm_email_messages") as ReturnType<typeof db.from>
  )
    .insert({
      organisation_id: contact?.organisation_id ?? null,
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
    })
    .select("id, organisation_id, contact_id, subject, sent_at, created_by")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") return "duplicate";
    console.error("[email-import] insert failed", insertErr.message);
    return "skipped";
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

  return "imported";
}

export type EmailImportResult = {
  imported: number;
  duplicates: number;
  skipped: number;
  markedRead: number;
  errors: string[];
};

export async function runCrmEmailImport(
  db: SupabaseClient,
  env: EmailImportEnv
): Promise<EmailImportResult> {
  const result: EmailImportResult = {
    imported: 0,
    duplicates: 0,
    skipped: 0,
    markedRead: 0,
    errors: [],
  };

  const client = new ImapFlow({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.password },
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock("INBOX");
  try {
    for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
      if (!msg.uid || !msg.source) continue;
      try {
        const parsed = await simpleParser(msg.source);
        const status = await importParsedMessage(
          db,
          parsed,
          `imap-uid:${msg.uid}@${env.host}`
        );

        if (status === "imported") result.imported += 1;
        else if (status === "duplicate") result.duplicates += 1;
        else result.skipped += 1;

        await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
        result.markedRead += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`UID ${msg.uid}: ${message}`);
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();
  return result;
}

export async function linkEmailToContact(
  db: SupabaseClient,
  emailId: string,
  contactId: string,
  linkedBy: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: contact, error: contactErr } = await (
    db.from("crm_contacts") as ReturnType<typeof db.from>
  )
    .select("id, organisation_id, email")
    .eq("id", contactId)
    .maybeSingle();

  if (contactErr || !contact) {
    return { ok: false, error: contactErr?.message || "Contact not found." };
  }

  const orgId = (contact as { organisation_id: string }).organisation_id;

  const { data: emailRow, error: emailErr } = await (
    db.from("crm_email_messages") as ReturnType<typeof db.from>
  )
    .select("id, subject, sent_at, created_by, engagement_id")
    .eq("id", emailId)
    .maybeSingle();

  if (emailErr || !emailRow) {
    return { ok: false, error: emailErr?.message || "Email not found." };
  }

  const row = emailRow as {
    id: string;
    subject: string | null;
    sent_at: string | null;
    created_by: string | null;
    engagement_id: string | null;
  };

  let engagementId = row.engagement_id;
  if (!engagementId) {
    engagementId = await createEngagementForEmail(db, {
      organisation_id: orgId,
      contact_id: contactId,
      subject: row.subject,
      sent_at: row.sent_at ?? new Date().toISOString(),
      created_by: row.created_by ?? linkedBy,
    });
  }

  const { error: updateErr } = await (db.from("crm_email_messages") as ReturnType<
    typeof db.from
  >)
    .update({
      contact_id: contactId,
      organisation_id: orgId,
      engagement_id: engagementId,
      created_by: row.created_by ?? linkedBy,
    })
    .eq("id", emailId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  return { ok: true };
}
