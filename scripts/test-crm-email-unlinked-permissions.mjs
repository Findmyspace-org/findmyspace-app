#!/usr/bin/env node
/**
 * Unauthenticated access denied for unlinked email list + link PATCH APIs.
 * Run: npm run test:crm-email-unlinked-permissions
 */

import assert from "node:assert/strict";

const baseUrl = (process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

async function expectDenied(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  assert.ok(
    res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405,
    `${path} should be denied without auth, got ${res.status}`
  );
  const body = await res.json().catch(() => ({}));
  assert.ok(!body.rows?.length, `${path} must not return rows before auth`);
  assert.ok(!body.email, `${path} must not return email before auth`);
  assert.ok(!body.detail, `${path} must not return detail before auth`);
}

async function main() {
  await expectDenied(`/api/space-place/email-messages?unlinked=1`);
  await expectDenied(`/api/space-place/email-messages/${FAKE_ID}`);
  await expectDenied(`/api/space-place/email-messages/${FAKE_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "link", contactId: FAKE_ID }),
  });
  await expectDenied(`/api/space-place/email-messages/${FAKE_ID}/link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contactId: FAKE_ID }),
  });
  console.log("test-crm-email-unlinked-permissions: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
