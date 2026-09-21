#!/usr/bin/env node
/**
 * Organisation Hosting UI integration — helpers + source contracts.
 * Does not apply migrations or write production data.
 * Run: npm run test:hosting-access
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import {
  hasHostingAccess,
  hostingHref,
  organisationInvitationRedirect,
  resolveHostingOrganisationId,
  summarizeHostingAccess,
  type HostingAccessInput,
} from "../lib/access/hosting-access";
import { hostingNavItems } from "../lib/dashboard-nav";
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

function hostingInput(
  overrides: Partial<HostingAccessInput> = {}
): HostingAccessInput {
  return {
    profileRole: "user",
    adminAccessDisabled: false,
    isHostProfile: false,
    ownedSpaceCount: 0,
    ownedPropertyCount: 0,
    grants: [],
    ...overrides,
  };
}

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
    grants: [],
    ...overrides,
  };
}

const header = readFileSync("app/components/Header.tsx", "utf8");
const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");
const listings = readFileSync("app/dashboard/listings/page.tsx", "utf8");
const owner = readFileSync("app/dashboard/owner/page.tsx", "utf8");
const requests = readFileSync("app/dashboard/requests/page.tsx", "utf8");
const calendar = readFileSync("app/dashboard/calendar/page.tsx", "utf8");
const finance = readFileSync("app/dashboard/finance/page.tsx", "utf8");
const people = readFileSync("app/dashboard/people/page.tsx", "utf8");
const properties = readFileSync("app/dashboard/properties/page.tsx", "utf8");
const editor = readFileSync("app/spaces/[id]/edit/page.tsx", "utf8");
const hostListingApi = readFileSync("app/api/host/listings/[id]/route.ts", "utf8");
const hostImagesApi = readFileSync(
  "app/api/host/listings/[id]/images/route.ts",
  "utf8"
);
const managedSpacesApi = readFileSync("app/api/host/managed-spaces/route.ts", "utf8");
const managedSpacesLib = readFileSync("lib/access/list-managed-spaces.ts", "utf8");
const managedApi = readFileSync("lib/access/require-managed-api.ts", "utf8");
const ownerListingApi = readFileSync("lib/require-owner-listing-api.ts", "utf8");
const inviteServer = readFileSync(
  "lib/access/organisation-access-invite-server.ts",
  "utf8"
);
const newSpace = readFileSync("app/dashboard/new-space/page.tsx", "utf8");
const orgsRoute = readFileSync("app/api/organisations/route.ts", "utf8");
const requirePeople = readFileSync("lib/access/require-org-people-api.ts", "utf8");
const threads = readFileSync("app/api/bookings/message-threads/route.ts", "utf8");
const listingQuestions = readFileSync("app/api/listing-questions/route.ts", "utf8");
const listingQuestionPatch = readFileSync(
  "app/api/listing-questions/[id]/route.ts",
  "utf8"
);
const submitReview = readFileSync(
  "app/api/owner/listings/[id]/submit-review/route.ts",
  "utf8"
);
const hostingHelper = readFileSync("lib/access/hosting-access.ts", "utf8");
const loadHosting = readFileSync("lib/access/load-hosting-access.ts", "utf8");
const dashboardNav = readFileSync("lib/dashboard-nav.ts", "utf8");

const smGrant = grant({
  role: "space_manager",
  status: "active",
  propertyId: PROP,
  spaceId: CLASSROOM_1,
});
const smSummary = summarizeHostingAccess(
  hostingInput({ grants: [smGrant] })
);
const renterSummary = summarizeHostingAccess(hostingInput());
const legacySummary = summarizeHostingAccess(
  hostingInput({ isHostProfile: true, ownedSpaceCount: 1 })
);
const oaSummary = summarizeHostingAccess(
  hostingInput({
    grants: [grant({ role: "org_admin", status: "active" })],
  })
);
const pmSummary = summarizeHostingAccess(
  hostingInput({
    grants: [
      grant({
        role: "property_manager",
        status: "active",
        propertyId: PROP,
      }),
    ],
  })
);
const gaSummary = summarizeHostingAccess(
  hostingInput({ profileRole: "admin" })
);

function navHrefs(summary: ReturnType<typeof summarizeHostingAccess>) {
  return hostingNavItems(summary).map((item) => item.href.split("?")[0]);
}

function navLabels(summary: ReturnType<typeof summarizeHostingAccess>) {
  return hostingNavItems(summary).map((item) => item.label);
}

// A. Space Manager hasHostingAccess = true
{
  assert.equal(smSummary.hasHostingAccess, true);
  assert.equal(hasHostingAccess(hostingInput({ grants: [smGrant] })), true);
  assert.equal(smSummary.isSpaceManager, true);
  assert.equal(smSummary.isLegacyHost, false);
}

// B. normal renter hasHostingAccess = false
{
  assert.equal(renterSummary.hasHostingAccess, false);
  assert.equal(hasHostingAccess(hostingInput()), false);
}

// C. legacy host still hasHostingAccess
{
  assert.equal(legacySummary.hasHostingAccess, true);
  assert.equal(legacySummary.isLegacyHost, true);
  assert.equal(
    hasHostingAccess(hostingInput({ ownedSpaceCount: 1, isHostProfile: false })),
    true
  );
  assert.equal(
    hasHostingAccess(hostingInput({ ownedPropertyCount: 1, isHostProfile: false })),
    true
  );
}

// D/E Header Hosting vs Become a host
{
  assert.match(header, /hasHostingAccess/);
  assert.match(header, /label: "Hosting"/);
  assert.match(header, /hostingOwnerHref/);
  assert.match(header, /Become a host/);
  assert.match(header, /\/dashboard\/become-host/);
  assert.match(header, /fetchHostingAccessSummary/);
}

// F. Space Manager Hosting nav contains core items
{
  const labels = navLabels(smSummary);
  const hrefs = navHrefs(smSummary);
  assert.equal(labels.includes("Overview"), true);
  assert.equal(labels.includes("My spaces"), true);
  assert.equal(labels.includes("Booking requests"), true);
  assert.equal(labels.includes("Calendar"), true);
  assert.equal(labels.includes("Comms"), true);
  assert.equal(hrefs.includes("/dashboard/owner"), true);
  assert.equal(hrefs.includes("/dashboard/listings"), true);
  assert.equal(hrefs.includes("/dashboard/requests"), true);
  assert.equal(hrefs.includes("/dashboard/calendar"), true);
}

// G. Space Manager Hosting nav excludes People, properties, finance, create-space
{
  const hrefs = navHrefs(smSummary);
  assert.equal(hrefs.includes("/dashboard/people"), false);
  assert.equal(hrefs.includes("/dashboard/properties"), false);
  assert.equal(hrefs.includes("/dashboard/finance"), false);
  assert.equal(smSummary.showPeople, false);
  assert.equal(smSummary.showProperties, false);
  assert.equal(smSummary.showFinance, false);
  assert.equal(smSummary.showCreateSpace, false);
  assert.match(listings, /showCreateSpace/);
  assert.match(listings, /\+ Add space/);
  assert.match(newSpace, /!profile\?\.is_host/);
}

// H. invitation acceptance redirects
{
  assert.equal(
    organisationInvitationRedirect("space_manager", ORG),
    `/dashboard/owner?organisation=${ORG}`
  );
  assert.equal(
    organisationInvitationRedirect("property_manager", ORG),
    `/dashboard/owner?organisation=${ORG}`
  );
  assert.equal(
    organisationInvitationRedirect("org_admin", ORG),
    `/dashboard/people?organisation=${ORG}`
  );
  assert.match(inviteServer, /organisationInvitationRedirect/);
}

// I/J My spaces uses managed-space architecture, not is_host / owner_id only
{
  assert.match(listings, /fetchManagedSpaces/);
  assert.match(listings, /summary\.hasHostingAccess/);
  assert.doesNotMatch(listings, /if \(!profile\?\.is_host\)/);
  assert.match(owner, /fetchManagedSpaces/);
  assert.match(managedSpacesApi, /listManagedSpaceIds/);
  assert.match(managedSpacesLib, /role === "space_manager" && grant\.space_id/);
  assert.match(managedSpacesLib, /\.eq\("owner_id", userId\)/);
  const managedProperties = readFileSync(
    "lib/access/list-managed-properties.ts",
    "utf8"
  );
  assert.match(managedProperties, /property_manager/);
  assert.match(managedProperties, /org_admin/);
  assert.doesNotMatch(managedProperties, /role === "space_manager"/);
  const ownerPropertiesRoute = readFileSync(
    "app/api/owner/properties/route.ts",
    "utf8"
  );
  assert.match(ownerPropertiesRoute, /listManagedPropertyIds/);
  assert.doesNotMatch(ownerPropertiesRoute, /\.eq\("owner_id", user\.id\)/);
  assert.equal(managedSpacesLib.includes("Classroom #2"), false);
}

// K. OA/PM/legacy owner Hosting nav remains correct
{
  assert.equal(oaSummary.showPeople, true);
  assert.equal(oaSummary.showProperties, true);
  assert.equal(oaSummary.showFinance, true);
  assert.equal(oaSummary.showCreateSpace, true);
  assert.equal(navHrefs(oaSummary).includes("/dashboard/people"), true);

  assert.equal(pmSummary.showPeople, false);
  assert.equal(pmSummary.showProperties, true);
  assert.equal(pmSummary.showFinance, true);
  assert.equal(pmSummary.showCreateSpace, false);
  assert.equal(navHrefs(pmSummary).includes("/dashboard/people"), false);
  assert.equal(navHrefs(pmSummary).includes("/dashboard/properties"), true);

  assert.equal(legacySummary.showProperties, true);
  assert.equal(legacySummary.showFinance, true);
  assert.equal(navHrefs(legacySummary).includes("/dashboard/listings"), true);
}

// L/M editor Classroom #1 allowed, #2 denied via resolver
{
  const allow = computeAccess(
    accessCtx({
      spaceId: CLASSROOM_1,
      grants: [smGrant],
    })
  );
  assert.equal(allow.canEditSpace, true);
  assert.equal(allow.isSpaceManager, true);

  const deny = computeAccess(
    accessCtx({
      spaceId: CLASSROOM_2,
      grants: [smGrant],
    })
  );
  assert.equal(deny.canEditSpace, false);
  assert.equal(deny.isSpaceManager, false);
  assert.match(editor, /\/api\/host\/listings\/\$\{id\}/);
  assert.match(editor, /\/api\/host\/listings\/\$\{listingId\}/);
  assert.doesNotMatch(editor, /\.eq\("owner_id", user\.id\)/);
}

// N. editor mutation changing request ID is gated by requireManagedListingApi
{
  assert.match(hostListingApi, /requireManagedListingApi\(req, id\)/);
  assert.match(hostListingApi, /Listing updates do not accept client identity fields/);
  assert.match(hostListingApi, /body\.userId \|\| body\.owner_id/);
  assert.match(managedApi, /canEditSpace/);
  assert.match(hostImagesApi, /requireManagedListingApi\(req, id\)/);
  assert.match(ownerListingApi, /resolveAccessForSpace/);
  assert.match(ownerListingApi, /canEditSpace/);
  assert.doesNotMatch(submitReview, /\.eq\("owner_id", auth\.userId\)/);
}

// O. booking requests scoped to managed spaces
{
  assert.match(requests, /fetchManagedSpaces/);
  assert.match(requests, /managedIds\.has\(booking\.space_id\)/);
}

// P. calendar scoped to managed spaces
{
  assert.match(calendar, /fetchManagedSpaces/);
}

// Q. People API still denied to SM
{
  const peopleAccess = computeAccess(
    accessCtx({ grants: [smGrant] })
  );
  assert.equal(peopleAccess.canManagePeopleAccess, false);
  assert.match(requirePeople, /canManagePeopleAccess/);
  assert.match(orgsRoute, /listManageableOrganisations/);
  assert.match(people, /showPeople/);
  assert.match(people, /window\.location\.replace\(hosting\.ownerHref\)/);
}

// R. Organisation finance still denied to SM
{
  const financeAccess = computeAccess(
    accessCtx({ grants: [smGrant] })
  );
  assert.equal(financeAccess.canManageOrganisationFinance, false);
  assert.equal(smSummary.showFinance, false);
  assert.match(finance, /showFinance/);
  assert.match(finance, /window\.location\.replace\(hosting\.ownerHref\)/);
}

// S. organisation query param is not authority
{
  assert.match(hostingHelper, /Organisation context does not grant/);
  const fallback = resolveHostingOrganisationId({
    requestedId: "00000000-0000-4000-8000-000000000000",
    organisationIds: [ORG],
    primaryOrganisationId: ORG,
  });
  assert.equal(fallback, ORG);
  const renterOrg = resolveHostingOrganisationId({
    requestedId: ORG,
    organisationIds: [],
    primaryOrganisationId: null,
  });
  assert.equal(renterOrg, null);
  assert.match(dashboard, /Switch to Hosting/);
  assert.match(dashboard, /hasHostingAccess/);
}

// T. spaces.owner_id remains unnecessary for Organisation manager authority
{
  const withoutOwner = computeAccess(
    accessCtx({
      spaceOwnerId: null,
      grants: [smGrant],
    })
  );
  assert.equal(withoutOwner.canEditSpace, true);
  assert.match(hostingHelper, /profiles.is_host is a legacy compatibility/);
}

// U. profiles.is_host remains unnecessary
{
  assert.equal(
    hasHostingAccess(
      hostingInput({
        isHostProfile: false,
        grants: [smGrant],
      })
    ),
    true
  );
  assert.match(loadHosting, /isHostProfile: row\?\.is_host === true/);
  assert.match(loadHosting, /organisation_access/);
}

// V. Global Admin regression
{
  assert.equal(gaSummary.hasHostingAccess, true);
  assert.equal(gaSummary.isGlobalAdmin, true);
  assert.equal(gaSummary.showPeople, true);
  assert.equal(gaSummary.showCreateSpace, true);
  const gaAccess = computeAccess(
    accessCtx({
      profileRole: "admin",
      grants: [],
      spaceOwnerId: null,
    })
  );
  assert.equal(gaAccess.canEditSpace, true);
  assert.equal(gaAccess.canManagePeopleAccess, true);
}

// W. legacy owner regression
{
  const legacyAccess = computeAccess(
    accessCtx({
      spaceOwnerId: USER,
      grants: [],
    })
  );
  assert.equal(legacyAccess.canEditSpace, true);
  assert.equal(legacyAccess.isLegacySpaceOwner, true);
  assert.equal(legacyAccess.canManagePeopleAccess, false);
}

{
  assert.equal(
    hostingHref("/dashboard/owner", ORG),
    `/dashboard/owner?organisation=${ORG}`
  );
  assert.match(dashboardNav, /hostingNavItems/);
  assert.match(threads, /listManagedSpaceIds/);
  assert.match(listingQuestions, /listManagedSpaceIds/);
  assert.match(listingQuestionPatch, /resolveAccessForSpace/);
  assert.doesNotMatch(hostingHelper, /CREATE TABLE/);
}

console.log("test-hosting-access: all assertions passed");
