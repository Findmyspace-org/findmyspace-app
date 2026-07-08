/**
 * Pure helpers for CRM IMAP import (search options, contact matching, batching).
 * Kept free of ImapFlow so unit tests can cover history/pagination/matching.
 */

import {
  extractEmailsFromList,
  getCrmCaptureEmail,
  normalizeEmailAddress,
  parseCrmContactIdFromSubject,
} from "@/lib/space-place/crm-email";
import type { ParsedMail } from "mailparser";

export const DEFAULT_EMAIL_IMPORT_LOOKBACK_DAYS = 90;
export const DEFAULT_EMAIL_IMPORT_FOLDER = "INBOX";
export const DEFAULT_EMAIL_IMPORT_BATCH_SIZE = 50;

export type EmailImportSearchOptions = {
  daysBack?: number;
  unreadOnly?: boolean;
  folder?: string;
  batchSize?: number;
};

export type ResolvedEmailImportSearch = {
  folder: string;
  daysBack: number;
  unreadOnly: boolean;
  batchSize: number;
  since: Date;
  /** ImapFlow search query object. Always uses SINCE unless unreadOnly. */
  searchQuery: { since: Date } | { seen: false; since: Date };
};

export function resolveEmailImportSearch(
  options: EmailImportSearchOptions = {}
): ResolvedEmailImportSearch {
  const daysBack = Math.max(
    1,
    Math.min(
      3650,
      Math.floor(options.daysBack ?? DEFAULT_EMAIL_IMPORT_LOOKBACK_DAYS)
    )
  );
  const unreadOnly = options.unreadOnly === true;
  const folder = (options.folder?.trim() || DEFAULT_EMAIL_IMPORT_FOLDER).toUpperCase() === "INBOX"
    ? "INBOX"
    : (options.folder?.trim() || DEFAULT_EMAIL_IMPORT_FOLDER);
  const batchSize = Math.max(
    1,
    Math.min(500, Math.floor(options.batchSize ?? DEFAULT_EMAIL_IMPORT_BATCH_SIZE))
  );
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - daysBack);

  // Always include a SINCE window. When unreadOnly is set, combine with UNSEEN.
  // Never search ALL — historical import is bounded by lookback.
  const searchQuery = unreadOnly
    ? { seen: false as const, since }
    : { since };

  return { folder, daysBack, unreadOnly, batchSize, since, searchQuery };
}

export function chunkUids(uids: number[], batchSize: number): number[][] {
  if (batchSize <= 0) return [uids];
  const batches: number[][] = [];
  for (let i = 0; i < uids.length; i += batchSize) {
    batches.push(uids.slice(i, i + batchSize));
  }
  return batches;
}

export function resolveMessageId(
  parsed: { messageId?: string | null },
  fallback: string
): string {
  const id = parsed.messageId?.trim();
  if (id) return id;
  return fallback;
}

export function imapUidFallbackMessageId(
  uid: number,
  host: string,
  folder: string
): string {
  return `imap-uid:${uid}@${host}/${folder}`;
}

export function recipientEmailsForMatching(
  parsed: Pick<ParsedMail, "to" | "cc">,
  captureEmail: string = getCrmCaptureEmail()
): string[] {
  const logNorm = normalizeEmailAddress(captureEmail);
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

export type ContactEmailRow = {
  id: string;
  organisation_id: string;
  email: string | null;
};

export type ContactMatchResult =
  | { status: "matched"; contact: ContactEmailRow }
  | {
      status: "matched_organisation";
      organisationId: string;
      contacts: ContactEmailRow[];
    }
  | { status: "unmatched" }
  | { status: "review_required"; contacts: ContactEmailRow[] };

/**
 * Exact normalised email match against contact rows.
 *
 * - Exactly one contact → matched (contact + organisation)
 * - Multiple contacts, all same organisation → matched_organisation
 *   (link org only; contact review required)
 * - Multiple contacts across organisations → review_required (remain unlinked)
 * - Multiple contacts sharing one email across orgs → review_required
 */
export function matchContactsByEmails(
  contacts: ContactEmailRow[],
  recipientEmails: string[]
): ContactMatchResult {
  if (!recipientEmails.length) return { status: "unmatched" };
  const wanted = new Set(recipientEmails);
  const hits: ContactEmailRow[] = [];
  const seenIds = new Set<string>();

  for (const row of contacts) {
    const norm = normalizeEmailAddress(row.email);
    if (!norm || !wanted.has(norm)) continue;
    if (seenIds.has(row.id)) continue;
    seenIds.add(row.id);
    hits.push(row);
  }

  if (hits.length === 0) return { status: "unmatched" };
  if (hits.length === 1) return { status: "matched", contact: hits[0]! };

  const orgIds = new Set(hits.map((h) => h.organisation_id));
  if (orgIds.size === 1) {
    return {
      status: "matched_organisation",
      organisationId: hits[0]!.organisation_id,
      contacts: hits,
    };
  }
  return { status: "review_required", contacts: hits };
}

/** Human-readable explanation for UI / rematch API. */
export function describeContactMatch(result: ContactMatchResult): string {
  switch (result.status) {
    case "matched":
      return "Matched exactly one CRM contact.";
    case "matched_organisation":
      return `Matched ${result.contacts.length} CRM contacts in one organisation. Organisation linked; contact review required.`;
    case "review_required":
      return "Matched contacts in more than one organisation. Left unlinked for manual review.";
    case "unmatched":
      return "No exact CRM contact email match.";
  }
}

export function matchContactFromParsed(
  contacts: ContactEmailRow[],
  parsed: Pick<ParsedMail, "subject" | "to" | "cc">,
  captureEmail?: string
): ContactMatchResult {
  const fromSubject = parseCrmContactIdFromSubject(parsed.subject);
  if (fromSubject) {
    const byId = contacts.find((c) => c.id === fromSubject);
    if (byId) return { status: "matched", contact: byId };
  }
  return matchContactsByEmails(
    contacts,
    recipientEmailsForMatching(parsed, captureEmail)
  );
}

export type EmailImportCounts = {
  scanned: number;
  imported: number;
  matched: number;
  unmatched: number;
  duplicatesSkipped: number;
  failed: number;
  markedRead: number;
};

export function emptyEmailImportCounts(): EmailImportCounts {
  return {
    scanned: 0,
    imported: 0,
    matched: 0,
    unmatched: 0,
    duplicatesSkipped: 0,
    failed: 0,
    markedRead: 0,
  };
}

/** Reduce per-message outcomes into batch counts (testable without IMAP). */
export function applyImportOutcome(
  counts: EmailImportCounts,
  outcome:
    | { status: "imported"; linked: boolean }
    | { status: "duplicate" }
    | { status: "failed" }
    | { status: "skipped" }
): EmailImportCounts {
  const next = { ...counts, scanned: counts.scanned + 1 };
  if (outcome.status === "imported") {
    next.imported += 1;
    if (outcome.linked) next.matched += 1;
    else next.unmatched += 1;
  } else if (outcome.status === "duplicate") {
    next.duplicatesSkipped += 1;
  } else if (outcome.status === "failed") {
    next.failed += 1;
  }
  return next;
}
