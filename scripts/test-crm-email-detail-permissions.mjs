#!/usr/bin/env node
/**
 * Unauthenticated access denied for email detail API.
 * Run: node --env-file=.env.local scripts/test-crm-email-detail-permissions.mjs
 */

import assert from "node:assert/strict";

const baseUrl = (process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);

async function main() {
  const res = await fetch(
    `${baseUrl}/api/space-place/email-messages/00000000-0000-0000-0000-000000000000`
  );
  assert.ok(
    res.status === 401 || res.status === 403 || res.status === 404,
    `expected denied, got ${res.status}`
  );
  const body = await res.json().catch(() => ({}));
  assert.ok(!body.email, "must not return email body before auth");
  console.log("test-crm-email-detail-permissions: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
