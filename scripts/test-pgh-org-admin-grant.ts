#!/usr/bin/env node
/**
 * Guards for the Paarl Girls' High organisation-admin repair.
 * Does not connect to a database.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  summarizeHostingAccess,
  summarizeHostingAccessForContext,
} from "../lib/access/hosting-access";
import { hostingContextFromSummary } from "../lib/access/hosting-context";

const sql = readFileSync(
  "supabase/migrations/080_20261124_pgh_org_admin_grant.sql",
  "utf8"
);

const ORG = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const PROPERTY = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";
const EMAIL = "mvandermerwe@paarlgirlshigh.com";
const SPACES = [
  "9f9f8700-0fa2-4086-87d7-7a58e1b2ff18",
  "cd1ebdff-0259-4185-8a0c-ac2892f03778",
  "2add6853-3b32-450e-a4ba-42c0b6e5f47f",
  "d6eb8542-f89f-42a7-80b8-cebf15999e18",
  "a3fd1477-bb1d-4f2a-a42f-c36751c6e1ea",
  "c2196a2e-6432-4765-842f-8cff51aca88e",
  "070e8909-5e61-49ad-86d9-f6084a6ee2b9",
  "09c75d46-4eb0-4b6c-aaec-21f8b0cd9cd8",
];

assert.match(sql, new RegExp(EMAIL.replace(".", "\\.")));
assert.match(sql, new RegExp(ORG));
assert.match(sql, new RegExp(PROPERTY));
for (const spaceId of SPACES) {
  assert.match(sql, new RegExp(spaceId));
}

assert.doesNotMatch(sql, /UPDATE\s+public\.properties/i);
assert.doesNotMatch(sql, /UPDATE\s+public\.spaces/i);
assert.doesNotMatch(sql, /UPDATE\s+public\.profiles/i);
assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.organisations/i);
assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.properties/i);
assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.spaces/i);
assert.doesNotMatch(sql, /DELETE\s+FROM/i);
assert.doesNotMatch(sql, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
assert.doesNotMatch(sql, /SET\s+role/i);
assert.match(sql, /refusing to alter a platform admin profile/);
assert.match(sql, /'org_admin'/);
assert.match(sql, /property_id IS NULL/);
assert.match(sql, /space_id IS NULL/);
assert.match(sql, /email_confirmed_at/);
assert.match(sql, /canonical organisation is not in this database/);

const withoutGrant = summarizeHostingAccess({
  profileRole: "user",
  isHostProfile: true,
  ownedSpaceCount: 0,
  ownedPropertyCount: 1,
  grants: [],
});
assert.equal(withoutGrant.isOrganisationAdmin, false);
assert.equal(withoutGrant.isGlobalAdmin, false);
assert.equal(
  hostingContextFromSummary(withoutGrant, null).kind,
  "personal"
);

const withGrant = summarizeHostingAccess({
  profileRole: "user",
  isHostProfile: false,
  ownedSpaceCount: 0,
  ownedPropertyCount: 0,
  grants: [
    {
      organisationId: ORG,
      role: "org_admin",
      propertyId: null,
      spaceId: null,
      status: "active",
    },
  ],
});
const context = hostingContextFromSummary(withGrant, null);
assert.equal(context.kind, "organisation");
assert.equal(context.organisationId, ORG);
const capabilities = summarizeHostingAccessForContext(
  {
    profileRole: "user",
    isHostProfile: false,
    ownedSpaceCount: 0,
    ownedPropertyCount: 0,
    grants: withGrant.organisationIds.map(() => ({
      organisationId: ORG,
      role: "org_admin" as const,
      propertyId: null,
      spaceId: null,
      status: "active" as const,
    })),
  },
  context
);
assert.equal(capabilities.showPeople, true);
assert.equal(capabilities.showProperties, true);
assert.equal(capabilities.isGlobalAdmin, false);
assert.deepEqual(capabilities.organisationIds, [ORG]);

console.log("test-pgh-org-admin-grant: ok");
