#!/usr/bin/env node
/**
 * CRM completed actions unit/source tests.
 * Run: npm run test:crm-completed-actions
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPLETED_ACTIONS_HELPER_TEXT,
  formatCompletedActionTimelineSummary,
  getStandardCompletedAction,
  isFutureCompletedAt,
  quickStandardActionsForScope,
  sanitizeCompletedActionLabel,
  STANDARD_COMPLETED_ACTIONS,
  subjectScope,
} from "../lib/crm-desktop/completed-actions";

const migration = readFileSync(
  "supabase/migrations/058_20260708_crm_completed_actions.sql",
  "utf8"
);
assert.match(migration, /crm_completed_actions/);
assert.match(migration, /crm_completed_action_audits/);
assert.match(migration, /crm_completed_actions_std_org_uidx/);
assert.match(migration, /crm_completed_actions_std_property_uidx/);
assert.match(migration, /crm_completed_actions_std_space_uidx/);

assert.ok(getStandardCompletedAction("initial_email_sent"));
assert.equal(
  getStandardCompletedAction("initial_email_sent")?.label,
  "Initial email sent"
);
assert.equal(getStandardCompletedAction("nope"), null);

assert.ok(STANDARD_COMPLETED_ACTIONS.some((a) => a.scope === "organisation"));
assert.ok(STANDARD_COMPLETED_ACTIONS.some((a) => a.scope === "property"));
assert.ok(STANDARD_COMPLETED_ACTIONS.some((a) => a.scope === "space"));

assert.ok(quickStandardActionsForScope("space").some((a) => a.key === "space_shared"));
assert.ok(
  quickStandardActionsForScope("property").some(
    (a) => a.key === "unclaimed_property_created"
  )
);

assert.equal(sanitizeCompletedActionLabel("  Met   bursar  "), "Met bursar");
assert.ok(sanitizeCompletedActionLabel("x".repeat(500)).length <= 200);

assert.equal(isFutureCompletedAt(new Date().toISOString()), false);
assert.equal(
  isFutureCompletedAt(new Date(Date.now() + 60 * 60_000).toISOString()),
  true
);
assert.equal(
  isFutureCompletedAt(new Date(Date.now() - 86400_000).toISOString()),
  false
);

assert.equal(
  subjectScope({ organisationId: "o1" }),
  "organisation"
);
assert.equal(
  subjectScope({ organisationId: "o1", propertyId: "p1" }),
  "property"
);
assert.equal(
  subjectScope({ organisationId: "o1", propertyId: "p1", spaceId: "s1" }),
  "space"
);

assert.match(
  formatCompletedActionTimelineSummary({
    actorName: "Schalk",
    actionLabel: "Initial email sent",
  }),
  /Schalk marked 'Initial email sent' as completed/
);

assert.match(COMPLETED_ACTIONS_HELPER_TEXT, /optional/i);
assert.match(COMPLETED_ACTIONS_HELPER_TEXT, /do not form a required workflow/i);

const panel = readFileSync(
  "app/components/crm-desktop/CrmCompletedActionsPanel.tsx",
  "utf8"
);
assert.match(panel, /Mark as done/);
assert.match(panel, /Recorded/);
assert.match(panel, /Completed on/);
assert.doesNotMatch(panel, /progress/i);
assert.doesNotMatch(panel, /Incomplete/);
assert.doesNotMatch(panel, /\d+ of \d+ completed/i);
assert.doesNotMatch(panel, /checklist/i);

const orgPage = readFileSync(
  "app/admin/crm/organisations/[id]/page.tsx",
  "utf8"
);
assert.match(orgPage, /"completed"/);
assert.match(orgPage, /Completed actions/);
assert.match(orgPage, /CrmCompletedActionsPanel/);
assert.match(orgPage, /CrmCompletedActionsSummaryCard/);

const drawer = readFileSync(
  "app/components/crm-desktop/CrmPipelineCardDrawer.tsx",
  "utf8"
);
assert.match(drawer, /CrmCompletedActionsPanel/);

const mutations = readFileSync(
  "lib/crm-desktop/completed-actions-mutations.ts",
  "utf8"
);
assert.match(mutations, /createTimelineEngagement/);
assert.match(mutations, /Completed date cannot be in the future/);
assert.match(mutations, /23505/);
assert.match(mutations, /completed_action_removed/);
assert.match(mutations, /standard_action_marked_done/);

const route = readFileSync(
  "app/api/admin/crm/desktop/completed-actions/route.ts",
  "utf8"
);
assert.match(route, /requireCrmDesktopApi/);
assert.match(route, /createCompletedAction/);

const propertiesPage = readFileSync("app/admin/properties/page.tsx", "utf8");
assert.match(propertiesPage, /CrmCompletedActionsQuickMenu/);
assert.match(propertiesPage, /View completed actions/);

const spacesPage = readFileSync("app/admin/crm/spaces/page.tsx", "utf8");
assert.match(spacesPage, /View completed actions/);
assert.match(spacesPage, /Add completed action/);

const applyScript = readFileSync("scripts/apply-migration-058.mjs", "utf8");
assert.match(applyScript, /058/);
assert.match(applyScript, /crm_completed_actions/);

console.log("test-crm-completed-actions: all assertions passed");
