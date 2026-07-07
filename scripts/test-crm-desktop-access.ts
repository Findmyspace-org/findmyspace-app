#!/usr/bin/env node
/**
 * CRM desktop access tests (no DB required).
 * Run: npm run test:crm-desktop-access
 */

import assert from "node:assert/strict";
import { canAccessCrmDesktop } from "../lib/crm-desktop/access";
import {
  evaluateCrmApiAccess,
  evaluateCrmDesktopApiAccess,
  simulateDesktopOverviewRoute,
} from "../lib/crm-desktop/desktop-api-gate";

function assertAccess(
  label: string,
  crmRole: string | null,
  platformRole: string | null,
  expected: boolean
) {
  const actual = canAccessCrmDesktop({ crmRole, platformRole });
  assert.equal(actual, expected, `${label}: expected ${expected}, got ${actual}`);
}

assertAccess("CRM admin", "admin", null, true);
assertAccess("CRM admin with user platform role", "admin", "user", true);
assertAccess("Platform admin", null, "admin", true);
assertAccess("Platform super_admin", null, "super_admin", true);
assertAccess("Office manager", "office_manager", null, false);
assertAccess("Spacer", "spacer", null, false);
assertAccess("Ordinary user", null, "user", false);
assertAccess("Inactive CRM admin still has admin role", "admin", "user", true);

const crmAdminAuth = evaluateCrmApiAccess({
  kind: "authenticated",
  crmRole: "admin",
  platformRole: "user",
  crmActive: true,
});
assert.equal(crmAdminAuth.ok, true);
if (crmAdminAuth.ok) {
  assert.equal(
    evaluateCrmDesktopApiAccess(crmAdminAuth, "user").ok,
    true,
    "CRM admin desktop"
  );
}

const platformAdminBootstrap = evaluateCrmApiAccess({
  kind: "authenticated",
  crmRole: null,
  platformRole: "admin",
  crmActive: false,
});
assert.equal(platformAdminBootstrap.ok, true);
if (platformAdminBootstrap.ok) {
  assert.equal(platformAdminBootstrap.crmRole, "admin");
  assert.equal(
    evaluateCrmDesktopApiAccess(platformAdminBootstrap, "admin").ok,
    true,
    "platform admin bootstrap"
  );
}

const superAdminBootstrap = evaluateCrmApiAccess({
  kind: "authenticated",
  crmRole: null,
  platformRole: "super_admin",
  crmActive: false,
});
assert.equal(superAdminBootstrap.ok, true);
if (superAdminBootstrap.ok) {
  assert.equal(superAdminBootstrap.crmRole, "admin");
  assert.equal(
    evaluateCrmDesktopApiAccess(superAdminBootstrap, "super_admin").ok,
    true,
    "super_admin bootstrap"
  );
}

const spacerAuth = evaluateCrmApiAccess({
  kind: "authenticated",
  crmRole: "spacer",
  platformRole: "user",
  crmActive: true,
});
assert.equal(spacerAuth.ok, true, "spacer mobile CRM allowed");
if (spacerAuth.ok) {
  assert.equal(
    evaluateCrmDesktopApiAccess(spacerAuth, "user").ok,
    false,
    "spacer desktop denied"
  );
}

const officeManagerAuth = evaluateCrmApiAccess({
  kind: "authenticated",
  crmRole: "office_manager",
  platformRole: "user",
  crmActive: true,
});
assert.equal(officeManagerAuth.ok, true, "office manager mobile CRM allowed");
if (officeManagerAuth.ok) {
  assert.equal(
    evaluateCrmDesktopApiAccess(officeManagerAuth, "user").ok,
    false,
    "office manager desktop denied"
  );
}

const unauthenticated = evaluateCrmApiAccess({ kind: "unauthenticated" });
assert.equal(unauthenticated.ok, false);
if (!unauthenticated.ok) {
  assert.equal(unauthenticated.status, 401);
}

const noCrmProfile = evaluateCrmApiAccess({
  kind: "authenticated",
  crmRole: null,
  platformRole: "user",
  crmActive: false,
});
assert.equal(noCrmProfile.ok, false);
if (!noCrmProfile.ok) {
  assert.equal(noCrmProfile.status, 403);
}

const inactiveSpacer = evaluateCrmApiAccess({
  kind: "authenticated",
  crmRole: "spacer",
  platformRole: "user",
  crmActive: false,
});
assert.equal(inactiveSpacer.ok, false, "inactive spacer denied");

let statsCalls = 0;

async function run() {
  const deniedOverview = await simulateDesktopOverviewRoute({
  authState: {
    kind: "authenticated",
    crmRole: "spacer",
    platformRole: "user",
    crmActive: true,
  },
  fetchStats: async () => {
    statsCalls += 1;
  },
});
assert.equal(deniedOverview.statsLoaded, false);
assert.equal(statsCalls, 0, "no service query before desktop auth");

const allowedOverview = await simulateDesktopOverviewRoute({
  authState: {
    kind: "authenticated",
    crmRole: "admin",
    platformRole: "user",
    crmActive: true,
  },
  fetchStats: async () => {
    statsCalls += 1;
  },
});
assert.equal(allowedOverview.statsLoaded, true);
assert.equal(statsCalls, 1);

  console.log("test-crm-desktop-access: all passed");
}

void run();
