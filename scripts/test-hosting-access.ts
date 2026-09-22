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
import { hostingNavItems, RENTER_NAV, HOST_NAV } from "../lib/dashboard-nav";
import {
  BOOKING_HREF,
  HOSTING_OVERVIEW_PATH,
  SWITCH_TO_BOOKING_LABEL,
  SWITCH_TO_HOSTING_LABEL,
  hostingOrganisationContextName,
  workspaceKindFromLabel,
  workspaceSelector,
  workspaceSwitch,
} from "../lib/workspace-switch";
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
const dashboardShell = readFileSync("app/components/DashboardShell.tsx", "utf8");
const workspaceSwitchUi = readFileSync(
  "app/components/WorkspaceSwitch.tsx",
  "utf8"
);
const accessSummaryRoute = readFileSync(
  "app/api/host/access-summary/route.ts",
  "utf8"
);
const workspaceChrome = readFileSync("lib/use-workspace-chrome.ts", "utf8");
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

// D/E Header Booking / Hosting / Become a host
{
  assert.match(header, /hasHostingAccess/);
  assert.match(header, /title: "Booking"/);
  assert.match(header, /title: "Hosting"/);
  assert.match(header, /title: "Account"/);
  assert.match(header, /hostingNavItems/);
  assert.match(header, /RENTER_NAV/);
  assert.match(header, /label: "Sign out"/);
  assert.doesNotMatch(header, /Account settings/);
  assert.match(header, /Become a host/);
  assert.match(header, /\/dashboard\/become-host/);
  assert.match(header, /fetchHostingAccessSummary/);
  assert.doesNotMatch(header, /Host dashboard/);
  assert.doesNotMatch(header, /My dashboard/);
  assert.doesNotMatch(header, /title: "My account"/);
  assert.doesNotMatch(header, /Switch to host/);
  assert.match(header, /setHasHostingAccess\(summary\.hasHostingAccess\)/);
  assert.doesNotMatch(header, /setHasHostingAccess\(data\?\.is_host === true\)/);
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

// Booking nav is not personal-host verification
{
  assert.equal(
    RENTER_NAV.map((item) => item.label).join(","),
    "Overview,My bookings,Comms,Payments"
  );
  assert.equal(
    RENTER_NAV.some((item) => item.href === "/dashboard/verification"),
    false
  );
  assert.equal(
    HOST_NAV.some((item) => item.label === "Verification & payouts"),
    true
  );
  assert.equal(smSummary.showVerification, false);
  assert.equal(legacySummary.showVerification, true);
  assert.doesNotMatch(dashboard, /Account settings/);
  assert.doesNotMatch(header, /Account settings/);
}

// G. Space Manager Hosting nav excludes People, properties, finance, create-space
{
  const hrefs = navHrefs(smSummary);
  assert.equal(hrefs.includes("/dashboard/people"), false);
  assert.equal(hrefs.includes("/dashboard/organisation"), false);
  assert.equal(hrefs.includes("/dashboard/properties"), false);
  assert.equal(hrefs.includes("/dashboard/finance"), false);
  assert.equal(smSummary.showPeople, false);
  assert.equal(smSummary.showOrganisationCommercial, false);
  assert.equal(smSummary.showProperties, false);
  assert.equal(smSummary.showFinance, false);
  assert.equal(smSummary.showCreateSpace, false);
  assert.match(listings, /showCreateSpace/);
  assert.match(listings, /\+ Add space/);
  assert.match(newSpace, /!profile\?\.is_host/);
  assert.match(newSpace, /fetchManageableOrganisations/);
  assert.match(newSpace, /canOpenOrganisationListingContext/);
  assert.match(newSpace, /organisationListingDeniedHref/);
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
  assert.equal(oaSummary.showOrganisationCommercial, true);
  assert.equal(oaSummary.showProperties, true);
  assert.equal(oaSummary.showFinance, true);
  assert.equal(oaSummary.showCreateSpace, true);
  assert.equal(navHrefs(oaSummary).includes("/dashboard/people"), true);
  assert.equal(navHrefs(oaSummary).includes("/dashboard/organisation"), true);

  assert.equal(pmSummary.showPeople, false);
  assert.equal(pmSummary.showOrganisationCommercial, false);
  assert.equal(pmSummary.showProperties, true);
  assert.equal(pmSummary.showFinance, true);
  assert.equal(pmSummary.showCreateSpace, false);
  assert.equal(navHrefs(pmSummary).includes("/dashboard/people"), false);
  assert.equal(navHrefs(pmSummary).includes("/dashboard/organisation"), false);
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
  const unauthorisedSwitch = workspaceSwitch({
    kind: "booking",
    hasHostingAccess: false,
    organisationId: ORG,
  });
  assert.equal(unauthorisedSwitch, null);
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

// Verification display is listing-context, not operator-profile stamping
{
  assert.equal(smSummary.showVerification, false);
  assert.equal(pmSummary.showVerification, false);
  assert.equal(oaSummary.showVerification, false);
  assert.equal(legacySummary.showVerification, true);
  assert.equal(gaSummary.showVerification, true);
  assert.match(listings, /verificationFieldsForManagedListing/);
  assert.doesNotMatch(
    listings,
    /owner_verification_status:\s*\n\s*profileData\?\.owner_verification_status/
  );
  assert.match(editor, /listingVerificationDisplayContext/);
}

{
  const actionsMenu = readFileSync(
    "app/components/admin/AdminRowActionsMenu.tsx",
    "utf8"
  );
  const spacesTable = readFileSync(
    "app/components/owner/OwnerSpacesTable.tsx",
    "utf8"
  );
  assert.match(actionsMenu, /createPortal/);
  assert.match(actionsMenu, /position: "fixed"/);
  assert.match(spacesTable, /overflow-x-auto/);
  assert.match(spacesTable, /label: "View details"/);
  assert.match(spacesTable, /label: "Edit space"/);
}

// Workspace switch uses hasHostingAccess, not profiles.is_host
{
  assert.equal(workspaceKindFromLabel("Booking"), "booking");
  assert.equal(workspaceKindFromLabel("My account"), "booking");
  assert.equal(workspaceKindFromLabel("Hosting"), "hosting");

  const smBooking = workspaceSwitch({
    kind: "booking",
    hasHostingAccess: smSummary.hasHostingAccess,
    organisationId: ORG,
  });
  assert.equal(smSummary.hasHostingAccess, true);
  assert.equal(smSummary.isLegacyHost, false);
  assert.equal(smBooking?.label, SWITCH_TO_HOSTING_LABEL);
  assert.equal(smBooking?.href, `${HOSTING_OVERVIEW_PATH}?organisation=${ORG}`);

  const smHosting = workspaceSwitch({
    kind: "hosting",
    hasHostingAccess: smSummary.hasHostingAccess,
    organisationId: ORG,
  });
  assert.equal(smHosting?.label, SWITCH_TO_BOOKING_LABEL);
  assert.equal(smHosting?.href, BOOKING_HREF);
  assert.equal(
    hostingOrganisationContextName({
      organisationId: ORG,
      organisations: [{ id: ORG, name: "Paarl Girls' High" }],
    }),
    "Paarl Girls' High"
  );

  const renterBooking = workspaceSwitch({
    kind: "booking",
    hasHostingAccess: renterSummary.hasHostingAccess,
    organisationId: null,
  });
  assert.equal(renterSummary.hasHostingAccess, false);
  assert.equal(renterBooking, null);

  const personalHost = workspaceSwitch({
    kind: "booking",
    hasHostingAccess: legacySummary.hasHostingAccess,
    organisationId: null,
  });
  assert.equal(legacySummary.hasHostingAccess, true);
  assert.equal(personalHost?.href, HOSTING_OVERVIEW_PATH);
  assert.equal(
    hostingOrganisationContextName({
      organisationId: null,
      organisations: [{ id: ORG, name: "Paarl Girls' High" }],
    }),
    null
  );

  const dualSummary = summarizeHostingAccess(
    hostingInput({
      ownedSpaceCount: 1,
      grants: [smGrant],
    })
  );
  assert.equal(dualSummary.hasHostingAccess, true);
  assert.equal(dualSummary.isLegacyHost, true);
  assert.equal(dualSummary.isSpaceManager, true);
  const dualPersonal = computeAccess(
    accessCtx({
      spaceId: "personal-space",
      spaceOwnerId: USER,
      grants: [smGrant],
    })
  );
  const dualClassroom2 = computeAccess(
    accessCtx({
      spaceId: CLASSROOM_2,
      spaceOwnerId: null,
      grants: [smGrant],
    })
  );
  assert.equal(dualPersonal.canEditSpace, true);
  assert.equal(dualClassroom2.canEditSpace, false);
  assert.equal(
    workspaceSwitch({
      kind: "hosting",
      hasHostingAccess: dualSummary.hasHostingAccess,
      organisationId: ORG,
    })?.href,
    BOOKING_HREF
  );

  for (const summary of [oaSummary, pmSummary, legacySummary, gaSummary]) {
    assert.equal(summary.hasHostingAccess, true);
    assert.equal(
      workspaceSwitch({
        kind: "booking",
        hasHostingAccess: summary.hasHostingAccess,
        organisationId: summary.primaryOrganisationId,
      })?.label,
      SWITCH_TO_HOSTING_LABEL
    );
    assert.equal(
      workspaceSwitch({
        kind: "hosting",
        hasHostingAccess: summary.hasHostingAccess,
        organisationId: summary.primaryOrganisationId,
      })?.href,
      BOOKING_HREF
    );
  }

  assert.match(dashboard, /workspaceLabel="Booking"/);
  assert.match(dashboard, /Manage your bookings, messages and payments/);
  assert.match(dashboardShell, /useWorkspaceChrome/);
  assert.match(dashboardShell, /WorkspaceSwitch/);
  assert.match(workspaceChrome, /fetchHostingWorkspaceDisplay/);
  assert.match(workspaceChrome, /resolveHostingOrganisationId/);
  assert.match(workspaceChrome, /hostingOrganisationContextName/);
  assert.doesNotMatch(workspaceChrome, /is_host/);
  assert.match(workspaceSwitchUi, /aria-label="Workspace"/);
  assert.match(accessSummaryRoute, /loadHostingOrganisationNames/);
  assert.match(loadHosting, /loadHostingOrganisationNames/);
  assert.doesNotMatch(hostingHelper, /organisationNames/);
  assert.match(people, /shouldShowOrganisationSelector/);
  assert.doesNotMatch(dashboard, /Switch to Hosting/);
  assert.doesNotMatch(dashboardShell, /Switch to Hosting/);
  assert.doesNotMatch(dashboardShell, /Switch to Booking/);
  assert.doesNotMatch(workspaceSwitchUi, /Switch to Hosting/);
  assert.match(owner, /pageTitle="Overview"/);
  assert.match(owner, /useHostingWorkspace\(requestedOrganisationId\)/);
  assert.match(owner, /hostingOverviewVerificationKind/);
  assert.doesNotMatch(owner, /Host dashboard/);
  assert.equal(smSummary.isSpaceManager, true);
  assert.equal(navHrefs(smSummary).includes("/dashboard/people"), false);
}

// Segmented Booking | Hosting selector
{
  const smBookingSelector = workspaceSelector({
    kind: "booking",
    hasHostingAccess: smSummary.hasHostingAccess,
    organisationId: ORG,
  });
  assert.equal(smBookingSelector.visible, true);
  assert.equal(smBookingSelector.active, "booking");
  assert.equal(smBookingSelector.bookingHref, BOOKING_HREF);
  assert.equal(
    smBookingSelector.hostingHref,
    `${HOSTING_OVERVIEW_PATH}?organisation=${ORG}`
  );

  const smHostingSelector = workspaceSelector({
    kind: "hosting",
    hasHostingAccess: smSummary.hasHostingAccess,
    organisationId: ORG,
  });
  assert.equal(smHostingSelector.visible, true);
  assert.equal(smHostingSelector.active, "hosting");
  assert.equal(smHostingSelector.bookingHref, BOOKING_HREF);

  const renterSelector = workspaceSelector({
    kind: "booking",
    hasHostingAccess: renterSummary.hasHostingAccess,
    organisationId: ORG,
  });
  assert.equal(renterSummary.hasHostingAccess, false);
  assert.equal(renterSelector.visible, false);

  const personalSelector = workspaceSelector({
    kind: "booking",
    hasHostingAccess: legacySummary.hasHostingAccess,
    organisationId: null,
  });
  assert.equal(legacySummary.isLegacyHost, true);
  assert.equal(personalSelector.visible, true);
  assert.equal(personalSelector.hostingHref, HOSTING_OVERVIEW_PATH);

  assert.equal(smSummary.isLegacyHost, false);
  assert.equal(smSummary.hasHostingAccess, true);

  const classroom1 = computeAccess(
    accessCtx({
      spaceId: CLASSROOM_1,
      grants: [smGrant],
    })
  );
  const classroom2 = computeAccess(
    accessCtx({
      spaceId: CLASSROOM_2,
      spaceOwnerId: null,
      grants: [smGrant],
    })
  );
  assert.equal(classroom1.canEditSpace, true);
  assert.equal(classroom2.canEditSpace, false);

  assert.match(workspaceSwitchUi, /aria-label="Workspace"/);
  assert.match(workspaceSwitchUi, /aria-current="true"/);
  assert.match(workspaceSwitchUi, /BOOKING_WORKSPACE_LABEL/);
  assert.match(workspaceSwitchUi, /HOSTING_WORKSPACE_LABEL/);
  assert.doesNotMatch(workspaceSwitchUi, /→/);
  assert.match(dashboardShell, /chrome\.selector/);
  assert.match(dashboardShell, /sm:justify-between/);
  assert.match(dashboardShell, /self-end sm:self-auto/);
  assert.match(workspaceChrome, /workspaceSelector/);
  assert.doesNotMatch(workspaceChrome, /is_host/);
  assert.match(people, /We&apos;ll[\s\S]*send them an invitation/);
  assert.match(people, /accept the[\s\S]*invitation/);
}

console.log("test-hosting-access: all assertions passed");
