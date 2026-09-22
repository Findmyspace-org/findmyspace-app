#!/usr/bin/env node
/**
 * Hosting Overview commercial card follows the active Hosting context.
 * Does not apply migrations or write production data.
 * Run: npm run test:hosting-overview-commercial
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveOrganisationPayoutReadiness } from "../lib/access/organisation-payout-readiness";
import { summarizeHostingAccess } from "../lib/access/hosting-access";
import { computeAccess } from "../lib/access/compute-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import {
  hostingOverviewVerificationKind,
  hostingOverviewVerificationTool,
  organisationOverviewCard,
} from "../lib/hosting-overview-commercial";
import {
  hostingOverviewOpsItems,
  hostingOverviewSummaryItems,
} from "../lib/hosting-overview-layout";

const ORG_A = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const ORG_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROP = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";
const SPACE = "cd1ebdff-0259-4185-8a0c-ac2892f03778";
const SM = "5860f254-26e9-4f7f-8760-3fd69bd9fff3";
const PM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const GA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

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

function payout(input: {
  organisationStatus?: string | null;
  organisationArchivedAt?: string | null;
  verificationStatus: string | null;
  currentBankStatus?: string | null;
}) {
  return resolveOrganisationPayoutReadiness({
    organisationStatus: input.organisationStatus ?? "active",
    organisationArchivedAt: input.organisationArchivedAt ?? null,
    verificationStatus: input.verificationStatus,
    currentBankStatus: input.currentBankStatus ?? null,
  });
}

function card(
  organisationId: string,
  input: Parameters<typeof payout>[0] & {
    verificationSubmittedAt?: string | null;
    verificationRejectionReason?: string | null;
  }
) {
  return organisationOverviewCard({
    organisationId,
    payout: payout(input),
    verificationStatus: input.verificationStatus,
    verificationSubmittedAt: input.verificationSubmittedAt ?? null,
    verificationRejectionReason: input.verificationRejectionReason ?? null,
  });
}

const ownerSrc = readFileSync("app/dashboard/owner/page.tsx", "utf8");
const helperSrc = readFileSync("lib/hosting-overview-commercial.ts", "utf8");
const layoutSrc = readFileSync("lib/hosting-overview-layout.ts", "utf8");
const commercialApi = readFileSync(
  "lib/access/require-org-commercial-api.ts",
  "utf8"
);

{
  assert.match(ownerSrc, /useHostingWorkspace\(requestedOrganisationId\)/);
  assert.match(ownerSrc, /ORGANISATION_QUERY_PARAM/);
  assert.match(ownerSrc, /fetchOrganisationCommercial/);
  assert.match(ownerSrc, /hostingOverviewVerificationKind/);
  assert.match(ownerSrc, /hostingOverviewOpsItems/);
  assert.match(ownerSrc, /hostingOverviewSummaryItems/);
  assert.match(ownerSrc, /organisationOverviewCard/);
  assert.match(ownerSrc, /verificationKind === "personal" \? <OwnerVerificationAlerts/);
  assert.doesNotMatch(
    ownerSrc,
    /isLegacyHost \? <OwnerVerificationAlerts/
  );
  assert.match(ownerSrc, /verificationKind === "personal"/);
  assert.match(layoutSrc, /ID verification required/);
  assert.match(layoutSrc, /showFinance/);
  assert.doesNotMatch(ownerSrc, /host-overview-tools/);
  assert.match(helperSrc, /compactPayoutReadinessLabel/);
  assert.match(helperSrc, /OrganisationPayoutReadiness/);
  assert.doesNotMatch(helperSrc, /owner_id/);
  assert.doesNotMatch(helperSrc, /is_host/);
  assert.match(commercialApi, /canManageOrganisationFinance/);
}

// A. Personal host only → personal verification card remains.
{
  const kind = hostingOverviewVerificationKind({
    organisationId: null,
    showOrganisationCommercial: false,
    isLegacyHost: true,
  });
  assert.equal(kind, "personal");
  const tool = hostingOverviewVerificationTool({
    organisationId: null,
    showOrganisationCommercial: false,
    showVerification: true,
  });
  assert.equal(tool?.label, "Verification & settings");
  assert.equal(tool?.href, "/dashboard/verification");
}

// B. Organisation Admin, verified + bank verified → ready, no personal ID warning.
{
  const kind = hostingOverviewVerificationKind({
    organisationId: ORG_A,
    showOrganisationCommercial: true,
    isLegacyHost: false,
  });
  assert.equal(kind, "organisation");
  const ready = card(ORG_A, {
    verificationStatus: "verified",
    currentBankStatus: "verified",
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.value, "Ready");
  assert.equal(ready.title, "Organisation & payouts");
  assert.deepEqual(ready.ticks, [
    "Organisation verified",
    "Bank account verified",
    "Payout ready",
  ]);
  assert.equal(ready.href, `/dashboard/organisation?organisation=${ORG_A}`);
  assert.doesNotMatch(JSON.stringify(ready), /ID verification required/);
  assert.doesNotMatch(JSON.stringify(ready), /Profile & verification/);
  const tool = hostingOverviewVerificationTool({
    organisationId: ORG_A,
    showOrganisationCommercial: true,
    showVerification: false,
  });
  assert.equal(tool?.label, "Verification & payouts");
  assert.equal(tool?.href, ready.href);
}

// C. Organisation Admin, entity verified + bank not submitted.
{
  const missingBank = card(ORG_A, {
    verificationStatus: "verified",
    currentBankStatus: null,
  });
  assert.equal(missingBank.ready, false);
  assert.equal(missingBank.value, "Bank details required");
  assert.match(missingBank.subtitle, /Add bank details and proof of bank/);
  assert.equal(missingBank.highlight, false);
}

// D. Organisation Admin, bank pending.
{
  const pendingBank = card(ORG_A, {
    verificationStatus: "verified",
    currentBankStatus: "pending",
  });
  assert.equal(pendingBank.value, "Bank verification pending");
  assert.match(pendingBank.subtitle, /awaiting review/);
  assert.equal(pendingBank.highlight, false);
}

// E. Organisation Admin, bank rejected.
{
  const rejectedBank = card(ORG_A, {
    verificationStatus: "verified",
    currentBankStatus: "rejected",
  });
  assert.equal(rejectedBank.value, "Bank verification needs attention");
  assert.match(rejectedBank.subtitle, /require attention/);
  assert.equal(rejectedBank.highlight, true);
  assert.equal(rejectedBank.tone, "attention");
}

// F. Organisation entity pending / rejected.
{
  const needsSubmission = card(ORG_A, {
    verificationStatus: "pending",
    currentBankStatus: null,
  });
  assert.equal(needsSubmission.value, "Organisation verification required");
  assert.match(needsSubmission.subtitle, /needs submission/);

  const awaitingReview = card(ORG_A, {
    verificationStatus: "pending",
    currentBankStatus: null,
    verificationSubmittedAt: "2026-09-01T10:00:00.000Z",
  });
  assert.equal(awaitingReview.value, "Organisation verification required");
  assert.match(awaitingReview.subtitle, /awaiting review/);

  const rejectedEntity = card(ORG_A, {
    verificationStatus: "rejected",
    currentBankStatus: null,
    verificationRejectionReason: "Documents incomplete",
  });
  assert.equal(
    rejectedEntity.value,
    "Organisation verification needs attention"
  );
  assert.equal(rejectedEntity.subtitle, "Documents incomplete");
  assert.equal(rejectedEntity.highlight, true);
}

// G. Dual-role: personal incomplete + organisation ready stay isolated.
{
  const orgWorkspace = hostingOverviewVerificationKind({
    organisationId: ORG_A,
    showOrganisationCommercial: true,
    isLegacyHost: true,
  });
  const personalWorkspace = hostingOverviewVerificationKind({
    organisationId: null,
    showOrganisationCommercial: true,
    isLegacyHost: true,
  });
  assert.equal(orgWorkspace, "organisation");
  assert.equal(personalWorkspace, "personal");
  const orgReady = card(ORG_A, {
    verificationStatus: "verified",
    currentBankStatus: "verified",
  });
  assert.equal(orgReady.ready, true);
  const orgTool = hostingOverviewVerificationTool({
    organisationId: ORG_A,
    showOrganisationCommercial: true,
    showVerification: true,
  });
  const personalTool = hostingOverviewVerificationTool({
    organisationId: null,
    showOrganisationCommercial: true,
    showVerification: true,
  });
  assert.equal(orgTool?.label, "Verification & payouts");
  assert.equal(personalTool?.label, "Verification & settings");
  assert.equal(personalTool?.href, "/dashboard/verification");
}

// H. Multi-organisation: commercial state follows selected organisationId.
{
  const orgA = card(ORG_A, {
    verificationStatus: "verified",
    currentBankStatus: "verified",
  });
  const orgB = card(ORG_B, {
    verificationStatus: "verified",
    currentBankStatus: null,
  });
  assert.equal(orgA.ready, true);
  assert.equal(orgB.value, "Bank details required");
  assert.equal(orgA.href.includes(ORG_A), true);
  assert.equal(orgB.href.includes(ORG_B), true);
  assert.equal(orgA.href.includes(ORG_B), false);
  assert.equal(orgB.href.includes(ORG_A), false);
  const toolA = hostingOverviewVerificationTool({
    organisationId: ORG_A,
    showOrganisationCommercial: true,
    showVerification: false,
  });
  const toolB = hostingOverviewVerificationTool({
    organisationId: ORG_B,
    showOrganisationCommercial: true,
    showVerification: false,
  });
  assert.equal(toolA?.href, orgA.href);
  assert.equal(toolB?.href, orgB.href);
}

// I. Space Manager → no organisation banking-management capability.
{
  const smSummary = summarizeHostingAccess({
    profileRole: "user",
    adminAccessDisabled: false,
    isHostProfile: false,
    ownedSpaceCount: 0,
    ownedPropertyCount: 0,
    grants: [
      grant({
        role: "space_manager",
        status: "active",
        propertyId: PROP,
        spaceId: SPACE,
      }),
    ],
  });
  assert.equal(smSummary.showOrganisationCommercial, false);
  assert.equal(
    hostingOverviewVerificationKind({
      organisationId: ORG_A,
      showOrganisationCommercial: smSummary.showOrganisationCommercial,
      isLegacyHost: smSummary.isLegacyHost,
    }),
    "none"
  );
  assert.equal(
    hostingOverviewVerificationTool({
      organisationId: ORG_A,
      showOrganisationCommercial: smSummary.showOrganisationCommercial,
      showVerification: smSummary.showVerification,
    }),
    null
  );
  const smAccess = computeAccess({
    userId: SM,
    spaceId: SPACE,
    propertyId: PROP,
    organisationId: ORG_A,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "user",
    adminAccessDisabled: false,
    grants: [
      grant({
        role: "space_manager",
        status: "active",
        propertyId: PROP,
        spaceId: SPACE,
      }),
    ],
  } satisfies AccessContext);
  assert.equal(smAccess.canManageOrganisationFinance, false);
}

// J. Property Manager → no Organisation Admin commercial-management capability.
{
  const pmSummary = summarizeHostingAccess({
    profileRole: "user",
    adminAccessDisabled: false,
    isHostProfile: false,
    ownedSpaceCount: 0,
    ownedPropertyCount: 0,
    grants: [
      grant({
        role: "property_manager",
        status: "active",
        propertyId: PROP,
      }),
    ],
  });
  assert.equal(pmSummary.showOrganisationCommercial, false);
  assert.equal(
    hostingOverviewVerificationKind({
      organisationId: ORG_A,
      showOrganisationCommercial: pmSummary.showOrganisationCommercial,
      isLegacyHost: pmSummary.isLegacyHost,
    }),
    "none"
  );
  assert.equal(
    hostingOverviewVerificationTool({
      organisationId: ORG_A,
      showOrganisationCommercial: pmSummary.showOrganisationCommercial,
      showVerification: pmSummary.showVerification,
    }),
    null
  );
  const pmAccess = computeAccess({
    userId: PM,
    spaceId: SPACE,
    propertyId: PROP,
    organisationId: ORG_A,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "user",
    adminAccessDisabled: false,
    grants: [
      grant({
        role: "property_manager",
        status: "active",
        propertyId: PROP,
      }),
    ],
  } satisfies AccessContext);
  assert.equal(pmAccess.canManageOrganisationFinance, false);
  assert.equal(pmAccess.isOrganisationAdmin, false);
}

// K. Active Global Admin inside organisation Hosting context → organisation state.
{
  const gaSummary = summarizeHostingAccess({
    profileRole: "admin",
    adminAccessDisabled: false,
    isHostProfile: true,
    ownedSpaceCount: 1,
    ownedPropertyCount: 0,
    grants: [grant({ role: "org_admin", status: "active" })],
  });
  assert.equal(gaSummary.isGlobalAdmin, true);
  assert.equal(gaSummary.isLegacyHost, true);
  assert.equal(gaSummary.showOrganisationCommercial, true);
  assert.equal(
    hostingOverviewVerificationKind({
      organisationId: ORG_A,
      showOrganisationCommercial: gaSummary.showOrganisationCommercial,
      isLegacyHost: gaSummary.isLegacyHost,
    }),
    "organisation"
  );
  const gaTool = hostingOverviewVerificationTool({
    organisationId: ORG_A,
    showOrganisationCommercial: gaSummary.showOrganisationCommercial,
    showVerification: gaSummary.showVerification,
  });
  assert.equal(gaTool?.label, "Verification & payouts");
  assert.doesNotMatch(gaTool?.href || "", /\/dashboard\/verification$/);
  const gaAccess = computeAccess({
    userId: GA,
    spaceId: SPACE,
    propertyId: PROP,
    organisationId: ORG_A,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "admin",
    adminAccessDisabled: false,
    grants: [grant({ role: "org_admin", status: "active" })],
  } satisfies AccessContext);
  assert.equal(gaAccess.canManageOrganisationFinance, true);
}

{
  const smSummary = hostingOverviewSummaryItems({
    pendingRequestsCount: 1,
    pendingQuestionsCount: 0,
    monthlyIncomeLabel: "R 10",
    activeListingsCount: 2,
    pendingListingApprovalCount: 0,
    showFinance: false,
    requestsHref: "/dashboard/requests",
    commsHref: "/dashboard/comms?view=hosting",
    financeHref: "/dashboard/finance",
    listingsHref: "/dashboard/listings",
  });
  assert.equal(smSummary.some((item) => item.label === "Revenue"), false);
  assert.equal(smSummary.some((item) => item.label === "Requests"), true);

  const oaOps = hostingOverviewOpsItems({
    awaitingPaymentCount: 0,
    confirmedBookingsCount: 3,
    requestsHref: "/r",
    calendarHref: "/c",
    organisationCard: card(ORG_A, {
      verificationStatus: "verified",
      currentBankStatus: "verified",
    }),
    personalVerification: {
      needsAttention: true,
      href: "/dashboard/verification",
    },
  });
  assert.equal(oaOps.some((item) => item.label === "Organisation"), true);
  assert.equal(oaOps.some((item) => item.label === "Verification"), false);
  assert.equal(oaOps.find((item) => item.label === "Organisation")?.value, "Ready");

  const personalOps = hostingOverviewOpsItems({
    awaitingPaymentCount: 0,
    confirmedBookingsCount: 0,
    requestsHref: "/r",
    calendarHref: "/c",
    organisationCard: null,
    personalVerification: {
      needsAttention: true,
      href: "/dashboard/verification",
    },
  });
  assert.equal(personalOps.at(-1)?.detail, "ID verification required");
}

console.log("test-hosting-overview-commercial: ok");
