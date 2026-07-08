#!/usr/bin/env node
/**
 * CRM IMAP historical import + pagination + matching tests.
 * Run: npm run test:crm-email-import
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyImportOutcome,
  chunkUids,
  DEFAULT_EMAIL_IMPORT_BATCH_SIZE,
  DEFAULT_EMAIL_IMPORT_FOLDER,
  DEFAULT_EMAIL_IMPORT_LOOKBACK_DAYS,
  emptyEmailImportCounts,
  imapUidFallbackMessageId,
  matchContactFromParsed,
  matchContactsByEmails,
  recipientEmailsForMatching,
  resolveEmailImportSearch,
  resolveMessageId,
} from "../lib/space-place/email-import-helpers";
import { normalizeEmailAddress } from "../lib/space-place/crm-email";

// --- Search / historical import defaults ---
const resolved = resolveEmailImportSearch();
assert.equal(resolved.daysBack, 90);
assert.equal(DEFAULT_EMAIL_IMPORT_LOOKBACK_DAYS, 90);
assert.equal(resolved.folder, "INBOX");
assert.equal(DEFAULT_EMAIL_IMPORT_FOLDER, "INBOX");
assert.equal(resolved.unreadOnly, false);
assert.ok("since" in resolved.searchQuery);
assert.equal(
  "seen" in resolved.searchQuery,
  false,
  "default search must include read messages, not UNSEEN-only"
);

const unreadResolved = resolveEmailImportSearch({ unreadOnly: true, daysBack: 14 });
assert.equal(unreadResolved.unreadOnly, true);
assert.ok("seen" in unreadResolved.searchQuery);
assert.ok("since" in unreadResolved.searchQuery);

const customFolder = resolveEmailImportSearch({ folder: "Archive" });
assert.equal(customFolder.folder, "Archive");
assert.notEqual(customFolder.folder, "Sent");

// First historical import uses lookback, not ALL
const server = readFileSync("lib/space-place/email-import-server.ts", "utf8");
assert.match(server, /client\.search\(resolved\.searchQuery/);
assert.match(server, /chunkUids/);
assert.doesNotMatch(server, /for await \(const msg of client\.fetch\(query/);
assert.match(server, /messageFlagsAdd\(processedUids/);
assert.match(server, /imap_uid/);
assert.match(server, /message_id/);

// Nested STORE inside fetch must not exist
assert.doesNotMatch(
  server,
  /for await \(.*fetch[\s\S]{0,400}messageFlagsAdd/
);

// --- Pagination / batches ---
assert.equal(DEFAULT_EMAIL_IMPORT_BATCH_SIZE, 50);
const uids = Array.from({ length: 120 }, (_, i) => i + 1);
const batches = chunkUids(uids, 50);
assert.equal(batches.length, 3);
assert.equal(batches[0]!.length, 50);
assert.equal(batches[1]!.length, 50);
assert.equal(batches[2]!.length, 20);
assert.deepEqual(
  chunkUids([1, 2, 3], 50),
  [[1, 2, 3]],
  "fewer than one batch still processed"
);

// --- Dedup ids ---
assert.equal(
  resolveMessageId({ messageId: "<abc@x>" }, "fallback"),
  "<abc@x>"
);
assert.equal(resolveMessageId({ messageId: "  " }, "fallback"), "fallback");
assert.match(
  imapUidFallbackMessageId(42, "imap.example.com", "INBOX"),
  /imap-uid:42@imap\.example\.com\/INBOX/
);

// --- Malformed message isolation via counts ---
let counts = emptyEmailImportCounts();
counts = applyImportOutcome(counts, { status: "imported", linked: true });
counts = applyImportOutcome(counts, { status: "failed" });
counts = applyImportOutcome(counts, { status: "imported", linked: false });
counts = applyImportOutcome(counts, { status: "duplicate" });
assert.equal(counts.scanned, 4);
assert.equal(counts.imported, 2);
assert.equal(counts.matched, 1);
assert.equal(counts.unmatched, 1);
assert.equal(counts.duplicatesSkipped, 1);
assert.equal(counts.failed, 1);

// --- Contact matching ---
const contacts = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "o1",
    email: "Roger.Benn@Stellenbosch.org.za",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    organisation_id: "o2",
    email: "other@example.com",
  },
];

assert.equal(
  normalizeEmailAddress("Roger.Benn@Stellenbosch.org.za"),
  "roger.benn@stellenbosch.org.za"
);

const exact = matchContactsByEmails(contacts, [
  "roger.benn@stellenbosch.org.za",
]);
assert.equal(exact.status, "matched");
if (exact.status === "matched") {
  assert.equal(exact.contact.id, "11111111-1111-4111-8111-111111111111");
}

const unknown = matchContactsByEmails(contacts, ["nobody@example.com"]);
assert.equal(unknown.status, "unmatched");

const multi = matchContactsByEmails(
  [
    ...contacts,
    {
      id: "33333333-3333-4333-8333-333333333333",
      organisation_id: "o3",
      email: "roger.benn@stellenbosch.org.za",
    },
  ],
  ["roger.benn@stellenbosch.org.za"]
);
assert.equal(multi.status, "review_required");

function addr(address: string) {
  return { value: [{ address }] };
}

const capture = "crm@findmyspace.co.za";
const recipients = recipientEmailsForMatching(
  {
    to: addr("roger.benn@stellenbosch.org.za"),
    cc: {
      value: [
        { address: "crm@findmyspace.co.za" },
        { address: "CRM@FindMySpace.co.za" },
      ],
    },
  } as Parameters<typeof recipientEmailsForMatching>[0],
  capture
);
// to has roger; cc only has capture variants → only roger remains
assert.deepEqual(recipients, ["roger.benn@stellenbosch.org.za"]);

const fromParsed = matchContactFromParsed(
  contacts,
  {
    subject: "Hello",
    to: addr("ROGER.BENN@stellenbosch.org.za"),
    cc: undefined,
  } as Parameters<typeof matchContactFromParsed>[1],
  capture
);
assert.equal(fromParsed.status, "matched");

const subjectMatch = matchContactFromParsed(
  contacts,
  {
    subject: "[CRM:22222222-2222-4222-8222-222222222222] FindMySpace",
    to: addr("unknown@x.com"),
    cc: undefined,
  } as Parameters<typeof matchContactFromParsed>[1],
  capture
);
assert.equal(subjectMatch.status, "matched");
if (subjectMatch.status === "matched") {
  assert.equal(subjectMatch.contact.id, "22222222-2222-4222-8222-222222222222");
}

// --- UI / API wiring ---
const route = readFileSync("app/api/space-place/email-import/route.ts", "utf8");
assert.match(route, /DEFAULT_EMAIL_IMPORT_LOOKBACK_DAYS/);
assert.match(route, /lastSuccessfulImportAt/);
assert.match(route, /maxDuration = 300/);

const comm = readFileSync("app/admin/crm/communication/page.tsx", "utf8");
assert.match(comm, /defaultDaysBack \?\? 90/);
assert.match(comm, /unreadOnly: false/);
assert.match(comm, /Last successful import/);
assert.match(comm, /Duplicates skipped/);

const migration = readFileSync(
  "supabase/migrations/059_20260708_crm_email_import_runs.sql",
  "utf8"
);
assert.match(migration, /crm_email_import_runs/);
assert.match(migration, /imap_uid/);
assert.match(migration, /crm_email_messages_imap_uid_uidx/);

// Only configured folder (INBOX by default) — no loop over all folders
assert.doesNotMatch(server, /listMailboxes|getBoxes|for \(.*folder/);
assert.match(server, /getMailboxLock\(resolved\.folder\)/);

console.log("test-crm-email-import: all assertions passed");
