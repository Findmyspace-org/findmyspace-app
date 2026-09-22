#!/usr/bin/env node
/**
 * Hosting workspace presentation contracts.
 * Run: npm run test:hosting-workspace-ui
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hostingNavItems } from "../lib/dashboard-nav";
import { summarizeHostingAccess } from "../lib/access/hosting-access";
import type { OrganisationAccessGrant } from "../lib/access/roles";
import {
  hostingOverviewOpsItems,
  hostingOverviewSummaryItems,
} from "../lib/hosting-overview-layout";

const ORG = "21cf12c3-3235-4cd3-8106-801d120dc7b5";

const shell = readFileSync("app/components/DashboardShell.tsx", "utf8");
const owner = readFileSync("app/dashboard/owner/page.tsx", "utf8");
const listings = readFileSync("app/dashboard/listings/page.tsx", "utf8");
const header = readFileSync("app/components/Header.tsx", "utf8");
const ui = readFileSync("app/components/hosting/hosting-ui.tsx", "utf8");

{
  assert.match(shell, /pageActions/);
  assert.match(shell, /workspaceKind === "hosting"/);
  assert.match(shell, /truncate/);
  assert.doesNotMatch(shell, /icon-only/);
  assert.match(ui, /HostingSummaryStrip/);
  assert.match(ui, /HostingWorkspaceRow/);
  assert.match(ui, /HostingOpsStrip/);
  assert.match(owner, /HostingSummaryStrip/);
  assert.doesNotMatch(owner, /host-overview-tools/);
  assert.doesNotMatch(owner, /List a space/);
  assert.doesNotMatch(owner, /pageActions/);
  assert.match(header, /List space/);
  assert.match(listings, /verificationKind === "personal" \? <OwnerVerificationAlerts/);
  assert.doesNotMatch(listings, /isHost && <OwnerVerificationAlerts/);
  assert.doesNotMatch(listings, /fetchOrganisationCommercial/);
  assert.match(listings, /fetchManagedSpaces\(/);
  assert.match(listings, /requestedOrganisationId/);
}

{
  const oa = summarizeHostingAccess({
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
      } satisfies OrganisationAccessGrant,
    ],
  });
  const items = hostingNavItems(oa, ORG);
  assert.equal(items.every((item) => item.label.trim().length > 0), true);
  assert.equal(items.some((item) => item.label === "Organisation"), true);
  assert.equal(items.some((item) => item.label === "People"), true);
}

{
  const sm = summarizeHostingAccess({
    profileRole: "user",
    isHostProfile: false,
    ownedSpaceCount: 0,
    ownedPropertyCount: 0,
    grants: [
      {
        organisationId: ORG,
        role: "space_manager",
        propertyId: "prop",
        spaceId: "space",
        status: "active",
      } satisfies OrganisationAccessGrant,
    ],
  });
  const summary = hostingOverviewSummaryItems({
    pendingRequestsCount: 0,
    pendingQuestionsCount: 0,
    monthlyIncomeLabel: "R 1",
    activeListingsCount: 1,
    pendingListingApprovalCount: 0,
    showFinance: sm.showFinance,
    requestsHref: "/r",
    commsHref: "/c",
    financeHref: "/f",
    listingsHref: "/l",
  });
  assert.equal(summary.some((item) => item.label === "Revenue"), false);
  const ops = hostingOverviewOpsItems({
    awaitingPaymentCount: 0,
    confirmedBookingsCount: 0,
    requestsHref: "/r",
    calendarHref: "/c",
    organisationCard: null,
    personalVerification: null,
  });
  assert.equal(ops.some((item) => item.label === "Organisation"), false);
}

console.log("test-hosting-workspace-ui: ok");
