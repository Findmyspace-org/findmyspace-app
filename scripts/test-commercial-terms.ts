#!/usr/bin/env node
/**
 * Global Admin commercial charging model — calculator, precedence,
 * snapshots, security, and migration contracts. No production writes.
 * Run: npm run test:commercial-terms
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import {
  calculateBookingCommercials,
  calculatePaymentCommercials,
  DEFAULT_COMMISSION_PERCENT,
  DEFAULT_TRANSACTION_FEE_PERCENT,
} from "../lib/commercial-calculator";
import { computeBookingTotals } from "../lib/booking-pricing";
import {
  canMutateCommercialTerms,
  formatCommercialArrangement,
  hasForbiddenClientCommercialKeys,
  inheritedFromLabel,
  parseCommercialTermsWriteBody,
  resolveCommercialTerms,
  snapshotBookingCommercialInsert,
  stripForbiddenClientCommercialKeys,
  type CommercialTermRow,
  type ResolvedCommercialTerms,
} from "../lib/commercial-terms";
import {
  buildFinanceLineItems,
  type FinanceBookingInput,
} from "../lib/finance-booking-lines";
import { summarizePaidLines } from "../lib/admin-finance-filters";

const ORG = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const PROP = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";
const SPACE = "cd1ebdff-0259-4185-8a0c-ac2892f03778";
const OA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const SM = "5860f254-26e9-4f7f-8760-3fd69bd9fff3";
const GA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

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

function accessCtx(partial: Partial<AccessContext>): AccessContext {
  return {
    userId: partial.userId ?? OA,
    spaceId: partial.spaceId ?? SPACE,
    propertyId: partial.propertyId ?? PROP,
    organisationId: partial.organisationId ?? ORG,
    spaceOwnerId: partial.spaceOwnerId ?? null,
    propertyOwnerId: partial.propertyOwnerId ?? null,
    profileRole: partial.profileRole ?? "user",
    adminAccessDisabled: partial.adminAccessDisabled ?? false,
    grants: partial.grants ?? [],
  };
}

function term(
  partial: Partial<CommercialTermRow> &
    Pick<CommercialTermRow, "id" | "scope_type" | "commercial_model" | "effective_from">
): CommercialTermRow {
  return {
    scope_id: partial.scope_id ?? null,
    commission_percent: partial.commission_percent ?? 10,
    transaction_fee_percent: partial.transaction_fee_percent ?? 5,
    monthly_subscription_amount: partial.monthly_subscription_amount ?? 0,
    superseded_at: partial.superseded_at ?? null,
    admin_note: partial.admin_note ?? null,
    created_by: partial.created_by ?? GA,
    created_at: partial.created_at ?? partial.effective_from,
    ...partial,
  };
}

const splitCommission: ResolvedCommercialTerms = {
  termsId: "term-platform",
  model: "commission",
  commissionPercent: DEFAULT_COMMISSION_PERCENT,
  transactionFeePercent: DEFAULT_TRANSACTION_FEE_PERCENT,
  monthlySubscriptionAmount: 0,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  adminNote: null,
  source: "platform",
  accountingMode: "split",
};

{
  const r1000 = calculateBookingCommercials(1000, splitCommission);
  assert.equal(r1000.platformCommission, 100);
  assert.equal(r1000.transactionFee, 50);
  assert.equal(r1000.totalFindmyspaceFee, 150);
  assert.equal(r1000.hostEarnings, 850);
  assert.equal(r1000.grossAmount, 1000);
}

{
  const subscription = calculateBookingCommercials(1000, {
    ...splitCommission,
    model: "subscription",
    commissionPercent: 0,
  });
  assert.equal(subscription.platformCommission, 0);
  assert.equal(subscription.transactionFee, 50);
  assert.equal(subscription.hostEarnings, 950);
}

{
  const free = calculateBookingCommercials(1000, {
    ...splitCommission,
    model: "free",
    commissionPercent: 0,
  });
  assert.equal(free.platformCommission, 0);
  assert.equal(free.transactionFee, 50);
  assert.equal(free.hostEarnings, 950);
}

{
  const discounted = calculateBookingCommercials(800, splitCommission);
  assert.equal(discounted.platformCommission, 80);
  assert.equal(discounted.transactionFee, 40);
  assert.equal(discounted.hostEarnings, 680);
}

{
  const deposit = calculatePaymentCommercials(1000, splitCommission);
  const monthly = calculatePaymentCommercials(2000, splitCommission);
  const extra = calculatePaymentCommercials(500, splitCommission);
  assert.equal(deposit.transactionFee, 50);
  assert.equal(monthly.transactionFee, 100);
  assert.equal(extra.transactionFee, 25);
  assert.equal(deposit.platformCommission, 100);
  assert.equal(monthly.platformCommission, 200);
  assert.equal(extra.platformCommission, 50);
}

{
  const legacy = calculateBookingCommercials(100, {
    model: "commission",
    commissionPercent: 15,
    transactionFeePercent: 0,
    accountingMode: "legacy_combined",
  });
  assert.equal(legacy.totalFindmyspaceFee, 15);
  assert.equal(legacy.hostEarnings, 85);
  assert.equal(legacy.transactionFee, null);
  assert.equal(legacy.platformCommission, null);
}

{
  const totals = computeBookingTotals(
    {
      price_amount: 100,
      price_unit: "event",
      booking_unit: "day",
      platform_fee_percent: 15,
    },
    "day",
    1,
    "2026-09-28T10:00:00.000Z"
  );
  assert.ok(totals);
  assert.equal(totals.totalPrice, 100);
  assert.equal(totals.platformFee, 15);
  assert.equal(totals.ownerAmount, 85);
  assert.equal(totals.commercialTerms.accountingMode, "legacy_combined");
}

{
  const totals = computeBookingTotals(
    {
      price_amount: 1000,
      price_unit: "event",
      booking_unit: "day",
      platform_fee_percent: 15,
    },
    "day",
    1,
    "2026-09-28T10:00:00.000Z",
    splitCommission
  );
  assert.ok(totals);
  assert.equal(totals.totalPrice, 1000);
  assert.equal(totals.platformFee, 150);
  assert.equal(totals.ownerAmount, 850);
  assert.equal(totals.commercialSplit.platformCommission, 100);
  assert.equal(totals.commercialSplit.transactionFee, 50);
}

{
  const platform = term({
    id: "t-platform",
    scope_type: "platform",
    commercial_model: "commission",
    commission_percent: 10,
    transaction_fee_percent: 5,
    effective_from: "2026-01-01T00:00:00.000Z",
  });
  const org = term({
    id: "t-org",
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    monthly_subscription_amount: 1500,
    effective_from: "2026-02-01T00:00:00.000Z",
  });
  const property = term({
    id: "t-prop",
    scope_type: "property",
    scope_id: PROP,
    commercial_model: "free",
    commission_percent: 0,
    transaction_fee_percent: 5,
    effective_from: "2026-03-01T00:00:00.000Z",
  });
  const space = term({
    id: "t-space",
    scope_type: "space",
    scope_id: SPACE,
    commercial_model: "commission",
    commission_percent: 8,
    transaction_fee_percent: 5,
    effective_from: "2026-04-01T00:00:00.000Z",
  });
  const rows = [platform, org, property, space];
  const at = "2026-06-01T00:00:00.000Z";

  assert.equal(
    resolveCommercialTerms({
      organisationId: ORG,
      propertyId: PROP,
      spaceId: SPACE,
      effectiveAt: at,
      rows,
    }).source,
    "space"
  );
  assert.equal(
    resolveCommercialTerms({
      organisationId: ORG,
      propertyId: PROP,
      spaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
      effectiveAt: at,
      rows,
    }).source,
    "property"
  );
  assert.equal(
    resolveCommercialTerms({
      organisationId: ORG,
      propertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      spaceId: null,
      effectiveAt: at,
      rows,
    }).model,
    "subscription"
  );
  assert.equal(
    resolveCommercialTerms({
      organisationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
      effectiveAt: at,
      rows,
    }).source,
    "platform"
  );
  assert.equal(
    resolveCommercialTerms({
      effectiveAt: at,
      rows: [],
      legacySpacePercent: 15,
    }).accountingMode,
    "legacy_combined"
  );
}

{
  const oldTerms = term({
    id: "old",
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "commission",
    commission_percent: 10,
    transaction_fee_percent: 5,
    effective_from: "2026-01-01T00:00:00.000Z",
    superseded_at: "2026-11-01T00:00:00.000Z",
  });
  const newTerms = term({
    id: "new",
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    monthly_subscription_amount: 1500,
    effective_from: "2026-11-01T00:00:00.000Z",
  });
  const rows = [oldTerms, newTerms];
  const before = resolveCommercialTerms({
    organisationId: ORG,
    effectiveAt: "2026-10-15T00:00:00.000Z",
    rows,
  });
  const after = resolveCommercialTerms({
    organisationId: ORG,
    effectiveAt: "2026-11-02T00:00:00.000Z",
    rows,
  });
  assert.equal(before.model, "commission");
  assert.equal(before.commissionPercent, 10);
  assert.equal(after.model, "subscription");
  assert.equal(after.monthlySubscriptionAmount, 1500);

  const oldSplit = calculateBookingCommercials(1000, {
    model: before.model,
    commissionPercent: before.commissionPercent,
    transactionFeePercent: before.transactionFeePercent,
    accountingMode: "split",
  });
  const newSplit = calculateBookingCommercials(1000, {
    model: after.model,
    commissionPercent: after.commissionPercent,
    transactionFeePercent: after.transactionFeePercent,
    accountingMode: "split",
  });
  assert.equal(oldSplit.hostEarnings, 850);
  assert.equal(newSplit.hostEarnings, 950);
}

{
  const snapshot = snapshotBookingCommercialInsert(
    calculateBookingCommercials(100, {
      model: "commission",
      commissionPercent: 15,
      transactionFeePercent: 0,
      accountingMode: "legacy_combined",
    }),
    {
      termsId: null,
      model: "commission",
      commissionPercent: 15,
      transactionFeePercent: 0,
      monthlySubscriptionAmount: 0,
      effectiveFrom: null,
      adminNote: null,
      source: "legacy_space_percent",
      accountingMode: "legacy_combined",
    },
    "2026-09-28T09:17:44.632Z"
  );
  assert.equal(snapshot.commercial_model, null);
  assert.equal(snapshot.platform_commission_amount, null);
  assert.equal(snapshot.transaction_fee_amount, null);
}

{
  const legacyBooking: FinanceBookingInput = {
    id: "b5a97793-b8b1-436a-a7a0-40342a841f75",
    space_id: SPACE,
    total_price: 100,
    platform_fee: 15,
    owner_earnings: 85,
    status: "paid_confirmed",
    payment_status: "paid",
    created_at: "2026-09-28T09:17:44.632Z",
    renter: null,
    space: { title: "FMS V1 Test Space" },
    booking_charges: [
      {
        id: "charge-1",
        charge_type: "booking_total",
        description: null,
        billing_period_start: null,
        billing_period_end: null,
        amount: 100,
        status: "paid",
        paid_at: "2026-09-28T09:19:28.623Z",
        payment_reference: "3413316",
        statement_month: null,
      },
    ],
  };
  const lines = buildFinanceLineItems([legacyBooking]);
  assert.equal(lines[0].gross, 100);
  assert.equal(lines[0].platformFee, 15);
  assert.equal(lines[0].netOwner, 85);
  assert.equal(lines[0].feeLegacyCombined, true);
  assert.equal(lines[0].platformCommission, null);
  assert.equal(lines[0].transactionFee, null);
  const summary = summarizePaidLines(lines);
  assert.equal(summary.totalPlatformFees, 15);
  assert.equal(summary.legacyCombinedPlatformFees, 15);
  assert.equal(summary.totalPlatformCommission, 0);
  assert.equal(summary.totalTransactionFees, 0);
}

{
  const splitBooking: FinanceBookingInput = {
    id: "split-booking",
    space_id: SPACE,
    total_price: 1000,
    platform_fee: 150,
    owner_earnings: 850,
    platform_commission_amount: 100,
    transaction_fee_amount: 50,
    status: "paid_confirmed",
    payment_status: "paid",
    created_at: "2026-11-02T00:00:00.000Z",
    renter: null,
    space: { title: "Hall" },
    booking_charges: [
      {
        id: "c1",
        charge_type: "deposit",
        description: null,
        billing_period_start: null,
        billing_period_end: null,
        amount: 200,
        status: "paid",
        paid_at: "2026-11-02T00:00:00.000Z",
        payment_reference: "pf-1",
        statement_month: null,
      },
      {
        id: "c2",
        charge_type: "first_month_rent",
        description: null,
        billing_period_start: null,
        billing_period_end: null,
        amount: 800,
        status: "paid",
        paid_at: "2026-11-02T00:00:00.000Z",
        payment_reference: "pf-1",
        statement_month: null,
      },
    ],
  };
  const lines = buildFinanceLineItems([splitBooking]);
  const summary = summarizePaidLines(lines);
  assert.equal(summary.grossBookingValue, 1000);
  assert.equal(summary.totalPlatformFees, 150);
  assert.equal(summary.totalOwnerEarnings, 850);
  assert.equal(summary.totalPlatformCommission, 100);
  assert.equal(summary.totalTransactionFees, 50);
  assert.equal(lines.every((line) => line.feeLegacyCombined === false), true);
}

{
  const oa = computeAccess(
    accessCtx({
      userId: OA,
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  const pm = computeAccess(
    accessCtx({
      userId: PM,
      grants: [
        grant({ role: "property_manager", status: "active", propertyId: PROP }),
      ],
    })
  );
  const sm = computeAccess(
    accessCtx({
      userId: SM,
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP,
          spaceId: SPACE,
        }),
      ],
    })
  );
  const ga = computeAccess(
    accessCtx({ userId: GA, profileRole: "admin", grants: [] })
  );
  assert.equal(oa.canManagePlatformCommercialTerms, false);
  assert.equal(pm.canManagePlatformCommercialTerms, false);
  assert.equal(sm.canManagePlatformCommercialTerms, false);
  assert.equal(ga.canManagePlatformCommercialTerms, true);
  assert.equal(canMutateCommercialTerms(oa), false);
  assert.equal(canMutateCommercialTerms(pm), false);
  assert.equal(canMutateCommercialTerms(sm), false);
  assert.equal(canMutateCommercialTerms(ga), true);
}

{
  assert.equal(
    hasForbiddenClientCommercialKeys({
      spaceId: SPACE,
      commission_percent: 1,
    }),
    true
  );
  const stripped = stripForbiddenClientCommercialKeys({
    spaceId: SPACE,
    platform_fee: 15,
    owner_earnings: 85,
    bookingUnit: "day",
  });
  assert.equal("platform_fee" in stripped, false);
  assert.equal(stripped.spaceId, SPACE);
}

{
  const parsed = parseCommercialTermsWriteBody({
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "free",
    commission_percent: 10,
    transaction_fee_percent: 5,
    monthly_subscription_amount: 99,
    effective_from: "2026-11-01",
    admin_note: "School partnership — platform fee waived",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.model, "free");
    assert.equal(parsed.value.commissionPercent, 0);
    assert.equal(parsed.value.monthlySubscriptionAmount, 0);
    assert.equal(parsed.value.transactionFeePercent, 5);
  }

  const bad = parseCommercialTermsWriteBody({
    scope_type: "organisation",
    commercial_model: "commission",
    commission_percent: 10,
    effective_from: "2026-11-01",
  });
  assert.equal(bad.ok, false);
}

{
  assert.match(
    formatCommercialArrangement(splitCommission),
    /10\.00% platform \+ 5\.00% transaction/
  );
  assert.equal(inheritedFromLabel("space"), "Space");
}

{
  const migration = readFileSync(
    "supabase/migrations/071_20260928_platform_commercial_terms.sql",
    "utf8"
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.commercial_terms/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.commercial_terms FROM authenticated/);
  assert.match(migration, /bookings_freeze_commercial_snapshot/);
  assert.match(migration, /platform_commission_amount/);
  assert.doesNotMatch(migration, /UPDATE public\.bookings\s+SET/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.commercial_terms/);

  const api = readFileSync("app/api/admin/commercial-terms/route.ts", "utf8");
  assert.match(api, /requireAdminApi/);
  assert.match(api, /createCommercialTerms/);

  const bookingServer = readFileSync("lib/booking-request-server.ts", "utf8");
  assert.match(bookingServer, /loadResolvedCommercialTerms/);
  assert.match(bookingServer, /stripForbiddenClientCommercialKeys/);
  assert.match(bookingServer, /snapshotBookingCommercialInsert/);

  const invoice = readFileSync("lib/invoice-document.ts", "utf8");
  assert.doesNotMatch(invoice, /transaction_fee_percent/);
  assert.doesNotMatch(invoice, /commission_percent/);

  const hostApi = readFileSync("app/api/host/access-summary/route.ts", "utf8");
  assert.doesNotMatch(hostApi, /commercial_terms/);

  const requestApi = readFileSync("app/api/bookings/request/route.ts", "utf8");
  assert.doesNotMatch(requestApi, /commission_percent/);
}

console.log("commercial-terms tests passed");
