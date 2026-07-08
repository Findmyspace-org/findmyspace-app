#!/usr/bin/env node
/**
 * Permission checks for completed-actions API (no data before auth).
 * Run: node --env-file=.env.local scripts/test-crm-completed-actions-permissions.mjs
 */

import assert from "node:assert/strict";

const baseUrl = (process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);

const ROUTES = [
  "/api/admin/crm/desktop/completed-actions",
  "/api/admin/crm/desktop/completed-actions/state?organisationId=00000000-0000-0000-0000-000000000000",
];

async function expectDenied(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  assert.ok(
    res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405,
    `${path} should be denied without auth, got ${res.status}`
  );
  const body = await res.json().catch(() => ({}));
  assert.ok(!body.rows?.length, `${path} must not return rows before auth`);
  assert.ok(!body.state, `${path} must not return state before auth`);
}

async function main() {
  for (const route of ROUTES) {
    await expectDenied(route);
    await expectDenied(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organisationId: "00000000-0000-0000-0000-000000000000",
        actionKey: "initial_email_sent",
      }),
    });
  }
  console.log("test-crm-completed-actions-permissions: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
