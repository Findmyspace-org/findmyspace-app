#!/usr/bin/env node
/**
 * Pipeline card drawer Add contact wiring tests.
 * Run: npm run test:crm-pipeline-drawer-add-contact
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const drawerSource = readFileSync(
  "app/components/crm-desktop/CrmPipelineCardDrawer.tsx",
  "utf8"
);
const panelSource = readFileSync(
  "app/space-place/components/CreateContactPanel.tsx",
  "utf8"
);
const slideOverSource = readFileSync(
  "app/space-place/components/EditSlideOver.tsx",
  "utf8"
);
const boardSource = readFileSync(
  "app/components/crm-desktop/CrmPipelineBoard.tsx",
  "utf8"
);

assert.ok(drawerSource.includes("handleOpenCreateContact"));
assert.ok(
  /onClick=\{[\s\S]*handleOpenCreateContact/.test(drawerSource)
);
assert.match(drawerSource, /CreateContactPanel/);
assert.match(drawerSource, /stackAboveDrawer/);
assert.match(drawerSource, /lockOrganisation/);
assert.match(drawerSource, /offerSetAsPrimary/);
assert.match(drawerSource, /defaultOrganisationId=\{row\.id\}/);
assert.match(drawerSource, /handleContactCreated/);
assert.match(drawerSource, /setCrmOrganisationPrimaryContact/);
assert.match(drawerSource, /patchOrganisationRowPrimaryContact/);
assert.match(drawerSource, /onRowPatched/);
assert.match(drawerSource, /type="button"/);

assert.match(panelSource, /stackAboveDrawer/);
assert.match(panelSource, /lockOrganisation/);
assert.match(panelSource, /overlayZIndexClass=\{stackAboveDrawer \? "z-\[70\]" : "z-50"\}/);

assert.match(slideOverSource, /overlayZIndexClass/);

assert.match(boardSource, /onRowPatched=\{/);

console.log("test-crm-pipeline-drawer-add-contact: all assertions passed");
