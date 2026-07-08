#!/usr/bin/env node
/**
 * CRM email detail view + sanitize tests.
 * Run: npm run test:crm-email-detail
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CRM_EMAIL_MISSING_BODY_MESSAGE,
  crmEmailBodyKind,
  hasUnsafeEmailHtml,
  sanitizeCrmEmailHtml,
} from "../lib/space-place/crm-email-sanitize";

// --- Body kind ---
assert.equal(crmEmailBodyKind("<p>Hi</p>", "Hi"), "html");
assert.equal(crmEmailBodyKind(null, "Hi there"), "text");
assert.equal(crmEmailBodyKind("  ", "  "), "empty");
assert.equal(crmEmailBodyKind(null, null), "empty");

// --- Sanitise: strip script / iframe / events / javascript ---
const dirty = `
  <p>Hello <a href="https://example.com">link</a></p>
  <script>alert(1)</script>
  <iframe src="https://evil.test"></iframe>
  <img src="https://tracker.example/pixel.gif" onerror="alert(1)" />
  <a href="javascript:alert(1)">bad</a>
  <form action="/x"><input name="x" /></form>
`;
const clean = sanitizeCrmEmailHtml(dirty);
assert.doesNotMatch(clean, /<script/i);
assert.doesNotMatch(clean, /<iframe/i);
assert.doesNotMatch(clean, /onerror/i);
assert.doesNotMatch(clean, /javascript:/i);
assert.doesNotMatch(clean, /<form/i);
assert.doesNotMatch(clean, /<input/i);
assert.match(clean, /Hello/);
assert.match(clean, /https:\/\/example\.com/);
// Remote images blocked by default
assert.doesNotMatch(clean, /tracker\.example/);
assert.match(clean, /data-blocked-remote-image/);

assert.equal(hasUnsafeEmailHtml("<script>x</script>"), true);
assert.equal(hasUnsafeEmailHtml("<p>safe</p>"), false);

assert.match(CRM_EMAIL_MISSING_BODY_MESSAGE, /No message content/);

// Allow opt-in remote images for explicit cases
const withImages = sanitizeCrmEmailHtml(
  '<img src="https://cdn.example/a.png" alt="x" />',
  { blockExternalImages: false }
);
assert.match(withImages, /cdn\.example\/a\.png/);

// --- UI wiring ---
const list = readFileSync("app/space-place/components/CrmEmailList.tsx", "utf8");
assert.match(list, /Open email/);
assert.match(list, /aria-label=\{`Open email/);
assert.match(list, /role="button"/);
assert.match(list, /onKeyDown/);
assert.match(list, /CrmEmailDetailDrawer/);
assert.match(list, /cursor-pointer/);
assert.match(list, /e\.stopPropagation\(\)/);

const drawer = readFileSync(
  "app/components/crm-desktop/CrmEmailDetailDrawer.tsx",
  "utf8"
);
assert.match(drawer, /sanitizeCrmEmailHtml/);
assert.match(drawer, /dangerouslySetInnerHTML/);
assert.match(drawer, /body_text/);
assert.match(drawer, /CRM_EMAIL_MISSING_BODY_MESSAGE/);
assert.match(drawer, /Close/);
assert.match(drawer, /break-words|break-all/);
assert.match(drawer, /max-w-full/);

const route = readFileSync(
  "app/api/space-place/email-messages/[id]/route.ts",
  "utf8"
);
assert.match(route, /requireCrmEmailManagerApi/);
assert.match(route, /fetchCrmEmailDetail/);
assert.doesNotMatch(route, /CRM_EMAIL_PASSWORD/);
assert.doesNotMatch(route, /mime_source|raw_mime|rawMime/);
assert.doesNotMatch(route, /password/i);

const detail = readFileSync("lib/space-place/crm-email-detail.ts", "utf8");
assert.match(detail, /body_html_safe/);
assert.match(detail, /sanitizeCrmEmailHtml/);
assert.doesNotMatch(detail, /mailbox_host|imap_uid/);

// Importer still stores bodies — display-only path
const importer = readFileSync("lib/space-place/email-import-server.ts", "utf8");
assert.match(importer, /body_text: parsed\.text/);
assert.match(importer, /body_html:/);

const orgPage = readFileSync(
  "app/admin/crm/organisations/[id]/page.tsx",
  "utf8"
);
assert.match(orgPage, /CrmEmailList emails=\{emails\} adminLinks/);

const contactPage = readFileSync(
  "app/admin/crm/contacts/[id]/page.tsx",
  "utf8"
);
assert.match(contactPage, /CrmEmailList emails=\{emails\} adminLinks/);

const commPage = readFileSync("app/admin/crm/communication/page.tsx", "utf8");
assert.match(commPage, /CrmEmailList emails=\{emails\} adminLinks/);
assert.match(commPage, /href="\/admin\/crm\/communication\/unlinked"/);
assert.doesNotMatch(commPage, /href="\/space-place\/email-inbox"/);

// No attachment UI added
assert.doesNotMatch(drawer, /attachment/i);
assert.doesNotMatch(list, /attachment/i);

console.log("test-crm-email-detail: all assertions passed");
