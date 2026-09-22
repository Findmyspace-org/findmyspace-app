#!/usr/bin/env node
/**
 * Organisation commercial verification (069) — helpers + source contracts.
 * Does not apply migrations or write production data.
 * Run: npm run test:organisation-commercial
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveCommercialBeneficiary,
  snapshotBookingBeneficiary,
} from "../lib/access/commercial-beneficiary";
import { resolveOrganisationBookingReadiness } from "../lib/access/organisation-booking-readiness";
import { resolveOrganisationPayoutReadiness } from "../lib/access/organisation-payout-readiness";
import { computeAccess } from "../lib/access/compute-access";
import { summarizeHostingAccess } from "../lib/access/hosting-access";
import { hostingNavItems } from "../lib/dashboard-nav";
import {
  canOpenOrganisationListingContext,
  listSpaceChooserOptions,
  listSpaceDeniedMessage,
  organisationListingDeniedHref,
  organisationListingHref,
  personalListingHref,
} from "../lib/list-space-chooser";
import { hasAdminUiAccess } from "../lib/client-admin-access";
import { toMaskedBankDto } from "../lib/organisation-commercial-dto";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";

const ORG = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const ORG_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROP = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";
const CLASSROOM_1 = "cd1ebdff-0259-4185-8a0c-ac2892f03778";
const OWNER = "11111111-1111-4111-8111-111111111111";
const SM = "5860f254-26e9-4f7f-8760-3fd69bd9fff3";
const OA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const GA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

function grant(
  partial: Partial<OrganisationAccessGrant> & Pick<OrganisationAccessGrant, "role" | "status">
): OrganisationAccessGrant {
  return {
    organisationId: partial.organisationId ?? ORG,
    role: partial.role,
    propertyId: partial.propertyId ?? null,
    spaceId: partial.spaceId ?? null,
    status: partial.status,
  };
}

function accessCtx(partial: Partial<AccessContext>): AccessContext {
  return {
    userId: partial.userId ?? OA,
    spaceId: partial.spaceId ?? CLASSROOM_1,
    propertyId: partial.propertyId ?? PROP,
    organisationId: partial.organisationId ?? ORG,
    spaceOwnerId: partial.spaceOwnerId ?? null,
    propertyOwnerId: partial.propertyOwnerId ?? OWNER,
    profileRole: partial.profileRole ?? "user",
    adminAccessDisabled: partial.adminAccessDisabled ?? false,
    grants: partial.grants ?? [],
  };
}

{
  const personal = resolveCommercialBeneficiary({
    propertyOrganisationId: null,
    spaceOwnerId: OWNER,
    propertyOwnerId: OWNER,
  });
  assert.equal(personal.type, "personal");
  assert.equal(personal.userId, OWNER);

  const orgNullOwner = resolveCommercialBeneficiary({
    propertyOrganisationId: ORG,
    spaceOwnerId: null,
    propertyOwnerId: OWNER,
  });
  assert.equal(orgNullOwner.type, "organisation");
  assert.equal(orgNullOwner.organisationId, ORG);

  const orgLegacyPropertyOwner = resolveCommercialBeneficiary({
    propertyOrganisationId: ORG,
    spaceOwnerId: null,
    propertyOwnerId: OWNER,
  });
  assert.equal(orgLegacyPropertyOwner.type, "organisation");

  const orgWithSpaceOwner = resolveCommercialBeneficiary({
    propertyOrganisationId: ORG,
    spaceOwnerId: OWNER,
    propertyOwnerId: OWNER,
  });
  assert.equal(orgWithSpaceOwner.type, "organisation");
  assert.equal(orgWithSpaceOwner.userId, null);

  const unassigned = resolveCommercialBeneficiary({
    propertyOrganisationId: null,
    spaceOwnerId: null,
    propertyOwnerId: OWNER,
  });
  assert.equal(unassigned.type, "none");
}

{
  for (const userId of [SM, PM, OA, GA]) {
    const beneficiary = resolveCommercialBeneficiary({
      propertyOrganisationId: ORG,
      spaceOwnerId: null,
    });
    assert.equal(beneficiary.organisationId, ORG);
    assert.notEqual(userId, beneficiary.organisationId);
  }
}

{
  const pending = resolveOrganisationBookingReadiness({
    organisationId: ORG,
    organisationStatus: "active",
    verificationStatus: "pending",
    commercialProfileExists: true,
    beneficiary: { type: "organisation", userId: null, organisationId: ORG },
  });
  assert.equal(pending.ok, false);

  const rejected = resolveOrganisationBookingReadiness({
    organisationId: ORG,
    organisationStatus: "active",
    verificationStatus: "rejected",
    commercialProfileExists: true,
    beneficiary: { type: "organisation", userId: null, organisationId: ORG },
  });
  assert.equal(rejected.ok, false);

  const verified = resolveOrganisationBookingReadiness({
    organisationId: ORG,
    organisationStatus: "active",
    verificationStatus: "verified",
    commercialProfileExists: true,
    beneficiary: { type: "organisation", userId: null, organisationId: ORG },
  });
  assert.equal(verified.ok, true);
}

{
  assert.equal(
    resolveOrganisationPayoutReadiness({
      organisationStatus: "active",
      verificationStatus: "pending",
      currentBankStatus: null,
    }).code,
    "organisation_unverified"
  );
  assert.equal(
    resolveOrganisationPayoutReadiness({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: null,
    }).code,
    "bank_not_submitted"
  );
  assert.equal(
    resolveOrganisationPayoutReadiness({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: "pending",
    }).code,
    "bank_pending"
  );
  assert.equal(
    resolveOrganisationPayoutReadiness({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: "rejected",
    }).code,
    "bank_rejected"
  );
  assert.equal(
    resolveOrganisationPayoutReadiness({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: "verified",
    }).code,
    "ready"
  );
  assert.equal(
    resolveOrganisationPayoutReadiness({
      organisationStatus: "archived",
      verificationStatus: "verified",
      currentBankStatus: "verified",
    }).code,
    "organisation_archived"
  );
}

{
  const snapshot = snapshotBookingBeneficiary({
    type: "organisation",
    userId: null,
    organisationId: ORG,
  });
  assert.equal(snapshot.commercial_beneficiary_type, "organisation");
  assert.equal(snapshot.commercial_beneficiary_organisation_id, ORG);
  assert.equal(snapshot.commercial_beneficiary_user_id, null);
}

{
  const masked = toMaskedBankDto({
    id: "bank-1",
    organisation_id: ORG,
    version_number: 1,
    is_current: true,
    account_holder_name: "PGH",
    bank_name: "Standard Bank",
    account_type: "cheque",
    branch_code: "051001",
    account_number_last4: "4821",
    proof_of_bank_path: "path",
    status: "pending",
    review_notes: null,
    rejection_reason: null,
    submitted_at: "2026-09-22T00:00:00Z",
    reviewed_at: null,
  });
  assert.equal(masked.account_number_display, "•••• 4821");
  assert.equal("account_number" in masked, false);
}

{
  const oa = computeAccess(
    accessCtx({
      userId: OA,
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  assert.equal(oa.canManageOrganisationFinance, true);
  assert.equal(oa.isOrganisationAdmin, true);

  const sm = computeAccess(
    accessCtx({
      userId: SM,
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP,
          spaceId: CLASSROOM_1,
        }),
      ],
    })
  );
  assert.equal(sm.canManageOrganisationFinance, false);
  assert.equal(sm.isSpaceManager, true);

  const pm = computeAccess(
    accessCtx({
      userId: PM,
      spaceId: null,
      grants: [
        grant({
          role: "property_manager",
          status: "active",
          propertyId: PROP,
        }),
      ],
    })
  );
  assert.equal(pm.canManageOrganisationFinance, false);

  const disabledGa = computeAccess(
    accessCtx({
      userId: GA,
      profileRole: "admin",
      adminAccessDisabled: true,
      grants: [],
    })
  );
  assert.equal(disabledGa.isGlobalAdmin, false);
  assert.equal(disabledGa.canManageOrganisationFinance, false);

  const activeGa = computeAccess(
    accessCtx({
      userId: GA,
      profileRole: "admin",
      adminAccessDisabled: false,
      grants: [],
    })
  );
  assert.equal(activeGa.canManageOrganisationFinance, true);
}

{
  const chooser = listSpaceChooserOptions({
    organisations: [{ id: ORG, name: "Paarl Girls' High" }],
  });
  assert.equal(chooser.myself, true);
  assert.equal(chooser.createOrganisation, true);
  assert.equal(chooser.organisations.length, 1);
  assert.equal(personalListingHref(false), "/dashboard/become-host");
  assert.equal(personalListingHref(true), "/dashboard/new-space");
  assert.match(organisationListingHref(ORG), /organisation=/);

  const empty = listSpaceChooserOptions({ organisations: [] });
  assert.equal(empty.organisations.length, 0);

  const smNav = hostingNavItems(
    summarizeHostingAccess({
      profileRole: "user",
      isHostProfile: false,
      ownedSpaceCount: 0,
      ownedPropertyCount: 0,
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP,
          spaceId: CLASSROOM_1,
        }),
      ],
    })
  ).map((item) => item.href.split("?")[0]);
  assert.equal(smNav.includes("/dashboard/organisation"), false);

  const pmNav = hostingNavItems(
    summarizeHostingAccess({
      profileRole: "user",
      isHostProfile: false,
      ownedSpaceCount: 0,
      ownedPropertyCount: 0,
      grants: [grant({ role: "property_manager", status: "active", propertyId: PROP })],
    })
  ).map((item) => item.href.split("?")[0]);
  assert.equal(pmNav.includes("/dashboard/organisation"), false);

  const oaNav = hostingNavItems(
    summarizeHostingAccess({
      profileRole: "user",
      isHostProfile: false,
      ownedSpaceCount: 0,
      ownedPropertyCount: 0,
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  ).map((item) => item.href.split("?")[0]);
  assert.equal(oaNav.includes("/dashboard/organisation"), true);
}

{
  const sql = readFileSync(
    "supabase/migrations/069_20260922_organisation_commercial_verification.sql",
    "utf8"
  );
  assert.match(sql, /organisation_commercial_profiles/);
  assert.match(sql, /organisation_verification_documents/);
  assert.match(sql, /organisation_bank_accounts/);
  assert.match(sql, /submit_organisation_bank_account/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /organisation_bank_accounts_one_current_uidx/);
  assert.match(sql, /SELECT o\.id, o\.name, 'pending'/);
  assert.doesNotMatch(sql, /Paarl Girls/);
  assert.doesNotMatch(sql, /21cf12c3-3235-4cd3-8106-801d120dc7b5/);
  assert.doesNotMatch(sql, /UPDATE public\.spaces SET owner_id/);
  assert.doesNotMatch(sql, /UPDATE public\.properties SET owner_id/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.organisation_bank_accounts FROM authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.submit_organisation_bank_account/);
  assert.match(sql, /TO service_role/);
  assert.match(sql, /commercial_beneficiary_type = 'personal'/);
  assert.match(sql, /organisation-verification/);
  assert.match(sql, /organisation-bank-proofs/);
}

{
  const create = readFileSync("lib/booking-request-server.ts", "utf8");
  assert.match(create, /resolveCommercialBeneficiary/);
  assert.match(create, /NO_COMMERCIAL_BENEFICIARY_ERROR/);
  assert.doesNotMatch(create, /propertyRow\?\.owner_id/);
  const payfastInitiate = readFileSync("app/api/payfast/initiate/route.ts", "utf8");
  const payfastNotify = readFileSync("app/api/payfast/notify/route.ts", "utf8");
  assert.doesNotMatch(payfastInitiate, /organisation_commercial_profiles/);
  assert.doesNotMatch(payfastNotify, /organisation_commercial_profiles/);
  assert.doesNotMatch(payfastInitiate, /organisation_bank_accounts/);
  assert.doesNotMatch(payfastNotify, /organisation_bank_accounts/);
}

{
  const header = readFileSync("app/components/Header.tsx", "utf8");
  assert.match(header, /setAuthNextPath\("\/dashboard\/list-space"\)/);
  assert.match(header, /window\.location\.href = "\/dashboard\/list-space"/);

  const listSpace = readFileSync("app/dashboard/list-space/page.tsx", "utf8");
  assert.match(listSpace, /Who are you listing this space for/);
  assert.match(listSpace, /Create an organisation/);
  assert.match(listSpace, /Myself/);

  const orgCreate = readFileSync("lib/organisation-create.ts", "utf8");
  assert.doesNotMatch(orgCreate, /is_host/);
  assert.match(orgCreate, /verification_status: "pending"/);
  assert.match(orgCreate, /role: "org_admin"/);

  const bankGet = readFileSync(
    "app/api/organisations/[organisationId]/bank/route.ts",
    "utf8"
  );
  assert.match(bankGet, /loadMaskedOrganisationBank/);
  assert.doesNotMatch(bankGet, /account_number,/);

  const adminBank = readFileSync(
    "app/api/admin/organisations/[organisationId]/bank/route.ts",
    "utf8"
  );
  assert.match(adminBank, /loadAdminOrganisationBank/);
  assert.match(adminBank, /requireActivePlatformAdminApi/);

  const commercialApi = readFileSync(
    "lib/access/require-org-commercial-api.ts",
    "utf8"
  );
  assert.match(commercialApi, /canManageOrganisationFinance/);

  const adminOrgsPage = readFileSync(
    "app/admin/verification/organisations/page.tsx",
    "utf8"
  );
  assert.match(adminOrgsPage, /useAdminRole/);
  assert.match(adminOrgsPage, /isAdmin/);
  assert.doesNotMatch(adminOrgsPage, /select\("role"\)/);
  assert.doesNotMatch(adminOrgsPage, /hasAdminUiAccess\(nextRole\)/);
  assert.doesNotMatch(adminOrgsPage, /hasAdminUiAccess\(role\)/);
}

{
  assert.equal(hasAdminUiAccess("admin", false), true);
  assert.equal(hasAdminUiAccess("super_admin", false), true);
  assert.equal(hasAdminUiAccess("admin", true), false);
  assert.equal(hasAdminUiAccess("super_admin", true), false);
  assert.equal(hasAdminUiAccess("user", false), false);
  assert.equal(hasAdminUiAccess("user", true), false);

  const oa = computeAccess(
    accessCtx({
      userId: OA,
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  assert.equal(oa.isGlobalAdmin, false);
  assert.equal(oa.isOrganisationAdmin, true);
  assert.equal(hasAdminUiAccess("user", false), false);

  const sm = computeAccess(
    accessCtx({
      userId: SM,
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP,
          spaceId: CLASSROOM_1,
        }),
      ],
    })
  );
  assert.equal(sm.isGlobalAdmin, false);
  assert.equal(sm.canManageOrganisationFinance, false);

  const pm = computeAccess(
    accessCtx({
      userId: PM,
      spaceId: null,
      grants: [
        grant({
          role: "property_manager",
          status: "active",
          propertyId: PROP,
        }),
      ],
    })
  );
  assert.equal(pm.isGlobalAdmin, false);
  assert.equal(pm.canManageOrganisationFinance, false);

  const disabledGaWithOa = computeAccess(
    accessCtx({
      userId: GA,
      profileRole: "admin",
      adminAccessDisabled: true,
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  assert.equal(disabledGaWithOa.isGlobalAdmin, false);
  assert.equal(disabledGaWithOa.isOrganisationAdmin, true);
  assert.equal(disabledGaWithOa.canManageOrganisationFinance, true);
  assert.equal(disabledGaWithOa.canManagePeopleAccess, true);
  assert.equal(hasAdminUiAccess("admin", true), false);
}

{
  const oaAllowed = [ORG];
  assert.equal(
    canOpenOrganisationListingContext({
      requestedOrganisationId: ORG,
      allowedOrganisationIds: oaAllowed,
    }),
    true
  );
  assert.equal(
    canOpenOrganisationListingContext({
      requestedOrganisationId: ORG_B,
      allowedOrganisationIds: oaAllowed,
    }),
    false
  );

  const gaAllowed = [ORG, ORG_B];
  assert.equal(
    canOpenOrganisationListingContext({
      requestedOrganisationId: ORG,
      allowedOrganisationIds: gaAllowed,
    }),
    true
  );

  assert.equal(
    canOpenOrganisationListingContext({
      requestedOrganisationId: ORG,
      allowedOrganisationIds: [],
    }),
    false
  );

  const disabledGaOaAllowed = [ORG];
  assert.equal(
    canOpenOrganisationListingContext({
      requestedOrganisationId: ORG,
      allowedOrganisationIds: disabledGaOaAllowed,
    }),
    true
  );

  assert.equal(personalListingHref(false), "/dashboard/become-host");
  assert.equal(personalListingHref(true), "/dashboard/new-space");
  assert.equal(
    organisationListingDeniedHref(),
    "/dashboard/list-space?denied=organisation-context"
  );
  assert.match(
    listSpaceDeniedMessage("organisation-context") || "",
    /don't have access to list a space for that organisation/
  );

  const newSpace = readFileSync("app/dashboard/new-space/page.tsx", "utf8");
  assert.match(newSpace, /fetchManageableOrganisations/);
  assert.match(newSpace, /canOpenOrganisationListingContext/);
  assert.match(newSpace, /organisationListingDeniedHref/);
  assert.match(newSpace, /authorizedOrganisationId/);
  assert.match(newSpace, /!organisationId && !profile\?\.is_host/);
  assert.doesNotMatch(newSpace, /if \(organisationId && !profile\?\.is_host\)/);

  const listSpace = readFileSync("app/dashboard/list-space/page.tsx", "utf8");
  assert.match(listSpace, /listSpaceDeniedMessage/);
}

{
  const spaceForm = readFileSync("app/components/SpaceForm.tsx", "utf8");
  assert.match(spaceForm, /organisationId/);
  assert.match(spaceForm, /createOrganisationListingRequest/);
  const listingServer = readFileSync("lib/organisation-commercial-server.ts", "utf8");
  assert.match(listingServer, /owner_id: null/);
}

console.log("organisation commercial tests passed");
