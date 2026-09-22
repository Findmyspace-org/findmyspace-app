#!/usr/bin/env node
/**
 * Organisation payout ledger — application-layer contracts.
 * Does not apply migrations or write production data.
 * Run: npm run test:organisation-payout
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import { summarizeHostingAccess } from "../lib/access/hosting-access";
import { resolveOrganisationPayoutReadiness } from "../lib/access/organisation-payout-readiness";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import {
  canShowOrganisationPayoutLedger,
  hasForbiddenOrganisationPayoutWriteKeys,
  isOrganisationBookingPayoutEligible,
  organisationPayoutCanRecord,
  parseRecordOrganisationPayoutBody,
  payoutHistoryExposesFullAccountNumber,
  payoutMoneyEquals,
  stripForbiddenOrganisationPayoutWriteKeys,
  summariseOrganisationPayoutLedger,
  sumOrganisationPayoutItems,
} from "../lib/organisation-payout";

const ORG_A = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const ORG_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const BOOKING_1 = "11111111-1111-4111-8111-111111111111";
const BOOKING_2 = "22222222-2222-4222-8222-222222222222";
const BOOKING_PERSONAL = "33333333-3333-4333-8333-333333333333";
const OA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const SM = "5860f254-26e9-4f7f-8760-3fd69bd9fff3";
const GA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const RENTER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const PROP_A = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";
const SPACE_A = "cd1ebdff-0259-4185-8a0c-ac2892f03778";

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

function accessCtx(partial: Partial<AccessContext>): AccessContext {
  return {
    userId: partial.userId ?? OA,
    spaceId: partial.spaceId ?? SPACE_A,
    propertyId: partial.propertyId ?? PROP_A,
    organisationId: partial.organisationId ?? ORG_A,
    spaceOwnerId: partial.spaceOwnerId ?? null,
    propertyOwnerId: partial.propertyOwnerId ?? null,
    profileRole: partial.profileRole ?? "user",
    adminAccessDisabled: partial.adminAccessDisabled ?? false,
    grants: partial.grants ?? [],
  };
}

function eligibleInput(
  overrides: {
    organisationId?: string;
    pendingChargeCount?: number;
    paidChargeCount?: number;
    alreadyInPayout?: boolean;
    booking?: Partial<
      Parameters<typeof isOrganisationBookingPayoutEligible>[0]["booking"]
    >;
  } = {}
) {
  return {
    organisationId: overrides.organisationId ?? ORG_A,
    booking: {
      id: BOOKING_1,
      commercial_beneficiary_type: "organisation",
      commercial_beneficiary_organisation_id: ORG_A,
      status: "paid_confirmed",
      payment_status: "paid",
      payout_status: "unpaid_to_owner",
      payout_paid_at: null,
      total_price: 1000,
      platform_fee: 70,
      owner_earnings: 930,
      ...(overrides.booking || {}),
    },
    pendingChargeCount: overrides.pendingChargeCount ?? 0,
    paidChargeCount: overrides.paidChargeCount ?? 1,
    alreadyInPayout: overrides.alreadyInPayout ?? false,
  };
}

const migration = readFileSync(
  "supabase/migrations/070_20260922_organisation_payout_ledger.sql",
  "utf8"
);
const helper = readFileSync("lib/organisation-payout.ts", "utf8");
const server = readFileSync("lib/organisation-payout-server.ts", "utf8");
const notify = readFileSync("lib/organisation-payout-notify.ts", "utf8");
const adminApi = readFileSync(
  "app/api/admin/organisations/[organisationId]/payouts/route.ts",
  "utf8"
);
const oaApi = readFileSync(
  "app/api/organisations/[organisationId]/payouts/route.ts",
  "utf8"
);
const adminPanel = readFileSync(
  "app/components/admin/OrganisationPayoutAdminPanel.tsx",
  "utf8"
);
const financePanel = readFileSync(
  "app/components/hosting/OrganisationFinancePayouts.tsx",
  "utf8"
);
const financePage = readFileSync("app/dashboard/finance/page.tsx", "utf8");
const adminOrgsPage = readFileSync(
  "app/admin/verification/organisations/page.tsx",
  "utf8"
);
const payfastNotify = readFileSync("app/api/payfast/notify/route.ts", "utf8");
const payfastInitiate = readFileSync(
  "app/api/payfast/initiate/route.ts",
  "utf8"
);

const oaAccess = computeAccess(
  accessCtx({
    userId: OA,
    grants: [grant({ role: "org_admin", status: "active" })],
  })
);
const pmAccess = computeAccess(
  accessCtx({
    userId: PM,
    grants: [
      grant({ role: "property_manager", status: "active", propertyId: PROP_A }),
    ],
  })
);
const smAccess = computeAccess(
  accessCtx({
    userId: SM,
    grants: [grant({ role: "space_manager", status: "active", spaceId: SPACE_A })],
  })
);
const renterAccess = computeAccess(
  accessCtx({
    userId: RENTER,
    organisationId: ORG_A,
    grants: [],
  })
);
const gaAccess = computeAccess(
  accessCtx({
    userId: GA,
    profileRole: "admin",
    grants: [],
  })
);
const disabledGaAccess = computeAccess(
  accessCtx({
    userId: GA,
    profileRole: "admin",
    adminAccessDisabled: true,
    grants: [],
  })
);

const oaHosting = summarizeHostingAccess({
  profileRole: "user",
  isHostProfile: false,
  ownedSpaceCount: 0,
  ownedPropertyCount: 0,
  grants: [grant({ role: "org_admin", status: "active" })],
});
const pmHosting = summarizeHostingAccess({
  profileRole: "user",
  isHostProfile: false,
  ownedSpaceCount: 0,
  ownedPropertyCount: 0,
  grants: [
    grant({ role: "property_manager", status: "active", propertyId: PROP_A }),
  ],
});
const smHosting = summarizeHostingAccess({
  profileRole: "user",
  isHostProfile: false,
  ownedSpaceCount: 0,
  ownedPropertyCount: 0,
  grants: [grant({ role: "space_manager", status: "active", spaceId: SPACE_A })],
});
const personalHosting = summarizeHostingAccess({
  profileRole: "user",
  isHostProfile: true,
  ownedSpaceCount: 1,
  ownedPropertyCount: 0,
  grants: [],
});

{
  assert.equal(oaAccess.canManageOrganisationFinance, true);
  assert.equal(oaAccess.isGlobalAdmin, false);
  assert.equal(pmAccess.canManageOrganisationFinance, false);
  assert.equal(smAccess.canManageOrganisationFinance, false);
  assert.equal(renterAccess.canManageOrganisationFinance, false);
  assert.equal(gaAccess.isGlobalAdmin, true);
  assert.equal(disabledGaAccess.isGlobalAdmin, false);
  assert.equal(
    canShowOrganisationPayoutLedger({
      showOrganisationCommercial: oaHosting.showOrganisationCommercial,
      organisationId: ORG_A,
    }),
    true
  );
  assert.equal(
    canShowOrganisationPayoutLedger({
      showOrganisationCommercial: pmHosting.showOrganisationCommercial,
      organisationId: ORG_A,
    }),
    false
  );
  assert.equal(
    canShowOrganisationPayoutLedger({
      showOrganisationCommercial: smHosting.showOrganisationCommercial,
      organisationId: ORG_A,
    }),
    false
  );
  assert.equal(
    canShowOrganisationPayoutLedger({
      showOrganisationCommercial: personalHosting.showOrganisationCommercial,
      organisationId: null,
    }),
    false
  );
}

{
  assert.equal(isOrganisationBookingPayoutEligible(eligibleInput()), true);
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({
        booking: { commercial_beneficiary_type: "personal" },
      })
    ),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({
        booking: { commercial_beneficiary_organisation_id: ORG_B },
      })
    ),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({
        booking: { payment_status: "awaiting_payment" },
      })
    ),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({
        booking: { status: "accepted_awaiting_payment" },
      })
    ),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({
        booking: { payout_status: "paid" },
      })
    ),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({
        booking: { payout_paid_at: "2026-09-22T10:00:00.000Z" },
      })
    ),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(eligibleInput({ alreadyInPayout: true })),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(eligibleInput({ pendingChargeCount: 1 })),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({ pendingChargeCount: 0, paidChargeCount: 0 })
    ),
    true
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({
        booking: { total_price: null },
      })
    ),
    false
  );
  assert.equal(
    isOrganisationBookingPayoutEligible(
      eligibleInput({
        booking: { total_price: 1000, platform_fee: 70, owner_earnings: 900 },
      })
    ),
    false
  );
}

{
  const booking1 = { gross: 1000, fee: 70, net: 930 };
  const booking2 = { gross: 2000, fee: 140, net: 1860 };
  const header = sumOrganisationPayoutItems([booking1, booking2]);
  assert.equal(header.gross, 3000);
  assert.equal(header.fee, 210);
  assert.equal(header.net, 2790);
  assert.equal(payoutMoneyEquals(header.gross, header.fee + header.net), true);

  const ledger = summariseOrganisationPayoutLedger({
    eligible: [
      { total_price: 1000, platform_fee: 70, owner_earnings: 930 },
      { total_price: 2000, platform_fee: 140, owner_earnings: 1860 },
    ],
    history: [],
  });
  assert.equal(ledger.awaiting.gross, 3000);
  assert.equal(ledger.awaiting.fee, 210);
  assert.equal(ledger.awaiting.net, 2790);
  assert.equal(ledger.awaiting.count, 2);
  assert.equal(ledger.paid_out.net, 0);
}

{
  const parsed = parseRecordOrganisationPayoutBody({
    booking_ids: [BOOKING_1, BOOKING_1, BOOKING_2],
    reference: "ABC123",
    amount_gross: 1,
    amount_net: 2,
    bank_account_id: "should-be-ignored",
    commercial_beneficiary_organisation_id: ORG_B,
    actor_id: RENTER,
    paid_by: RENTER,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.input.bookingIds, [BOOKING_1, BOOKING_2]);
    assert.equal(parsed.input.reference, "ABC123");
    assert.equal("amount_gross" in parsed.input, false);
    assert.equal("bank_account_id" in parsed.input, false);
  }
  const stripped = stripForbiddenOrganisationPayoutWriteKeys({
    booking_ids: [BOOKING_1],
    reference: "ABC123",
    amount_gross: 9999,
    bank_account_id: "x",
    organisation_id: ORG_B,
  });
  assert.equal("amount_gross" in stripped, false);
  assert.equal("bank_account_id" in stripped, false);
  assert.equal("organisation_id" in stripped, false);
  assert.equal(stripped.reference, "ABC123");
  assert.equal(
    hasForbiddenOrganisationPayoutWriteKeys({
      amount_net: 10,
      booking_ids: [BOOKING_1],
    }),
    true
  );
  const future = parseRecordOrganisationPayoutBody({
    booking_ids: [BOOKING_1],
    reference: "ABC123",
    paid_at: "2099-01-01",
  });
  assert.equal(future.ok, false);
  const empty = parseRecordOrganisationPayoutBody({
    booking_ids: [],
    reference: "ABC123",
  });
  assert.equal(empty.ok, false);
}

{
  assert.equal(
    organisationPayoutCanRecord({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: "verified",
    }),
    true
  );
  assert.equal(
    organisationPayoutCanRecord({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: "pending",
    }),
    false
  );
  assert.equal(
    organisationPayoutCanRecord({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: "rejected",
    }),
    false
  );
  assert.equal(
    organisationPayoutCanRecord({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: null,
    }),
    false
  );
  assert.equal(
    organisationPayoutCanRecord({
      organisationStatus: "active",
      verificationStatus: "pending",
      currentBankStatus: "verified",
    }),
    false
  );
  assert.equal(
    organisationPayoutCanRecord({
      organisationStatus: "archived",
      verificationStatus: "verified",
      currentBankStatus: "verified",
    }),
    false
  );
  assert.equal(
    resolveOrganisationPayoutReadiness({
      organisationStatus: "active",
      verificationStatus: "verified",
      currentBankStatus: "verified",
    }).ready,
    true
  );
}

{
  assert.equal(
    payoutHistoryExposesFullAccountNumber({
      account_number_last4: "1234",
      account_number_display: "•••• 1234",
    }),
    false
  );
  assert.equal(
    payoutHistoryExposesFullAccountNumber({
      account_number: "1234567890",
    }),
    true
  );
}

{
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.organisation_payouts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.organisation_payout_items/);
  assert.match(migration, /CONSTRAINT organisation_payout_items_booking_uidx UNIQUE \(booking_id\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /organisation-payout:/);
  assert.match(migration, /payout_status = 'paid'/);
  assert.match(migration, /payout_paid_at = v_paid_at/);
  assert.match(migration, /bookings_payout_status_chk/);
  assert.match(migration, /unpaid_to_owner/);
  assert.match(migration, /bank_account_id uuid NOT NULL/);
  assert.match(migration, /organisation_bank_accounts\(id\)/);
  assert.match(migration, /is_current = true/);
  assert.match(migration, /v_bank.status IS DISTINCT FROM 'verified'/);
  assert.match(migration, /commercial_beneficiary_type = 'organisation'/);
  assert.match(migration, /round\(b\.total_price, 2\)/);
  assert.match(migration, /round\(b\.owner_earnings, 2\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.record_organisation_payout/);
  assert.match(migration, /TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.record_organisation_payout/);
  assert.match(migration, /FROM authenticated/);
  assert.match(migration, /enforce_server_role_writes_only/);
  assert.match(migration, /organisation_payout_immutable/);
  assert.match(migration, /bookings_freeze_paid_money/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /21cf12c3-3235-4cd3-8106-801d120dc7b5/);
  assert.doesNotMatch(migration, /status IN \('draft'/);
  assert.doesNotMatch(migration, /b\.owner_id|spaces\.owner_id|properties\.owner_id/);
}

{
  assert.match(adminApi, /requireActivePlatformAdminApi/);
  assert.match(adminApi, /stripForbiddenOrganisationPayoutWriteKeys/);
  assert.match(adminApi, /parseRecordOrganisationPayoutBody/);
  assert.match(adminApi, /recordOrganisationPayout/);
  assert.match(adminApi, /actorUserId: auth\.userId/);
  assert.match(adminApi, /payoutHistoryExposesFullAccountNumber/);
  assert.doesNotMatch(adminApi, /amount_gross:/);
  assert.match(oaApi, /requireOrgCommercialApi/);
  assert.match(oaApi, /loadOrganisationPayoutBundle/);
  assert.doesNotMatch(oaApi, /export async function POST/);
  assert.doesNotMatch(oaApi, /recordOrganisationPayout/);
  assert.doesNotMatch(oaApi, /account_number:/);
  assert.match(server, /rpc\("record_organisation_payout"/);
  assert.match(server, /p_actor_id: input.actorUserId/);
  assert.match(server, /const preview = sumOrganisationPayoutItems/);
  assert.match(server, /notifyOrganisationPayoutRecorded/);
  assert.match(server, /ORGANISATION_PAYOUT_AUDIT.recorded/);
  assert.match(server, /actor_kind: "global_admin"/);
  assert.match(server, /BANK_MASKED_SELECT|account_number_last4/);
  assert.doesNotMatch(server, /spaces\.owner_id/);
  assert.doesNotMatch(server, /properties\.owner_id/);
  assert.match(notify, /eq\("role", "org_admin"\)/);
  assert.match(notify, /organisation.payout.recorded/);
  assert.doesNotMatch(notify, /property_manager/);
  assert.doesNotMatch(notify, /space_manager/);
  assert.doesNotMatch(notify, /account_number/);
}

{
  assert.match(adminPanel, /Record payout/);
  assert.match(adminPanel, /does not send money/);
  assert.match(adminPanel, /inFlight/);
  assert.match(adminPanel, /Select all eligible/);
  assert.doesNotMatch(adminPanel, />Pay now</);
  assert.match(adminOrgsPage, /OrganisationPayoutAdminPanel/);
  assert.match(financePage, /canShowOrganisationPayoutLedger/);
  assert.match(financePage, /showOrganisationCommercial/);
  assert.match(financePage, /OrganisationFinancePayouts/);
  assert.doesNotMatch(financePage, /Record payout/);
  assert.doesNotMatch(financePanel, /Record payout/);
  assert.doesNotMatch(financePanel, /account_number[^\n_]/);
  assert.match(financePanel, /Awaiting payout/);
  assert.match(financePanel, /Paid out/);
  assert.match(financePanel, /account_number_display/);
}

{
  assert.match(payfastNotify, /status: "paid_confirmed"/);
  assert.match(payfastNotify, /payment_status: "paid"/);
  assert.doesNotMatch(payfastNotify, /\.from\("payments"\)/);
  assert.doesNotMatch(payfastInitiate, /\.from\("payments"\)/);
  assert.doesNotMatch(payfastNotify, /payout_status/);
  assert.doesNotMatch(payfastInitiate, /organisation_payouts/);
  assert.match(helper, /isInvoiceEligibleBooking/);
  assert.match(migration, /booking_charges/);
  assert.match(migration, /c.status = 'pending'/);
}

{
  const bookingPersonal = eligibleInput({
    booking: {
      id: BOOKING_PERSONAL,
      commercial_beneficiary_type: "personal",
      commercial_beneficiary_organisation_id: null,
    },
  });
  assert.equal(isOrganisationBookingPayoutEligible(bookingPersonal), false);
}

console.log("test-organisation-payout: all assertions passed");
