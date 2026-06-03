/**
 * CRM email capture (mailto + future inbox automation).
 *
 * Flow today:
 * - User clicks Email on a contact → default mail client opens with BCC to the capture mailbox
 *   and subject `[CRM:CONTACT_ID] FindMySpace`.
 *
 * Future (not implemented yet):
 * - The capture mailbox (crm@findmyspace.co.za by default) will be connected via Outlook/IMAP.
 * - Incoming messages BCC'd or sent to that mailbox will be imported.
 * - Subjects containing `[CRM:CONTACT_ID]` will be parsed to auto-create CRM engagements and
 *   link `crm_email_messages` to the correct contact without manual linking.
 */

/** Default trailing subject after the CRM contact tag. */
export const CRM_DEFAULT_EMAIL_SUBJECT = "FindMySpace";

/** Subject tag prefix for contact auto-linking, e.g. [CRM:uuid] */
export const CRM_CONTACT_SUBJECT_TAG_PREFIX = "[CRM:";

const FALLBACK_CAPTURE_EMAIL = "crm@findmyspace.co.za";

/**
 * Capture mailbox from NEXT_PUBLIC_CRM_CAPTURE_EMAIL (available in browser and server).
 */
export function getCrmCaptureEmail(): string {
  return (
    process.env.NEXT_PUBLIC_CRM_CAPTURE_EMAIL?.trim() || FALLBACK_CAPTURE_EMAIL
  );
}

/** @deprecated Use getCrmCaptureEmail() */
export function getCrmLogEmail(): string {
  return getCrmCaptureEmail();
}

export type BuildCrmMailtoLinkOptions = {
  email: string;
  contactId: string;
  subject?: string;
};

/**
 * Builds a mailto link for CRM outreach with capture BCC and contact ID in the subject.
 *
 * Example:
 * mailto:john@company.com?bcc=crm%40findmyspace.co.za&subject=%5BCRM%3Auuid%5D%20FindMySpace
 */
export function buildCrmMailtoLink({
  email,
  contactId,
  subject = CRM_DEFAULT_EMAIL_SUBJECT,
}: BuildCrmMailtoLinkOptions): string {
  const addr = email.trim();
  const bcc = getCrmCaptureEmail();
  const fullSubject = `${CRM_CONTACT_SUBJECT_TAG_PREFIX}${contactId}] ${subject}`;
  const params = new URLSearchParams();
  params.set("bcc", bcc);
  params.set("subject", fullSubject);
  return `mailto:${addr}?${params.toString()}`;
}

/**
 * Extract CRM contact id from an email subject (for future IMAP/Outlook import).
 * Returns null until inbound parsing is implemented.
 */
export function parseCrmContactIdFromSubject(
  subject: string | null | undefined
): string | null {
  if (!subject?.trim()) return null;
  const match = subject.match(/\[CRM:([0-9a-f-]{36})\]/i);
  return match?.[1] ?? null;
}

export function normalizeEmailAddress(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim().toLowerCase();
  const angle = trimmed.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : trimmed).trim();
  return addr.includes("@") ? addr : null;
}

type MailAddressEntry = { address?: string; name?: string };
type MailAddressObject = { value?: MailAddressEntry[] };

export function extractEmailsFromList(
  value:
    | string
    | MailAddressEntry
    | MailAddressEntry[]
    | MailAddressObject
    | MailAddressObject[]
    | null
    | undefined
): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/[,;]/)
      .map((part) => normalizeEmailAddress(part))
      .filter((e): e is string => Boolean(e));
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractEmailsFromList(entry));
  }
  if ("value" in value && Array.isArray(value.value)) {
    return value.value
      .map((entry) => normalizeEmailAddress(entry.address ?? null))
      .filter((e): e is string => Boolean(e));
  }
  if ("address" in value) {
    const one = normalizeEmailAddress(value.address ?? null);
    return one ? [one] : [];
  }
  return [];
}

/** @deprecated Use buildCrmMailtoLink with contactId */
export function crmMailtoHref(
  to: string,
  options?: { subject?: string | null; body?: string | null }
): string {
  const params = new URLSearchParams();
  params.set("bcc", getCrmCaptureEmail());
  if (options?.subject) params.set("subject", options.subject);
  if (options?.body) params.set("body", options.body);
  return `mailto:${to.trim()}?${params.toString()}`;
}

export function emailPreview(text: string | null | undefined, max = 120): string {
  if (!text?.trim()) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}
