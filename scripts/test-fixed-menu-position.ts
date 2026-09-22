#!/usr/bin/env node
/**
 * Fixed-position row Actions menu — clipping / flip math.
 * Run: npm run test:fixed-menu-position
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import {
  computeFixedMenuPosition,
  estimateMenuHeight,
} from "../lib/fixed-menu-position";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";

const USER = "5860f254-26e9-4f7f-8760-3fd69bd9fff3";
const ORG = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const PROP = "prop-pgh";
const CLASSROOM_1 = "cd1ebdff-0259-4185-8a0c-ac2892f03778";
const CLASSROOM_2 = "2add6853-3b32-450e-a4ba-42c0b6e5f47f";

function grant(
  partial: Partial<OrganisationAccessGrant> &
    Pick<OrganisationAccessGrant, "role" | "status">
): OrganisationAccessGrant {
  return {
    organisationId: partial.organisationId ?? ORG,
    role: partial.role,
    propertyId: partial.propertyId ?? null,
    spaceId: partial.spaceId ?? null,
    status: partial.status,
  };
}

const smGrant = grant({
  role: "space_manager",
  status: "active",
  propertyId: PROP,
  spaceId: CLASSROOM_1,
});

function accessCtx(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: USER,
    spaceId: CLASSROOM_1,
    propertyId: PROP,
    organisationId: ORG,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "user",
    adminAccessDisabled: false,
    grants: [smGrant],
    ...overrides,
  };
}

const menuSrc = readFileSync(
  "app/components/admin/AdminRowActionsMenu.tsx",
  "utf8"
);
const tableSrc = readFileSync(
  "app/components/owner/OwnerSpacesTable.tsx",
  "utf8"
);
const listingsSrc = readFileSync("app/dashboard/listings/page.tsx", "utf8");

// A. Opens below when there is room (single-row table)
{
  const placed = computeFixedMenuPosition({
    button: { top: 80, right: 900, bottom: 112 },
    menu: { width: 176, height: 160 },
    viewport: { width: 1024, height: 800 },
  });
  assert.equal(placed.openUpward, false);
  assert.equal(placed.top, 116);
  assert.equal(placed.left, 724);
}

// B. Last row: insufficient room below → open upward
{
  const placed = computeFixedMenuPosition({
    button: { top: 740, right: 900, bottom: 772 },
    menu: { width: 176, height: 160 },
    viewport: { width: 1024, height: 800 },
  });
  assert.equal(placed.openUpward, true);
  assert.ok(placed.top + 160 <= 740);
  assert.ok(placed.top >= 8);
}

// C. Menu is not placed behind / off the right edge
{
  const placed = computeFixedMenuPosition({
    button: { top: 80, right: 1020, bottom: 112 },
    menu: { width: 176, height: 120 },
    viewport: { width: 1024, height: 800 },
  });
  assert.ok(placed.left + 176 <= 1024 - 8);
}

// D. Shared menu still exposes existing action rendering
{
  assert.match(menuSrc, /createPortal/);
  assert.match(menuSrc, /position: "fixed"/);
  assert.match(menuSrc, /computeFixedMenuPosition/);
  assert.match(menuSrc, /action\.href/);
  assert.match(menuSrc, /action\.onClick/);
  assert.doesNotMatch(menuSrc, /absolute right-0 z-30 mt-1/);
  assert.match(tableSrc, /overflow-x-auto/);
  assert.match(tableSrc, /AdminRowActionsMenu/);
  assert.match(tableSrc, /label: "View details"/);
  assert.match(tableSrc, /label: "Edit space"/);
  assert.match(tableSrc, /href: `\/spaces\/\$\{space\.id\}\/edit`/);
}

// E. Space Manager still sees Classroom #1 only (resolver unchanged)
{
  const allow = computeAccess(accessCtx({ spaceId: CLASSROOM_1 }));
  assert.equal(allow.canViewSpace, true);
  assert.equal(allow.canEditSpace, true);
}

// F. Classroom #2 remains inaccessible
{
  const deny = computeAccess(accessCtx({ spaceId: CLASSROOM_2 }));
  assert.equal(deny.canViewSpace, false);
  assert.equal(deny.canEditSpace, false);
}

// G/H. Organisation verification display unchanged
{
  assert.match(listingsSrc, /verificationFieldsForManagedListing/);
  assert.match(tableSrc, /ORGANISATION_MANAGED_VERIFICATION_LABEL/);
  assert.match(
    readFileSync("lib/verification-display-context.ts", "utf8"),
    /Managed by organisation/
  );
  assert.doesNotMatch(
    listingsSrc,
    /owner_verification_status:\s*\n\s*profileData\?\.owner_verification_status/
  );
}

assert.equal(estimateMenuHeight(4) > estimateMenuHeight(1), true);
assert.equal(
  readdirSync("supabase/migrations").some((name) => name.startsWith("069_")),
  true
);

console.log("test-fixed-menu-position: all assertions passed");
