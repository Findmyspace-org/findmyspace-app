#!/usr/bin/env node
/**
 * Contextual verification display — application-only.
 * Does not mutate profiles, listings, payments, or schema.
 * Run: npm run test:verification-display
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import {
  summarizeHostingAccess,
  type HostingAccessInput,
} from "../lib/access/hosting-access";
import { hostingNavItems } from "../lib/dashboard-nav";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import { computeHostActionCards } from "../lib/host-action-required";
import {
  listingVerificationDisplayContext,
  operatorHasPersonalVerificationResponsibility,
  ORGANISATION_MANAGED_VERIFICATION_LABEL,
  showsPersonalVerificationUi,
  verificationFieldsForManagedListing,
} from "../lib/verification-display-context";

const USER = "5860f254-26e9-4f7f-8760-3fd69bd9fff3";
const ORG = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const PROP = "prop-pgh";
const CLASSROOM_1 = "cd1ebdff-0259-4185-8a0c-ac2892f03778";
const CLASSROOM_2 = "2add6853-3b32-450e-a4ba-42c0b6e5f47f";
const PRIVATE_VENUE = "aaaa1111-2222-4333-8444-555566667777";

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

const smGrant = grant({
  role: "space_manager",
  status: "active",
  propertyId: PROP,
  spaceId: CLASSROOM_1,
});
const pmGrant = grant({
  role: "property_manager",
  status: "active",
  propertyId: PROP,
});
const oaGrant = grant({ role: "org_admin", status: "active" });

const pendingProfile = {
  owner_verification_status: "pending",
  bank_verification_status: "pending",
};

function orgManagerCards() {
  return computeHostActionCards({
    profile: pendingProfile,
    hasIdFront: false,
    hasIdBack: false,
    bankProofExists: false,
    spaces: [],
    ownershipDocSpaceIds: new Set(),
    includePersonalVerification: false,
  });
}

const listingsSrc = readFileSync("app/dashboard/listings/page.tsx", "utf8");
const editorSrc = readFileSync("app/spaces/[id]/edit/page.tsx", "utf8");
const ownerSrc = readFileSync("app/dashboard/owner/page.tsx", "utf8");
const tableSrc = readFileSync(
  "app/components/owner/OwnerSpacesTable.tsx",
  "utf8"
);
const hostActionSrc = readFileSync("lib/host-action-required.ts", "utf8");
const fetchActionSrc = readFileSync("lib/fetch-host-action-input.ts", "utf8");
const helperSrc = readFileSync("lib/verification-display-context.ts", "utf8");
const hostingHelperSrc = readFileSync("lib/access/hosting-access.ts", "utf8");
const hostListingApi = readFileSync(
  "app/api/host/listings/[id]/route.ts",
  "utf8"
);
const payfastShared = readFileSync("lib/payfast-initiate-shared.ts", "utf8");
const payfastRoute = readFileSync("app/api/payfast/initiate/route.ts", "utf8");

// 1. Classroom #1 organisation context — no personal Identity Required card
{
  const context = listingVerificationDisplayContext({
    organisationId: ORG,
    ownerId: null,
    currentUserId: USER,
  });
  assert.equal(context, "organisation_managed");
  const cards = orgManagerCards();
  assert.equal(
    cards.some((card) => card.id === "identity"),
    false
  );
}

// 2. Same — no personal Bank Required card
{
  const cards = orgManagerCards();
  assert.equal(
    cards.some((card) => card.id === "bank"),
    false
  );
}

// 3. Same — no Owner/Bank/Proof pending badges attributed to the manager
{
  const fields = verificationFieldsForManagedListing({
    organisationId: ORG,
    ownerId: null,
    currentUserId: USER,
    operatorOwnerVerificationStatus: "pending",
    operatorBankVerificationStatus: "pending",
    listingOwnershipProofStatus: "pending",
  });
  assert.equal(fields.verification_display_context, "organisation_managed");
  assert.equal(fields.owner_verification_status, null);
  assert.equal(fields.bank_verification_status, null);
  assert.equal(fields.ownership_proof_status, null);
  assert.equal(showsPersonalVerificationUi(fields.verification_display_context), false);
  assert.match(listingsSrc, /verificationFieldsForManagedListing/);
  assert.match(tableSrc, /ORGANISATION_MANAGED_VERIFICATION_LABEL/);
  assert.equal(ORGANISATION_MANAGED_VERIFICATION_LABEL, "Managed by organisation");
}

// 4. Space Manager can still edit Classroom #1
{
  const allow = computeAccess(
    accessCtx({
      spaceId: CLASSROOM_1,
      grants: [smGrant],
    })
  );
  assert.equal(allow.canEditSpace, true);
  assert.equal(allow.canViewSpace, true);
}

// 5. Classroom #2 remains denied
{
  const deny = computeAccess(
    accessCtx({
      spaceId: CLASSROOM_2,
      grants: [smGrant],
    })
  );
  assert.equal(deny.canEditSpace, false);
  assert.equal(deny.canViewSpace, false);
}

// 6. Property Manager gets equivalent contextual treatment
{
  const pmFields = verificationFieldsForManagedListing({
    organisationId: ORG,
    ownerId: null,
    currentUserId: USER,
    operatorOwnerVerificationStatus: "pending",
    operatorBankVerificationStatus: "pending",
    listingOwnershipProofStatus: "pending",
  });
  assert.equal(pmFields.verification_display_context, "organisation_managed");
  assert.equal(showsPersonalVerificationUi(pmFields.verification_display_context), false);
  assert.equal(
    operatorHasPersonalVerificationResponsibility({
      isHostProfile: false,
      ownedSpaceCount: 0,
      ownedPropertyCount: 0,
    }),
    false
  );
  const pmSummary = summarizeHostingAccess(
    hostingInput({ grants: [pmGrant] })
  );
  assert.equal(pmSummary.isPropertyManager, true);
  assert.equal(pmSummary.isLegacyHost, false);
  assert.equal(pmSummary.showVerification, false);
  const pmCards = orgManagerCards();
  assert.equal(pmCards.some((card) => card.id === "identity"), false);
  assert.equal(pmCards.some((card) => card.id === "bank"), false);
}

// 7. Organisation Admin personal profile is not presented as Organisation verification
{
  const oaFields = verificationFieldsForManagedListing({
    organisationId: ORG,
    ownerId: null,
    currentUserId: USER,
    operatorOwnerVerificationStatus: "verified",
    operatorBankVerificationStatus: "verified",
    listingOwnershipProofStatus: "verified",
  });
  assert.equal(oaFields.verification_display_context, "organisation_managed");
  assert.equal(oaFields.owner_verification_status, null);
  assert.equal(oaFields.bank_verification_status, null);
  assert.doesNotMatch(helperSrc, /"verified"/);
  const oaSummary = summarizeHostingAccess(
    hostingInput({ grants: [oaGrant] })
  );
  assert.equal(oaSummary.isOrganisationAdmin, true);
  assert.equal(oaSummary.isLegacyHost, false);
  assert.equal(oaSummary.showVerification, false);
  const oaNav = hostingNavItems(oaSummary).map((item) => item.href.split("?")[0]);
  assert.equal(oaNav.includes("/dashboard/verification"), false);
}

// 8. Legacy personal host still gets existing personal verification requirements
{
  const personal = verificationFieldsForManagedListing({
    organisationId: null,
    ownerId: USER,
    currentUserId: USER,
    operatorOwnerVerificationStatus: "pending",
    operatorBankVerificationStatus: "pending",
    listingOwnershipProofStatus: "pending",
  });
  assert.equal(personal.verification_display_context, "personal_host");
  assert.equal(personal.owner_verification_status, "pending");
  assert.equal(personal.bank_verification_status, "pending");
  assert.equal(personal.ownership_proof_status, "pending");
  assert.equal(showsPersonalVerificationUi(personal.verification_display_context), true);

  const legacyCards = computeHostActionCards({
    profile: pendingProfile,
    hasIdFront: false,
    hasIdBack: false,
    bankProofExists: false,
    spaces: [
      {
        id: PRIVATE_VENUE,
        title: "Private Venue X",
        ownership_proof_status: "pending",
        status: "active",
      },
    ],
    ownershipDocSpaceIds: new Set(),
    includePersonalVerification: true,
  });
  assert.equal(legacyCards.some((card) => card.id === "identity"), true);
  assert.equal(legacyCards.some((card) => card.id === "bank"), true);
  const identity = legacyCards.find((card) => card.id === "identity");
  assert.equal(identity?.status, "required");
  assert.equal(identity?.href, "/dashboard/verification?step=identity");

  const legacySummary = summarizeHostingAccess(
    hostingInput({ isHostProfile: true, ownedSpaceCount: 1 })
  );
  assert.equal(legacySummary.showVerification, true);
  assert.equal(
    hostingNavItems(legacySummary)
      .map((item) => item.href.split("?")[0])
      .includes("/dashboard/verification"),
    true
  );
}

// 9. Dual-role: org listing suppresses personal requirements; personal listing retains them
{
  const orgListing = verificationFieldsForManagedListing({
    organisationId: ORG,
    ownerId: null,
    currentUserId: USER,
    operatorOwnerVerificationStatus: "pending",
    operatorBankVerificationStatus: "pending",
    listingOwnershipProofStatus: "pending",
  });
  const personalListing = verificationFieldsForManagedListing({
    organisationId: null,
    ownerId: USER,
    currentUserId: USER,
    operatorOwnerVerificationStatus: "pending",
    operatorBankVerificationStatus: "pending",
    listingOwnershipProofStatus: "missing",
  });
  assert.equal(orgListing.verification_display_context, "organisation_managed");
  assert.equal(orgListing.owner_verification_status, null);
  assert.equal(personalListing.verification_display_context, "personal_host");
  assert.equal(personalListing.ownership_proof_status, "missing");
  assert.equal(
    operatorHasPersonalVerificationResponsibility({
      isHostProfile: false,
      ownedSpaceCount: 1,
      ownedPropertyCount: 0,
    }),
    true
  );
  assert.equal(
    operatorHasPersonalVerificationResponsibility({
      isHostProfile: false,
      ownedSpaceCount: 0,
      ownedPropertyCount: 0,
    }),
    false
  );
  const dualSummary = summarizeHostingAccess(
    hostingInput({
      grants: [smGrant],
      ownedSpaceCount: 1,
      isHostProfile: false,
    })
  );
  assert.equal(dualSummary.hasHostingAccess, true);
  assert.equal(dualSummary.isSpaceManager, true);
  assert.equal(dualSummary.isLegacyHost, true);
  assert.equal(dualSummary.showVerification, true);
}

// 10. Helper / UI does not mutate verification state
{
  assert.match(helperSrc, /never the operator's/);
  assert.doesNotMatch(helperSrc, /\.update\(/);
  assert.doesNotMatch(fetchActionSrc, /\.update\(/);
  assert.doesNotMatch(hostActionSrc, /\.update\(/);
  assert.doesNotMatch(listingsSrc, /owner_verification_status:\s*\n\s*profileData/);
  assert.match(fetchActionSrc, /operatorHasPersonalVerificationResponsibility/);
  assert.match(hostActionSrc, /includePersonalVerification/);
  assert.match(editorSrc, /listingVerificationDisplayContext/);
  assert.match(editorSrc, /showPersonalVerificationUi/);
  assert.match(ownerSrc, /isLegacyHost \? <OwnerVerificationAlerts/);
  assert.match(hostListingApi, /organisation_id: organisationId/);
}

// 11. No payment / payout behaviour changes
{
  assert.doesNotMatch(payfastShared, /verification-display-context/);
  assert.doesNotMatch(payfastRoute, /verification-display-context/);
  assert.doesNotMatch(payfastShared, /owner_verification_status/);
  assert.doesNotMatch(payfastRoute, /owner_bank_details/);
  assert.doesNotMatch(helperSrc, /PAYFAST/);
  assert.doesNotMatch(helperSrc, /payout/);
}

// Source: organisation grants are not a global hide
{
  assert.match(helperSrc, /Organisation grants alone must never flip this on/);
  assert.doesNotMatch(
    helperSrc,
    /if \(hasOrganisationAccess\)/
  );
  assert.equal(
    listingVerificationDisplayContext({
      organisationId: null,
      ownerId: USER,
      currentUserId: USER,
    }),
    "personal_host"
  );
}

// No migration 069
{
  const migrations = readdirSync("supabase/migrations");
  assert.equal(
    migrations.some((name) => name.startsWith("069_")),
    false
  );
  assert.equal(existsSync("supabase/migrations/069_20260921_organisation_verification.sql"), false);
}

console.log("test-verification-display: all assertions passed");
