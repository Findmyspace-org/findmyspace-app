#!/usr/bin/env node
/**
 * Pipeline drawer fetch-loop regression tests.
 * Run: npm run test:crm-pipeline-drawer-fetch-loop
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const drawerSource = readFileSync(
  "app/components/crm-desktop/CrmPipelineCardDrawer.tsx",
  "utf8"
);
const boardSource = readFileSync(
  "app/components/crm-desktop/CrmPipelineBoard.tsx",
  "utf8"
);
const listingsSource = readFileSync(
  "app/space-place/components/CrmMarketplaceListingsSection.tsx",
  "utf8"
);
const detailSource = readFileSync(
  "lib/crm-desktop/organisation-drawer-detail.ts",
  "utf8"
);
const marketplaceSource = readFileSync(
  "lib/crm-desktop/organisation-drawer-marketplace.ts",
  "utf8"
);

assert.match(drawerSource, /const organisationId = row\?\.id/);
assert.match(drawerSource, /loadOrganisationDrawerDetail/);
assert.match(drawerSource, /\[organisationId, applyDetail\]/);
assert.match(drawerSource, /\[open, organisationId, loadDetail\]/);
assert.match(drawerSource, /initialLoading/);
assert.match(drawerSource, /refreshing/);
assert.match(drawerSource, /abortRef/);
assert.match(drawerSource, /requestIdRef/);
assert.match(drawerSource, /inflightRef/);
assert.match(drawerSource, /data=\{marketplaceData\}/);
assert.doesNotMatch(drawerSource, /onCountsChange=\{/);
assert.doesNotMatch(drawerSource, /loadDetail = useCallback\([\s\S]*\[row\]/);
assert.doesNotMatch(drawerSource, /useEffect\([\s\S]*\[row, loadDetail\]/);

assert.match(boardSource, /handleDrawerRowPatched/);
assert.match(boardSource, /onRowPatched=\{handleDrawerRowPatched\}/);
assert.doesNotMatch(boardSource, /onRowPatched=\{\(patched\) =>/);

assert.match(listingsSource, /data\?: MarketplaceListingsData/);
assert.match(listingsSource, /const controlled = Boolean\(data\)/);
assert.match(listingsSource, /if \(controlled\) return/);
assert.match(listingsSource, /marketplaceCountsEqual/);
assert.match(listingsSource, /\[controlled, entityId, mode, load\]/);

assert.match(detailSource, /fetchOrganisationDrawerMarketplace/);
assert.match(detailSource, /fetchMarketingSummary/);
assert.match(marketplaceSource, /fetchOrganisationDrawerMarketplace/);
assert.match(marketplaceSource, /export function marketplaceCountsEqual/);
assert.match(marketplaceSource, /export async function reloadOrganisationDrawerMarketplace/);

function marketplaceCountsEqual(
  a: {
    linkedPropertyCount: number;
    linkedSpaceCount: number;
    hasLinkedProperties: boolean;
    hasLinkedSpaces: boolean;
  },
  b: {
    linkedPropertyCount: number;
    linkedSpaceCount: number;
    hasLinkedProperties: boolean;
    hasLinkedSpaces: boolean;
  }
): boolean {
  return (
    a.linkedPropertyCount === b.linkedPropertyCount &&
    a.linkedSpaceCount === b.linkedSpaceCount &&
    a.hasLinkedProperties === b.hasLinkedProperties &&
    a.hasLinkedSpaces === b.hasLinkedSpaces
  );
}

assert.equal(
  marketplaceCountsEqual(
    {
      linkedPropertyCount: 1,
      linkedSpaceCount: 2,
      hasLinkedProperties: true,
      hasLinkedSpaces: true,
    },
    {
      linkedPropertyCount: 1,
      linkedSpaceCount: 2,
      hasLinkedProperties: true,
      hasLinkedSpaces: true,
    }
  ),
  true
);
assert.equal(
  marketplaceCountsEqual(
    {
      linkedPropertyCount: 1,
      linkedSpaceCount: 2,
      hasLinkedProperties: true,
      hasLinkedSpaces: true,
    },
    {
      linkedPropertyCount: 2,
      linkedSpaceCount: 2,
      hasLinkedProperties: true,
      hasLinkedSpaces: true,
    }
  ),
  false
);

console.log("test-crm-pipeline-drawer-fetch-loop: all assertions passed");
