#!/usr/bin/env node
/**
 * Permission checks for marketing API routes (no marketing data before auth).
 * Run: node --env-file=.env.local scripts/test-crm-marketing-permissions.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) throw new Error(".env.local not found");
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

const env = loadEnvLocal();
const baseUrl = (process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const ROUTES = [
  "/api/admin/crm/marketing/overview",
  "/api/admin/crm/marketing/contacts",
  "/api/admin/crm/marketing/lists",
  "/api/admin/crm/marketing/templates",
  "/api/admin/crm/marketing/campaigns",
  "/api/admin/crm/marketing/preview",
  "/api/admin/crm/desktop/pipeline/close-lost",
];

async function expectDenied(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  assert.ok(
    res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405,
    `${path} should be denied without auth, got ${res.status}`
  );
  const body = await res.json().catch(() => ({}));
  assert.ok(!body.contacts?.length, `${path} must not return marketing contacts before auth`);
  assert.ok(!body.rows?.length, `${path} must not return marketing rows before auth`);
  assert.ok(!body.lists?.length, `${path} must not return marketing lists before auth`);
  assert.ok(!body.stats, `${path} must not return marketing stats before auth`);
}

async function main() {
  for (const route of ROUTES) {
    await expectDenied(route);
    await expectDenied(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organisationId: "00000000-0000-0000-0000-000000000000" }),
    });
  }
  console.log("test-crm-marketing-permissions: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
