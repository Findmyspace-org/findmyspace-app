#!/usr/bin/env node
/**
 * Hosting workspace active-context scoping.
 * Application-layer only. Does not apply migrations or write production data.
 * Run: npm run test:hosting-context
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import {
  hostingHref,
  resolveHostingOrganisationId,
  summarizeHostingAccess,
  type HostingAccessSummary,
} from "../lib/access/hosting-access";
import {
  filterRowsForHostingContext,
  hostingContextFromSummary,
  hostingContextHrefOrganisationId,
  hostingContextOrganisationId,
  propertyMatchesHostingContext,
  resolveHostingContext,
  type HostingContext,
} from "../lib/access/hosting-context";
import { hostingNavItems } from "../lib/dashboard-nav";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";

const ORG_A = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const ORG_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UNAUTH = "00000000-0000-4000-8000-000000000000";
const USER = "5860f254-26e9-4f7f-8760-3fd69bd9fff3";
const PROP_A = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";
const SPACE_A = "cd1ebdff-0259-4185-8a0c-ac2892f03778";
const SPACE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const SPACE_PERSONAL = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const SPACE_LEGACY = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";

type InventoryRow = {
  id: string;
  organisation_id: string | null;
  owner_id?: string | null;
};

const inventory: InventoryRow[] = [
  { id: SPACE_A, organisation_id: ORG_A, owner_id: USER },
  { id: SPACE_B, organisation_id: ORG_B, owner_id: USER },
  { id: SPACE_PERSONAL, organisation_id: null, owner_id: USER },
  { id: SPACE_LEGACY, organisation_id: ORG_A, owner_id: USER },
];

const properties: InventoryRow[] = [
  { id: PROP_A, organisation_id: ORG_A, owner_id: USER },
  { id: "prop-b", organisation_id: ORG_B, owner_id: USER },
  { id: "prop-personal", organisation_id: null, owner_id: USER },
];

function grant(
  partial: Partial<OrganisationAccessGrant> &
    Pick<OrganisationAccessGrant, "role" | "status">
): OrganisationAccessGrant {
  return {
    organisationId: partial.organisationId ?? ORG_A,
    role: partial.role,
    propertyId: partial.propertyId ?? null,
    spaceId: partial.spaceId ?? null,
    status: partial.status,
  };
}

function oaSummary(
  organisationIds: string[] = [ORG_A, ORG_B]
): HostingAccessSummary {
  return summarizeHostingAccess({
    profileRole: "user",
    isHostProfile: true,
    ownedSpaceCount: 1,
    ownedPropertyCount: 1,
    grants: organisationIds.map((organisationId) =>
      grant({
        organisationId,
        role: "org_admin",
        status: "active",
      })
    ),
  });
}

function scopedIds(
  rows: InventoryRow[],
  context: HostingContext,
  authorisedIds?: string[]
): string[] {
  const authorised = authorisedIds
    ? rows.filter((row) => authorisedIds.includes(row.id))
    : rows;
  return filterRowsForHostingContext(
    authorised,
    context,
    (row) => row.organisation_id
  ).map((row) => row.id);
}

const contextSrc = readFileSync("lib/access/hosting-context.ts", "utf8");
const hostingAccessSrc = readFileSync("lib/access/hosting-access.ts", "utf8");
const hookSrc = readFileSync("lib/use-hosting-workspace.ts", "utf8");
const chromeSrc = readFileSync("lib/use-workspace-chrome.ts", "utf8");
const managedSpacesApi = readFileSync(
  "app/api/host/managed-spaces/route.ts",
  "utf8"
);
const propertiesApi = readFileSync("app/api/owner/properties/route.ts", "utf8");
const propertyDetailApi = readFileSync(
  "app/api/owner/properties/[id]/route.ts",
  "utf8"
);
const listingQuestionsApi = readFileSync(
  "app/api/listing-questions/route.ts",
  "utf8"
);
const threadsApi = readFileSync(
  "app/api/bookings/message-threads/route.ts",
  "utf8"
);
const ownerSrc = readFileSync("app/dashboard/owner/page.tsx", "utf8");
const listingsSrc = readFileSync("app/dashboard/listings/page.tsx", "utf8");
const propertiesSrc = readFileSync("app/dashboard/properties/page.tsx", "utf8");
const requestsSrc = readFileSync("app/dashboard/requests/page.tsx", "utf8");
const commsSrc = readFileSync("app/dashboard/comms/page.tsx", "utf8");
const calendarSrc = readFileSync("app/dashboard/calendar/page.tsx", "utf8");
const financeSrc = readFileSync("app/dashboard/finance/page.tsx", "utf8");
const peopleSrc = readFileSync("app/dashboard/people/page.tsx", "utf8");
const organisationSrc = readFileSync(
  "app/dashboard/organisation/page.tsx",
  "utf8"
);
const verificationSrc = readFileSync(
  "app/dashboard/verification/page.tsx",
  "utf8"
);
const clientSrc = readFileSync("lib/host-managed-spaces-client.ts", "utf8");
const navSrc = readFileSync("lib/dashboard-nav.ts", "utf8");
const dashboardSrc = readFileSync("app/dashboard/page.tsx", "utf8");

// Shared helper uses properties.organisation_id, never owner_id.
{
  assert.match(contextSrc, /propertyMatchesHostingContext/);
  assert.match(contextSrc, /listManagedSpaceIdsForHostingContext/);
  assert.match(contextSrc, /listManagedPropertyIdsForHostingContext/);
  assert.match(contextSrc, /kind === "unavailable"/);
  assert.match(hostingAccessSrc, /must not silently substitute/);
  assert.doesNotMatch(
    contextSrc.slice(contextSrc.indexOf("propertyMatchesHostingContext")),
    /owner_id/
  );
}

// A. OA for A + B, A selected → only A
{
  const context = resolveHostingContext({
    requestedId: ORG_A,
    organisationIds: [ORG_A, ORG_B],
    primaryOrganisationId: ORG_A,
    isLegacyHost: true,
  });
  assert.equal(context.kind, "organisation");
  assert.equal(context.organisationId, ORG_A);
  assert.deepEqual(scopedIds(inventory, context), [SPACE_A, SPACE_LEGACY]);
  assert.deepEqual(scopedIds(properties, context), [PROP_A]);
}

// B. Switch to Organisation B → only B
{
  const context = resolveHostingContext({
    requestedId: ORG_B,
    organisationIds: [ORG_A, ORG_B],
    primaryOrganisationId: ORG_A,
    isLegacyHost: true,
  });
  assert.equal(context.organisationId, ORG_B);
  assert.deepEqual(scopedIds(inventory, context), [SPACE_B]);
  assert.deepEqual(scopedIds(properties, context), ["prop-b"]);
}

// C. Dual-role OA + personal host, organisation selected → no personal inventory
{
  const context = hostingContextFromSummary(oaSummary(), ORG_A);
  assert.equal(hostingContextOrganisationId(context), ORG_A);
  const ids = scopedIds(inventory, context);
  assert.equal(ids.includes(SPACE_PERSONAL), false);
  assert.equal(ids.includes(SPACE_A), true);
}

// D. Genuine personal-host context → organisation_id NULL only
{
  const context = resolveHostingContext({
    requestedId: null,
    organisationIds: [],
    primaryOrganisationId: null,
    isLegacyHost: true,
  });
  assert.equal(context.kind, "personal");
  assert.deepEqual(scopedIds(inventory, context), [SPACE_PERSONAL]);
  assert.deepEqual(scopedIds(properties, context), ["prop-personal"]);
}

// E. Property has owner_id=user AND organisation_id=A → not personal
{
  const personal = resolveHostingContext({
    requestedId: null,
    organisationIds: [],
    primaryOrganisationId: null,
    isLegacyHost: true,
  });
  assert.equal(
    propertyMatchesHostingContext(ORG_A, personal),
    false
  );
  assert.equal(scopedIds(inventory, personal).includes(SPACE_LEGACY), false);
  const orgA = resolveHostingContext({
    requestedId: ORG_A,
    organisationIds: [ORG_A],
    primaryOrganisationId: ORG_A,
    isLegacyHost: true,
  });
  assert.equal(propertyMatchesHostingContext(ORG_A, orgA), true);
  assert.equal(scopedIds(inventory, orgA).includes(SPACE_LEGACY), true);
}

// F. Space Manager in Organisation A → assigned A spaces only
{
  const smSummary = summarizeHostingAccess({
    profileRole: "user",
    isHostProfile: false,
    ownedSpaceCount: 0,
    ownedPropertyCount: 0,
    grants: [
      grant({
        role: "space_manager",
        status: "active",
        spaceId: SPACE_A,
        propertyId: PROP_A,
      }),
    ],
  });
  const context = hostingContextFromSummary(smSummary, ORG_A);
  assert.deepEqual(scopedIds(inventory, context, [SPACE_A]), [SPACE_A]);
  assert.deepEqual(scopedIds(inventory, context, [SPACE_A, SPACE_B]), [SPACE_A]);
  assert.equal(smSummary.showFinance, false);
  assert.equal(smSummary.showPeople, false);
  assert.equal(smSummary.showOrganisationCommercial, false);
}

// G. Property Manager in Organisation A → assigned property spaces only
{
  const pmSummary = summarizeHostingAccess({
    profileRole: "user",
    isHostProfile: false,
    ownedSpaceCount: 0,
    ownedPropertyCount: 0,
    grants: [
      grant({
        role: "property_manager",
        status: "active",
        propertyId: PROP_A,
      }),
    ],
  });
  const context = hostingContextFromSummary(pmSummary, ORG_A);
  assert.deepEqual(
    scopedIds(inventory, context, [SPACE_A, SPACE_LEGACY]),
    [SPACE_A, SPACE_LEGACY]
  );
  assert.equal(
    scopedIds(inventory, context, [SPACE_A, SPACE_B, SPACE_PERSONAL]).includes(
      SPACE_B
    ),
    false
  );
  assert.equal(pmSummary.showFinance, true);
  assert.equal(pmSummary.showPeople, false);
}

// H. Global Admin with Organisation A selected → A only, not platform-wide
{
  const gaSummary = summarizeHostingAccess({
    profileRole: "admin",
    isHostProfile: true,
    ownedSpaceCount: 2,
    ownedPropertyCount: 2,
    grants: [grant({ role: "org_admin", status: "active" })],
  });
  const context = hostingContextFromSummary(gaSummary, ORG_A);
  assert.equal(context.kind, "organisation");
  assert.equal(context.organisationId, ORG_A);
  assert.deepEqual(scopedIds(inventory, context), [SPACE_A, SPACE_LEGACY]);
  const otherOrg = hostingContextFromSummary(gaSummary, ORG_B);
  assert.equal(otherOrg.kind, "organisation");
  assert.equal(otherOrg.organisationId, ORG_B);
  assert.deepEqual(scopedIds(inventory, otherOrg), [SPACE_B]);
}

// I. Explicit unauthorised organisationId → fail closed / no fallback data
{
  const context = resolveHostingContext({
    requestedId: UNAUTH,
    organisationIds: [ORG_A, ORG_B],
    primaryOrganisationId: ORG_A,
    isLegacyHost: true,
  });
  assert.equal(context.kind, "unavailable");
  assert.equal(context.organisationId, null);
  assert.deepEqual(scopedIds(inventory, context), []);
  assert.deepEqual(scopedIds(properties, context), []);
  assert.equal(
    resolveHostingOrganisationId({
      requestedId: UNAUTH,
      organisationIds: [ORG_A],
      primaryOrganisationId: ORG_A,
    }),
    null
  );
  assert.equal(
    hostingContextHrefOrganisationId(context, UNAUTH),
    UNAUTH
  );
}

// J. No explicit organisationId → existing default/primary context
{
  const dual = resolveHostingContext({
    requestedId: null,
    organisationIds: [ORG_A, ORG_B],
    primaryOrganisationId: ORG_A,
    isLegacyHost: true,
  });
  assert.equal(dual.kind, "organisation");
  assert.equal(dual.organisationId, ORG_A);
  assert.deepEqual(scopedIds(inventory, dual), [SPACE_A, SPACE_LEGACY]);

  const personal = resolveHostingContext({
    requestedId: "",
    organisationIds: [],
    primaryOrganisationId: null,
    isLegacyHost: true,
  });
  assert.equal(personal.kind, "personal");
}

// K. Internal Hosting navigation preserves organisationId
{
  const hrefs = hostingNavItems(oaSummary([ORG_A]), ORG_A).map((item) => item.href);
  for (const href of hrefs) {
    assert.match(href, new RegExp(`[?&]organisation=${ORG_A}`));
  }
  assert.equal(
    hostingHref("/dashboard/comms?view=hosting", ORG_A),
    `/dashboard/comms?view=hosting&organisation=${ORG_A}`
  );
  assert.match(hookSrc, /hrefOrganisationId/);
  assert.match(hookSrc, /hostingNavItems\(summary, hrefOrganisationId\)/);
  assert.match(navSrc, /hostingHref\(item\.href, organisationId\)/);
  assert.match(listingsSrc, /hostingHref\(\s*`\/dashboard\/requests\?booking=/);
  assert.match(ownerSrc, /hosting\.hrefOrganisationId/);
}

// L. Space Manager still has no organisation-wide Finance/People/commercial
{
  const smSummary = summarizeHostingAccess({
    profileRole: "user",
    isHostProfile: false,
    ownedSpaceCount: 0,
    ownedPropertyCount: 0,
    grants: [
      grant({
        role: "space_manager",
        status: "active",
        spaceId: SPACE_A,
      }),
    ],
  });
  const hrefs = hostingNavItems(smSummary, ORG_A).map((item) => item.href.split("?")[0]);
  assert.equal(hrefs.includes("/dashboard/finance"), false);
  assert.equal(hrefs.includes("/dashboard/people"), false);
  assert.equal(hrefs.includes("/dashboard/organisation"), false);
  const smAccess = computeAccess({
    userId: USER,
    spaceId: SPACE_A,
    propertyId: PROP_A,
    organisationId: ORG_A,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "user",
    adminAccessDisabled: false,
    grants: [
      grant({
        role: "space_manager",
        status: "active",
        spaceId: SPACE_A,
        propertyId: PROP_A,
      }),
    ],
  } satisfies AccessContext);
  assert.equal(smAccess.canManageOrganisationFinance, false);
  assert.equal(smAccess.canManagePeopleAccess, false);
}

// M. Personal host verification workflow remains intact
{
  assert.match(
    listingsSrc,
    /verificationKind === "personal" \? <OwnerVerificationAlerts/
  );
  assert.match(
    ownerSrc,
    /verificationKind === "personal" \? <OwnerVerificationAlerts/
  );
  assert.match(verificationSrc, /useHostingWorkspace/);
}

// N. Booking workspace unaffected
{
  assert.match(dashboardSrc, /workspaceLabel="Booking"/);
  assert.match(commsSrc, /viewParam === "hosting"/);
  assert.match(threadsApi, /hostingScoped/);
  assert.match(threadsApi, /listManagedSpaceIds\(admin, user\.id\)/);
  assert.doesNotMatch(dashboardSrc, /fetchManagedSpaces/);
}

// Trusted APIs enforce context, not UI-only filters.
{
  assert.match(managedSpacesApi, /resolveRequestHostingContext/);
  assert.match(managedSpacesApi, /listManagedSpaceIdsForHostingContext/);
  assert.match(propertiesApi, /listManagedPropertyIdsForHostingContext/);
  assert.match(propertyDetailApi, /propertyMatchesHostingContext/);
  assert.match(listingQuestionsApi, /listManagedSpaceIdsForHostingContext/);
  assert.match(clientSrc, /requestedOrganisationId/);
  assert.match(ownerSrc, /fetchManagedSpaces\(/);
  assert.match(listingsSrc, /requestedOrganisationId/);
  assert.match(propertiesSrc, /hostingHref\("\/api\/owner\/properties"/);
  assert.match(requestsSrc, /requestedOrganisationId/);
  assert.match(calendarSrc, /requestedOrganisationId/);
  assert.match(financeSrc, /requestedOrganisationId/);
  assert.match(commsSrc, /hostingHref\("\/api\/listing-questions\?role=owner"/);
  assert.match(commsSrc, /hostingHref\("\/api\/bookings\/message-threads"/);
  assert.match(peopleSrc, /selection\.kind === "unavailable"/);
  assert.match(organisationSrc, /not available in your workspace/);
  assert.match(chromeSrc, /hostingContextFromSummary/);
}

// Unavailable must not leak personal rows.
{
  const unavailable: HostingContext = {
    kind: "unavailable",
    organisationId: null,
  };
  assert.equal(propertyMatchesHostingContext(null, unavailable), false);
  assert.equal(propertyMatchesHostingContext(ORG_A, unavailable), false);
}

console.log("test-hosting-context: ok");
