#!/usr/bin/env node
/**
 * CRM organisation property link tests.
 * Run: npm run test:crm-organisation-property-link
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveOrganisationMarketplaceWarnings } from "../lib/crm-desktop/organisation-marketplace-warnings.js";
import { buildOrganisationQualityIndicators } from "../lib/crm-desktop/organisation-contact-status.js";
import type { CrmOrganisationListRow } from "../lib/crm-desktop/types.js";

const linkLib = readFileSync(
  "lib/crm-desktop/organisation-property-link.ts",
  "utf8"
);
const countsLib = readFileSync(
  "lib/crm-desktop/organisation-marketplace-counts.ts",
  "utf8"
);
const panelSource = readFileSync(
  "app/components/crm-desktop/LinkPropertyPanel.tsx",
  "utf8"
);
const sectionSource = readFileSync(
  "app/space-place/components/CrmMarketplaceListingsSection.tsx",
  "utf8"
);
const drawerSource = readFileSync(
  "app/components/crm-desktop/CrmPipelineCardDrawer.tsx",
  "utf8"
);

assert.match(linkLib, /crm_organisation_id/);
assert.match(linkLib, /Property linked/);
assert.match(linkLib, /Property unlinked/);
assert.match(linkLib, /Property reassigned/);
assert.match(linkLib, /\.update\(\{ crm_organisation_id/);
assert.doesNotMatch(linkLib, /owner_id:/);

assert.match(countsLib, /property_id/);
assert.match(countsLib, /linkedSpaceCount/);

assert.match(panelSource, /Link existing property/);
assert.match(panelSource, /CrmDesktopDrawer/);
assert.match(panelSource, /overlayZIndexClass=\{stackAboveDrawer \? "z-\[70\]"/);
assert.match(panelSource, /Reassign property/);
assert.match(sectionSource, /Link existing property/);
assert.match(sectionSource, /Unlink/);
assert.match(sectionSource, /Property linked, but no spaces added yet/);
assert.match(sectionSource, /No marketplace properties linked yet/);
assert.match(drawerSource, /stackAboveDrawer/);
assert.match(drawerSource, /patchOrganisationRowMarketplaceCounts/);

assert.deepEqual(resolveOrganisationMarketplaceWarnings({
  linkedPropertyCount: 0,
  linkedSpaceCount: 0,
}), [{ key: "no_properties", label: "No properties linked" }]);

assert.deepEqual(resolveOrganisationMarketplaceWarnings({
  linkedPropertyCount: 1,
  linkedSpaceCount: 0,
}), [{ key: "no_spaces", label: "No spaces" }]);

assert.deepEqual(resolveOrganisationMarketplaceWarnings({
  linkedPropertyCount: 1,
  linkedSpaceCount: 2,
}), []);

const row = {
  contact_count: 1,
  primary_contact_id: "c1",
  primary_contact_name: "Primary",
  primary_contact_role: null,
  primary_contact_email: null,
  primary_contact_phone: null,
  next_task_title: "Task",
  next_action_title: "Task",
  next_task_due: "2026-07-10",
  next_action_date: "2026-07-10",
  next_action_date_group: "future",
  property_count: 0,
  space_count: 0,
  last_interaction_at: "2026-07-01",
} as CrmOrganisationListRow;

assert.ok(
  buildOrganisationQualityIndicators(row).some(
    (item) => item.key === "no_properties"
  )
);

const withPropertyNoSpaces = {
  ...row,
  property_count: 1,
  space_count: 0,
} as CrmOrganisationListRow;
assert.ok(
  buildOrganisationQualityIndicators(withPropertyNoSpaces).some(
    (item) => item.key === "no_spaces"
  )
);

const withSpaces = {
  ...row,
  property_count: 1,
  space_count: 2,
} as CrmOrganisationListRow;
assert.equal(
  buildOrganisationQualityIndicators(withSpaces).some(
    (item) => item.key === "no_spaces" || item.key === "no_properties"
  ),
  false
);

console.log("test-crm-organisation-property-link: all assertions passed");
