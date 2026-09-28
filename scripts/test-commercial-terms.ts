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
  commercialCalendarDate,
  commercialEffectiveDateConflictMessage,
  COMMERCIAL_TERMS_EFFECTIVE_DATE_CONFLICT,
  formatCommercialArrangement,
  formatCommercialDisplayDate,
  friendlyCommercialTermsWriteError,
  hasForbiddenClientCommercialKeys,
  inheritedFromLabel,
  isCommercialTermsEffectiveDateUniqueConflict,
  legacyCombinedCommercialTerms,
  parseCommercialTermsWriteBody,
  resolveCommercialTerms,
  snapshotBookingCommercialInsert,
  stripForbiddenClientCommercialKeys,
  suggestedCommercialEffectiveDate,
  withSubscriptionResolution,
  type CommercialTermRow,
  type ResolvedCommercialTerms,
} from "../lib/commercial-terms";
import { parseApiFetchError } from "../lib/api-fetch-errors";
import {
  calculateProgressiveSpaceSubscription,
  calculateProgressiveSubscription,
  progressiveBandGapWarning,
  progressivePreviewCounts,
  validateProgressiveBands,
} from "../lib/commercial-progressive-pricing";
import {
  assertBillableSubscriptionResolution,
  buildSubscriptionPeriodSnapshot,
  inventoryCountForMode,
  matchSubscriptionTier,
  matchingSubscriptionTiers,
  resolveSubscriptionAmount,
  subscriptionBilledScope,
  type CommercialTermTier,
} from "../lib/commercial-subscription";
import {
  buildCommercialPrecedencePath,
  commercialParentContext,
  decorateCommercialSearchHit,
  subscriptionTierGapWarning,
  subscriptionUncoveredInventoryWarning,
} from "../lib/commercial-admin-display";
import {
  countBillableInventory,
  isBillableSpace,
  BILLABLE_SPACE_EXCLUDED_STATUSES,
  BILLABLE_SPACE_INCLUDED_STATUSES,
  SPACE_STATUS_CHECK_VALUES,
} from "../lib/commercial-inventory";
import {
  buildFinanceLineItems,
  type FinanceBookingInput,
} from "../lib/finance-booking-lines";
import { summarizePaidLines } from "../lib/admin-finance-filters";
import {
  bookingHasCommercialSnapshot,
  commercialSnapshotUpdateAllowed,
} from "../lib/commercial-snapshot-freeze";
import {
  formatHostCommercialArrangement,
  HOST_COMMERCIAL_NEUTRAL,
  toHostCommercialArrangementDto,
} from "../lib/host-commercial-copy";

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
    subscription_pricing_mode: partial.subscription_pricing_mode ?? null,
    subscription_included_units: partial.subscription_included_units ?? null,
    tiers: partial.tiers ?? [],
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
  subscriptionPricingMode: null,
  subscriptionIncludedUnits: null,
  subscriptionBaseAmount: null,
  tiers: [],
  subscription: null,
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
      subscriptionPricingMode: null,
      subscriptionIncludedUnits: null,
      subscriptionBaseAmount: null,
      tiers: [],
      subscription: null,
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
  const subscriptionBooking: FinanceBookingInput = {
    id: "sub-booking",
    space_id: SPACE,
    total_price: 100,
    platform_fee: 5,
    owner_earnings: 95,
    commercial_model: "subscription",
    platform_commission_amount: 0,
    transaction_fee_amount: 5,
    status: "paid_confirmed",
    payment_status: "paid",
    created_at: "2026-09-28T16:00:00.000Z",
    renter: { first_name: "Sub", last_name: "Renter", email: null },
    space: { title: "Dal Josaphat - Athletics" },
    booking_charges: [
      {
        id: "sub-c1",
        charge_type: "booking_total",
        description: null,
        billing_period_start: null,
        billing_period_end: null,
        amount: 100,
        status: "paid",
        paid_at: "2026-09-28T16:00:00.000Z",
        payment_reference: "pf-sub",
        statement_month: null,
      },
    ],
  };
  const freeBooking: FinanceBookingInput = {
    ...subscriptionBooking,
    id: "free-booking",
    commercial_model: "free",
    booking_charges: [
      {
        ...subscriptionBooking.booking_charges![0],
        id: "free-c1",
      },
    ],
  };
  const lines = buildFinanceLineItems([subscriptionBooking, freeBooking]);
  const summary = summarizePaidLines(lines);
  assert.equal(summary.grossBookingValue, 200);
  assert.equal(summary.totalPlatformFees, 10);
  assert.equal(summary.totalOwnerEarnings, 190);
  assert.equal(summary.totalPlatformCommission, 0);
  assert.equal(summary.totalTransactionFees, 10);
  assert.equal(
    lines.every((line) => line.feeLegacyCombined === false),
    true
  );
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
  assert.equal(
    hasForbiddenClientCommercialKeys({
      spaceId: SPACE,
      subscription_pricing_mode: "by_space_count",
    }),
    true
  );
  assert.equal(
    hasForbiddenClientCommercialKeys({
      spaceId: SPACE,
      subscription_included_units: 1,
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
  const orgHit = decorateCommercialSearchHit(
    {
      kind: "organisation",
      id: ORG,
      name: "Drakenstein Municipality",
      organisationId: ORG,
      propertyId: null,
      spaceId: null,
      organisationName: "Drakenstein Municipality",
      propertyName: null,
    },
    legacyCombinedCommercialTerms(15)
  );
  assert.equal(orgHit.kindLabel, "Organisation");
  assert.equal(orgHit.parentContext, null);
  assert.equal(orgHit.isLegacy, true);
  assert.match(orgHit.commercialSummary, /Legacy combined 15\.00%/);

  const propertyHit = decorateCommercialSearchHit(
    {
      kind: "property",
      id: PROP,
      name: "Paarl Town Hall",
      organisationId: ORG,
      propertyId: PROP,
      spaceId: null,
      organisationName: "Drakenstein Municipality",
      propertyName: "Paarl Town Hall",
    },
    splitCommission
  );
  assert.equal(propertyHit.kindLabel, "Property");
  assert.equal(propertyHit.parentContext, "Drakenstein Municipality");
  assert.equal(propertyHit.inheritedFrom, "Platform default");

  const spaceHit = {
    kind: "space" as const,
    id: SPACE,
    name: "Main Hall",
    organisationId: ORG,
    propertyId: PROP,
    spaceId: SPACE,
    organisationName: "Drakenstein Municipality",
    propertyName: "Paarl Town Hall",
  };
  assert.equal(
    commercialParentContext(spaceHit),
    "Paarl Town Hall · Drakenstein Municipality"
  );
  const spaceResolved = decorateCommercialSearchHit(spaceHit, {
    ...splitCommission,
    source: "organisation",
    model: "subscription",
    commissionPercent: 0,
    monthlySubscriptionAmount: 1000,
    subscriptionPricingMode: "by_space_count",
  });
  assert.equal(spaceResolved.inheritedFrom, "Organisation");
  assert.match(spaceResolved.commercialSummary, /Subscription by spaces/);

  const unlinkedProperty = commercialParentContext({
    kind: "property",
    id: PROP,
    name: "Drakenstein Municipality",
    organisationId: null,
    propertyId: PROP,
    spaceId: null,
    organisationName: null,
    propertyName: "Drakenstein Municipality",
  });
  assert.equal(unlinkedProperty, "No organisation linked");

  const path = buildCommercialPrecedencePath({
    viewScope: "space",
    spaceName: "Main Hall",
    propertyName: "Paarl Town Hall",
    organisationName: "Drakenstein Municipality",
    source: "organisation",
  });
  assert.equal(path[0].scopeType, "space");
  assert.equal(path[0].isEffective, false);
  assert.equal(path[1].scopeType, "property");
  assert.equal(path[2].isEffective, true);
  assert.equal(path[2].hasOverride, true);
  assert.equal(path[path.length - 1].scopeType, "legacy");

  const gap = subscriptionTierGapWarning([
    {
      id: "a",
      minCount: 1,
      maxCount: 3,
      monthlyAmount: 500,
      label: "1–3",
      sortOrder: 0,
    },
    {
      id: "b",
      minCount: 5,
      maxCount: 10,
      monthlyAmount: 1000,
      label: "5–10",
      sortOrder: 1,
    },
  ]);
  assert.match(String(gap), /gap between 3 and 5/);
  assert.equal(
    subscriptionTierGapWarning([
      {
        id: "a",
        minCount: 1,
        maxCount: 3,
        monthlyAmount: 500,
        label: null,
        sortOrder: 0,
      },
      {
        id: "b",
        minCount: 4,
        maxCount: null,
        monthlyAmount: 1000,
        label: null,
        sortOrder: 1,
      },
    ]),
    null
  );
}

const spaceTiers: CommercialTermTier[] = [
  {
    id: "tier-a",
    minCount: 1,
    maxCount: 3,
    monthlyAmount: 500,
    label: "1–3 spaces",
    sortOrder: 0,
  },
  {
    id: "tier-b",
    minCount: 4,
    maxCount: 10,
    monthlyAmount: 1000,
    label: "4–10 spaces",
    sortOrder: 1,
  },
  {
    id: "tier-c",
    minCount: 11,
    maxCount: 30,
    monthlyAmount: 1500,
    label: "11–30 spaces",
    sortOrder: 2,
  },
];

{
  assert.equal(matchSubscriptionTier(1, spaceTiers)?.id, "tier-a");
  assert.equal(matchSubscriptionTier(5, spaceTiers)?.id, "tier-b");
  assert.equal(matchSubscriptionTier(15, spaceTiers)?.id, "tier-c");
  assert.equal(matchSubscriptionTier(0, spaceTiers), null);

  const one = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: spaceTiers,
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 1,
      spaceCount: 1,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  const five = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: spaceTiers,
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 1,
      spaceCount: 5,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  const fifteen = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: spaceTiers,
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 2,
      spaceCount: 15,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(one.monthlyAmount, 500);
  assert.equal(five.monthlyAmount, 1000);
  assert.equal(fifteen.monthlyAmount, 1500);
}

{
  const platform = term({
    id: "plat-sub",
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "by_space_count",
    monthly_subscription_amount: 0,
    tiers: spaceTiers,
    effective_from: "2026-01-01T00:00:00.000Z",
  });
  const orgCommission = term({
    id: "org-comm",
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "commission",
    commission_percent: 8,
    transaction_fee_percent: 5,
    effective_from: "2026-02-01T00:00:00.000Z",
  });
  const propertyFree = term({
    id: "prop-free",
    scope_type: "property",
    scope_id: PROP,
    commercial_model: "free",
    commission_percent: 0,
    transaction_fee_percent: 5,
    effective_from: "2026-03-01T00:00:00.000Z",
  });
  const spaceCommission = term({
    id: "space-comm",
    scope_type: "space",
    scope_id: SPACE,
    commercial_model: "commission",
    commission_percent: 12,
    transaction_fee_percent: 5,
    effective_from: "2026-04-01T00:00:00.000Z",
  });
  const rows = [platform, orgCommission, propertyFree, spaceCommission];
  const at = "2026-06-01T00:00:00.000Z";

  const otherOrg = resolveCommercialTerms({
    organisationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    effectiveAt: at,
    rows,
  });
  assert.equal(otherOrg.source, "platform");
  assert.equal(otherOrg.model, "subscription");
  assert.equal(otherOrg.subscriptionPricingMode, "by_space_count");

  const orgOverride = resolveCommercialTerms({
    organisationId: ORG,
    effectiveAt: at,
    rows,
  });
  assert.equal(orgOverride.source, "organisation");
  assert.equal(orgOverride.model, "commission");
  assert.equal(orgOverride.commissionPercent, 8);

  const propertyOverride = resolveCommercialTerms({
    organisationId: ORG,
    propertyId: PROP,
    spaceId: null,
    effectiveAt: at,
    rows,
  });
  assert.equal(propertyOverride.source, "property");
  assert.equal(propertyOverride.model, "free");

  const spaceOverride = resolveCommercialTerms({
    organisationId: ORG,
    propertyId: PROP,
    spaceId: SPACE,
    effectiveAt: at,
    rows,
  });
  assert.equal(spaceOverride.source, "space");
  assert.equal(spaceOverride.model, "commission");
  assert.equal(spaceOverride.commissionPercent, 12);
}

{
  const covered = new Set<string>([
    ...BILLABLE_SPACE_INCLUDED_STATUSES,
    ...BILLABLE_SPACE_EXCLUDED_STATUSES,
  ]);
  for (const status of SPACE_STATUS_CHECK_VALUES) {
    assert.equal(covered.has(status), true, `unclassified space status: ${status}`);
  }
  for (const status of BILLABLE_SPACE_INCLUDED_STATUSES) {
    assert.equal(isBillableSpace({ id: "x", status, archived_at: null }), true, status);
  }
  for (const status of BILLABLE_SPACE_EXCLUDED_STATUSES) {
    assert.equal(isBillableSpace({ id: "x", status, archived_at: null }), false, status);
  }
  assert.equal(
    isBillableSpace({ id: "x", status: "active", archived_at: "2026-01-01T00:00:00.000Z" }),
    false
  );

  const PROP_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
  const includedSpaces = BILLABLE_SPACE_INCLUDED_STATUSES.map((status, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa${String(20 + index).padStart(2, "0")}`,
    property_id: PROP,
    status,
    archived_at: null,
  }));
  const excludedSpaces = BILLABLE_SPACE_EXCLUDED_STATUSES.map((status, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa${String(40 + index).padStart(2, "0")}`,
    property_id: PROP,
    status,
    archived_at: status === "deleted" ? "2026-01-02T00:00:00.000Z" : null,
  }));
  const counts = countBillableInventory({
    scopeType: "organisation",
    scopeId: ORG,
    organisation: { id: ORG, status: "active", archived_at: null },
    properties: [
      { id: PROP, organisation_id: ORG, archived_at: null },
      { id: PROP_B, organisation_id: ORG, archived_at: "2026-01-01T00:00:00.000Z" },
    ],
    spaces: [
      ...includedSpaces,
      ...excludedSpaces,
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa50",
        property_id: PROP_B,
        status: "active",
        archived_at: null,
      },
    ],
  });
  assert.equal(counts.propertyCount, 1);
  assert.equal(counts.spaceCount, BILLABLE_SPACE_INCLUDED_STATUSES.length);

  const archivedOrg = countBillableInventory({
    scopeType: "organisation",
    scopeId: ORG,
    organisation: { id: ORG, status: "archived", archived_at: "2026-01-01T00:00:00.000Z" },
    properties: [{ id: PROP, organisation_id: ORG, archived_at: null }],
    spaces: [{ id: SPACE, property_id: PROP, status: "active", archived_at: null }],
  });
  assert.equal(archivedOrg.propertyCount, 0);
  assert.equal(archivedOrg.spaceCount, 0);

  const propertyScope = countBillableInventory({
    scopeType: "property",
    scopeId: PROP,
    organisation: { id: ORG, status: "active", archived_at: null },
    properties: [{ id: PROP, organisation_id: ORG, archived_at: null }],
    spaces: [
      { id: SPACE, property_id: PROP, status: "active", archived_at: null },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa51",
        property_id: PROP,
        status: "paused",
        archived_at: null,
      },
    ],
  });
  assert.equal(propertyScope.propertyCount, 1);
  assert.equal(propertyScope.spaceCount, 2);

  const spaceBillable = countBillableInventory({
    scopeType: "space",
    scopeId: SPACE,
    organisation: { id: ORG, status: "active", archived_at: null },
    properties: [{ id: PROP, organisation_id: ORG, archived_at: null }],
    spaces: [{ id: SPACE, property_id: PROP, status: "active", archived_at: null }],
  });
  assert.equal(spaceBillable.spaceCount, 1);
  const spaceUnclaimed = countBillableInventory({
    scopeType: "space",
    scopeId: SPACE,
    organisation: { id: ORG, status: "active", archived_at: null },
    properties: [{ id: PROP, organisation_id: ORG, archived_at: null }],
    spaces: [{ id: SPACE, property_id: PROP, status: "unclaimed", archived_at: null }],
  });
  assert.equal(spaceUnclaimed.spaceCount, 0);
}

{
  assert.deepEqual(
    subscriptionBilledScope({
      source: "platform",
      organisationId: ORG,
      propertyId: PROP,
      spaceId: SPACE,
    }),
    { scopeType: "organisation", scopeId: ORG }
  );
  assert.deepEqual(
    subscriptionBilledScope({
      source: "organisation",
      organisationId: ORG,
      propertyId: PROP,
      spaceId: SPACE,
    }),
    { scopeType: "organisation", scopeId: ORG }
  );
  assert.deepEqual(
    subscriptionBilledScope({
      source: "property",
      organisationId: ORG,
      propertyId: PROP,
      spaceId: SPACE,
    }),
    { scopeType: "property", scopeId: PROP }
  );
  assert.deepEqual(
    subscriptionBilledScope({
      source: "space",
      organisationId: ORG,
      propertyId: PROP,
      spaceId: SPACE,
    }),
    { scopeType: "space", scopeId: SPACE }
  );
  assert.equal(
    subscriptionBilledScope({
      source: "platform",
      organisationId: null,
    }),
    null
  );
}

{
  const overlapping = [
    {
      id: "o1",
      minCount: 1,
      maxCount: 10,
      monthlyAmount: 500,
      label: "1–10",
      sortOrder: 0,
    },
    {
      id: "o2",
      minCount: 5,
      maxCount: 20,
      monthlyAmount: 1000,
      label: "5–20",
      sortOrder: 1,
    },
  ];
  assert.equal(matchingSubscriptionTiers(7, overlapping).length, 2);
  assert.equal(matchSubscriptionTier(7, overlapping), null);
  const ambiguous = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: overlapping,
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 1,
      spaceCount: 7,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(ambiguous.unresolvedReason, "ambiguous_overlapping_tiers");
  assert.equal(ambiguous.matchedTier, null);
  assert.equal(ambiguous.monthlyAmount, 0);
}

{
  const jan = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: spaceTiers,
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 1,
      spaceCount: 4,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  const feb = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: spaceTiers,
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 1,
      spaceCount: 11,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  const janSnap = buildSubscriptionPeriodSnapshot({
    billingAt: "2026-01-15T10:00:00+02:00",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    commercialTermsId: "plat-sub",
    resolution: jan,
  });
  const febSnap = buildSubscriptionPeriodSnapshot({
    billingAt: "2026-02-15T10:00:00+02:00",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    commercialTermsId: "plat-sub",
    resolution: feb,
  });
  assert.equal(janSnap.billingMonth, "2026-01-01");
  assert.equal(janSnap.inventoryCount, 4);
  assert.equal(janSnap.monthlyAmount, 1000);
  assert.equal(febSnap.billingMonth, "2026-02-01");
  assert.equal(febSnap.inventoryCount, 11);
  assert.equal(febSnap.monthlyAmount, 1500);
  assert.equal(janSnap.monthlyAmount, 1000);
}

{
  const parsed = parseCommercialTermsWriteBody({
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 10,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "by_space_count",
    monthly_subscription_amount: 99,
    tiers: spaceTiers.map((tier) => ({
      min_count: tier.minCount,
      max_count: tier.maxCount,
      monthly_amount: tier.monthlyAmount,
      label: tier.label,
      sort_order: tier.sortOrder,
    })),
    effective_from: "2026-11-01",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.model, "subscription");
    assert.equal(parsed.value.commissionPercent, 0);
    assert.equal(parsed.value.monthlySubscriptionAmount, 0);
    assert.equal(parsed.value.subscriptionPricingMode, "by_space_count");
    assert.equal(parsed.value.tiers.length, 3);
  }

  const overlap = parseCommercialTermsWriteBody({
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "by_space_count",
    tiers: [
      { min_count: 1, max_count: 10, monthly_amount: 500 },
      { min_count: 5, max_count: 20, monthly_amount: 1000 },
    ],
    effective_from: "2026-11-01",
  });
  assert.equal(overlap.ok, false);

  const platformSub = term({
    id: "plat-sub-2",
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "by_space_count",
    tiers: spaceTiers,
    effective_from: "2026-01-01T00:00:00.000Z",
  });
  const resolved = withSubscriptionResolution(
    resolveCommercialTerms({
      organisationId: ORG,
      effectiveAt: "2026-06-01T00:00:00.000Z",
      rows: [platformSub],
    }),
    {
      organisationId: ORG,
      inventory: {
        scopeType: "organisation",
        scopeId: ORG,
        propertyCount: 1,
        spaceCount: 8,
        organisationBillable: true,
      },
    }
  );
  assert.equal(resolved.source, "platform");
  assert.equal(resolved.monthlySubscriptionAmount, 1000);
  assert.equal(resolved.subscription?.inventoryCount, 8);
  assert.equal(resolved.subscription?.matchedTier?.id, "tier-b");
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

  const migration072 = readFileSync(
    "supabase/migrations/072_20260928_commercial_subscription_tiers.sql",
    "utf8"
  );
  assert.match(migration072, /CREATE TABLE IF NOT EXISTS public\.commercial_term_tiers/);
  assert.match(
    migration072,
    /CREATE TABLE IF NOT EXISTS public\.commercial_subscription_periods/
  );
  assert.match(migration072, /subscription_pricing_mode/);
  assert.match(
    migration072,
    /REVOKE ALL ON TABLE public\.commercial_term_tiers FROM authenticated/
  );
  assert.match(
    migration072,
    /REVOKE ALL ON TABLE public\.commercial_subscription_periods FROM authenticated/
  );
  assert.doesNotMatch(migration072, /INSERT INTO public\.commercial_terms/);
  assert.doesNotMatch(migration072, /INSERT INTO public\.commercial_term_tiers/);
  assert.doesNotMatch(migration072, /INSERT INTO public\.commercial_subscription_periods/);
  assert.doesNotMatch(migration072, /UPDATE public\.bookings\s+SET/i);

  const api = readFileSync("app/api/admin/commercial-terms/route.ts", "utf8");
  assert.match(api, /requireAdminApi/);
  assert.match(api, /createCommercialTerms/);

  const searchApi = readFileSync(
    "app/api/admin/commercial-terms/search/route.ts",
    "utf8"
  );
  assert.match(searchApi, /requireAdminApi/);
  assert.match(searchApi, /decorateCommercialSearchHits/);
  assert.match(searchApi, /kindRaw !== "all"/);

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

  const termsServer = readFileSync("lib/commercial-terms-server.ts", "utf8");
  assert.doesNotMatch(termsServer, /commercial_subscription_periods/);
  const bookingCharges = readFileSync("lib/invoice.ts", "utf8");
  assert.doesNotMatch(bookingCharges, /commercial_subscription_periods/);
}

{
  const legacyRow = {
    commercial_model: null,
    platform_commission_percent: null,
    transaction_fee_percent: null,
    platform_commission_amount: null,
    transaction_fee_amount: null,
    monthly_subscription_amount: null,
    commercial_terms_id: null,
    commercial_terms_source: null,
    commercial_terms_effective_at: null,
  };
  assert.equal(bookingHasCommercialSnapshot(legacyRow), false);
  const backfill = commercialSnapshotUpdateAllowed(legacyRow, {
    ...legacyRow,
    commercial_model: "commission",
  });
  assert.equal(backfill.ok, false);
  if (!backfill.ok) assert.equal(backfill.reason, "legacy_backfill");
  assert.equal(commercialSnapshotUpdateAllowed(legacyRow, legacyRow).ok, true);

  const snapshotted = {
    commercial_model: "commission",
    platform_commission_percent: 10,
    transaction_fee_percent: 5,
    platform_commission_amount: 10,
    transaction_fee_amount: 5,
    monthly_subscription_amount: 0,
    commercial_terms_id: "fb73f905-f560-4c25-bff8-548508904afa",
    commercial_terms_source: "platform",
    commercial_terms_effective_at: "2026-09-28T15:30:00.000Z",
  };
  assert.equal(bookingHasCommercialSnapshot(snapshotted), true);
  const mutated = commercialSnapshotUpdateAllowed(snapshotted, {
    ...snapshotted,
    platform_commission_percent: 12,
  });
  assert.equal(mutated.ok, false);
  if (!mutated.ok) assert.equal(mutated.reason, "mutate_snapshot");
  assert.equal(commercialSnapshotUpdateAllowed(snapshotted, snapshotted).ok, true);
}

{
  const hostCommission = formatHostCommercialArrangement(splitCommission);
  assert.equal(
    hostCommission,
    "10% platform commission + 5% transaction fee"
  );
  const hostFree = formatHostCommercialArrangement({
    ...splitCommission,
    model: "free",
    commissionPercent: 0,
  });
  assert.equal(hostFree, "0% platform commission + 5% transaction fee");
  const hostSub = formatHostCommercialArrangement({
    ...splitCommission,
    model: "subscription",
    commissionPercent: 0,
    monthlySubscriptionAmount: 250,
    subscriptionPricingMode: "by_space_count",
    subscription: {
      billedScopeType: "organisation",
      billedScopeId: ORG,
      pricingMode: "by_space_count",
      inventoryBasis: "space",
      inventoryCount: 2,
      matchedTier: {
        id: "t1",
        minCount: 1,
        maxCount: 3,
        monthlyAmount: 250,
        label: "1-3 Spaces",
        sortOrder: 0,
      },
      monthlyAmount: 250,
      unresolvedReason: null,
    },
  });
  assert.equal(
    hostSub,
    "R250.00/month subscription + 5% transaction fee on online payments"
  );
  const hostUnresolved = formatHostCommercialArrangement({
    ...splitCommission,
    model: "subscription",
    commissionPercent: 0,
    monthlySubscriptionAmount: 0,
    subscription: {
      billedScopeType: "organisation",
      billedScopeId: ORG,
      pricingMode: "by_space_count",
      inventoryBasis: "space",
      inventoryCount: 4,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: "no_matching_tier",
    },
  });
  assert.equal(hostUnresolved, HOST_COMMERCIAL_NEUTRAL);
  const hostDto = toHostCommercialArrangementDto({
    ...splitCommission,
    model: "subscription",
    commissionPercent: 0,
    tiers: [
      {
        id: "t1",
        minCount: 1,
        maxCount: 3,
        monthlyAmount: 250,
        label: "1-3 Spaces",
        sortOrder: 0,
      },
    ],
    subscription: {
      billedScopeType: "organisation",
      billedScopeId: ORG,
      pricingMode: "by_space_count",
      inventoryBasis: "space",
      inventoryCount: 4,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: "no_matching_tier",
    },
  });
  assert.equal(hostDto.subscriptionUnresolved, true);
  assert.equal(hostDto.monthlyAmount, null);
  assert.equal(
    hostDto.subscriptionUnresolvedMessage,
    "No subscription pricing covers 4+ spaces"
  );
}

{
  const uncovered = subscriptionUncoveredInventoryWarning({
    unresolvedReason: "no_matching_tier",
    inventoryCount: 4,
    inventoryBasis: "space",
    tiers: [
      {
        id: "t1",
        minCount: 1,
        maxCount: 3,
        monthlyAmount: 250,
        label: "1-3 Spaces",
        sortOrder: 0,
      },
    ],
  });
  assert.equal(uncovered, "No subscription pricing covers 4+ spaces");
  assert.equal(
    subscriptionUncoveredInventoryWarning({
      unresolvedReason: null,
      inventoryCount: 2,
      inventoryBasis: "space",
      tiers: [
        {
          id: "t1",
          minCount: 1,
          maxCount: 3,
          monthlyAmount: 250,
          label: "1-3 Spaces",
          sortOrder: 0,
        },
      ],
    }),
    null
  );
}

{
  const unresolved = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: [
      {
        id: "t1",
        minCount: 1,
        maxCount: 3,
        monthlyAmount: 250,
        label: "1-3 Spaces",
        sortOrder: 0,
      },
    ],
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 3,
      spaceCount: 4,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(unresolved.unresolvedReason, "no_matching_tier");
  assert.equal(unresolved.monthlyAmount, 0);
  assert.equal(assertBillableSubscriptionResolution(unresolved).ok, false);
  assert.throws(() =>
    buildSubscriptionPeriodSnapshot({
      billingAt: "2026-09-28T12:00:00+02:00",
      billedScope: { scopeType: "organisation", scopeId: ORG },
      commercialTermsId: "2486aade-6746-44e3-bbf5-4e0478a81345",
      resolution: unresolved,
    })
  );
}

{
  const spaceForm = readFileSync("app/components/SpaceForm.tsx", "utf8");
  assert.doesNotMatch(spaceForm, /3\.5%/);
  assert.doesNotMatch(spaceForm, /VAT on commission/);
  assert.doesNotMatch(spaceForm, /getCommissionRate/);
  assert.match(spaceForm, /HostCommercialArrangementCard/);

  const termsPage = readFileSync("app/terms/page.tsx", "utf8");
  assert.doesNotMatch(termsPage, /3\.5%/);
  assert.match(
    termsPage,
    /commercial arrangement applicable to the listing or host/
  );

  const marketplace = readFileSync(
    "app/components/admin/MarketplaceSpacesTable.tsx",
    "utf8"
  );
  assert.doesNotMatch(marketplace, /Change platform fee/);
  assert.match(marketplace, /Commercial terms/);

  const detail = readFileSync(
    "app/components/admin/MarketplaceSpaceDetailPanel.tsx",
    "utf8"
  );
  assert.match(detail, /Legacy fallback fee/);

  const hostRoute = readFileSync(
    "app/api/host/commercial-arrangement/route.ts",
    "utf8"
  );
  assert.match(hostRoute, /toHostCommercialArrangementDto/);
  assert.doesNotMatch(hostRoute, /adminNote/);
  assert.doesNotMatch(hostRoute, /termsId/);

  const freeze = readFileSync("lib/commercial-snapshot-freeze.ts", "utf8");
  assert.match(freeze, /legacy_backfill/);

  const migration073 = readFileSync(
    "supabase/migrations/073_20260928_freeze_legacy_booking_commercial_snapshots.sql",
    "utf8"
  );
  assert.match(migration073, /Legacy bookings cannot be backfilled/);
  assert.doesNotMatch(migration073, /UPDATE public\.bookings\s+SET/i);
  assert.doesNotMatch(migration073, /INSERT INTO public\.bookings/i);

  const migration074 = readFileSync(
    "supabase/migrations/074_20260928_progressive_space_subscription_pricing.sql",
    "utf8"
  );
  assert.match(migration074, /progressive_space_pricing/);
  assert.match(migration074, /subscription_included_units/);
  assert.match(migration074, /incremental_amount/);
  assert.doesNotMatch(migration074, /INSERT INTO public\.commercial_terms/);
  assert.doesNotMatch(migration074, /INSERT INTO public\.commercial_term_tiers/);
  assert.doesNotMatch(migration074, /UPDATE public\.commercial_terms\s+SET/i);
  assert.doesNotMatch(migration074, /UPDATE public\.bookings\s+SET/i);

  const adminPanel = readFileSync(
    "app/components/admin/AdminCommercialTermsPanel.tsx",
    "utf8"
  );
  assert.match(adminPanel, /progressive_space_pricing/);
  assert.match(adminPanel, /progressive_property_pricing/);
  assert.match(adminPanel, /Base monthly fee/);
  assert.match(adminPanel, /Add open-ended properties band/);
  assert.match(adminPanel, /displayProgressiveBandLabel/);
  assert.match(adminPanel, /Per additional property/);
  assert.match(adminPanel, /Current version effective from/);
  assert.match(adminPanel, /New version effective from/);
  assert.match(
    adminPanel,
    /Changing commercial terms creates a new version/
  );
  assert.match(adminPanel, /Save this incomplete schedule anyway/);
  assert.match(adminPanel, /allow_incomplete_schedule/);
  assert.match(adminPanel, /Properties/);
  assert.match(adminPanel, /and above/);
  assert.match(adminPanel, /Monthly price preview/);
  assert.match(adminPanel, /calculateProgressiveSubscription/);
  assert.match(adminPanel, /FIXED_TIER_HELP/);
  assert.match(adminPanel, /PROGRESSIVE_PRICING_HELP/);

  const migration075 = readFileSync(
    "supabase/migrations/075_20260928_progressive_property_subscription_pricing.sql",
    "utf8"
  );
  assert.match(migration075, /progressive_property_pricing/);
  assert.doesNotMatch(migration075, /INSERT INTO public\.commercial_terms/);
  assert.doesNotMatch(migration075, /UPDATE public\.commercial_terms\s+SET/i);
  assert.doesNotMatch(migration075, /UPDATE public\.bookings\s+SET/i);
}

{
  const exampleBands = [
    { minCount: 2, maxCount: 10, incrementalAmount: 50, label: "2–10" },
    { minCount: 11, maxCount: null, incrementalAmount: 25, label: "11+" },
  ];
  const amountFor = (count: number) =>
    calculateProgressiveSpaceSubscription({
      baseAmount: 250,
      includedUnits: 1,
      bands: exampleBands,
      billableCount: count,
    });

  const zero = amountFor(0);
  assert.equal(zero.monthlyAmount, 0);
  assert.equal(zero.covered, true);
  assert.equal(zero.unresolvedReason, null);

  assert.equal(amountFor(1).monthlyAmount, 250);
  assert.equal(amountFor(2).monthlyAmount, 300);
  assert.equal(amountFor(3).monthlyAmount, 350);
  assert.equal(amountFor(5).monthlyAmount, 450);
  assert.equal(amountFor(10).monthlyAmount, 700);
  assert.equal(amountFor(11).monthlyAmount, 725);
  assert.equal(amountFor(20).monthlyAmount, 950);
  assert.equal(amountFor(50).monthlyAmount, 1700);

  const twenty = amountFor(20);
  assert.equal(twenty.breakdown[0].subtotal, 250);
  assert.equal(twenty.breakdown[1].unitCount, 9);
  assert.equal(twenty.breakdown[1].subtotal, 450);
  assert.equal(twenty.breakdown[2].unitCount, 10);
  assert.equal(twenty.breakdown[2].subtotal, 250);
  assert.ok(progressivePreviewCounts(1, exampleBands).includes(11));
}

{
  const custom = calculateProgressiveSpaceSubscription({
    baseAmount: 100,
    includedUnits: 0,
    bands: [
      { minCount: 1, maxCount: 1, incrementalAmount: 40, label: "1" },
      { minCount: 2, maxCount: 5, incrementalAmount: 30, label: "2–5" },
      { minCount: 6, maxCount: 10, incrementalAmount: 20, label: "6–10" },
      { minCount: 11, maxCount: 20, incrementalAmount: 10, label: "11–20" },
      { minCount: 21, maxCount: null, incrementalAmount: 5, label: "21+" },
    ],
    billableCount: 21,
  });
  assert.equal(custom.covered, true);
  assert.equal(custom.monthlyAmount, 100 + 40 + 4 * 30 + 5 * 20 + 10 * 10 + 1 * 5);
}

{
  const overlap = validateProgressiveBands([
    { minCount: 2, maxCount: 10, incrementalAmount: 50, label: null },
    { minCount: 8, maxCount: null, incrementalAmount: 25, label: null },
  ]);
  assert.equal(overlap.ok, false);

  const openEndedMiddle = validateProgressiveBands([
    { minCount: 2, maxCount: null, incrementalAmount: 50, label: null },
    { minCount: 11, maxCount: 20, incrementalAmount: 25, label: null },
  ]);
  assert.equal(openEndedMiddle.ok, false);

  const duplicateMin = validateProgressiveBands([
    { minCount: 2, maxCount: 5, incrementalAmount: 50, label: null },
    { minCount: 2, maxCount: 10, incrementalAmount: 25, label: null },
  ]);
  assert.equal(duplicateMin.ok, false);
}

{
  const gapped = calculateProgressiveSpaceSubscription({
    baseAmount: 250,
    includedUnits: 1,
    bands: [
      { minCount: 3, maxCount: 10, incrementalAmount: 50, label: "3–10" },
      { minCount: 11, maxCount: null, incrementalAmount: 25, label: "11+" },
    ],
    billableCount: 5,
  });
  assert.equal(gapped.covered, false);
  assert.equal(gapped.monthlyAmount, 0);
  assert.equal(gapped.unresolvedReason, "no_matching_tier");
  assert.equal(gapped.uncoveredCount, 1);
  assert.match(String(progressiveBandGapWarning(1, [
    { minCount: 3, maxCount: 10, incrementalAmount: 50, label: null },
    { minCount: 11, maxCount: null, incrementalAmount: 25, label: null },
  ])), /Pricing gap: space 2 is not covered/);
  assert.match(
    String(
      progressiveBandGapWarning(
        1,
        [{ minCount: 2, maxCount: 3, incrementalAmount: 50, label: null }],
        "property"
      )
    ),
    /Pricing gap: properties 4 and above are not covered/
  );
}

{
  const parsed = parseCommercialTermsWriteBody({
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "progressive_space_pricing",
    monthly_subscription_amount: 250,
    subscription_included_units: 1,
    tiers: [
      { min_count: 2, max_count: 10, incremental_amount: 50, label: "2–10" },
      { min_count: 11, max_count: null, incremental_amount: 25, label: "11+" },
    ],
    effective_from: "2026-11-01",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.monthlySubscriptionAmount, 250);
    assert.equal(parsed.value.subscriptionIncludedUnits, 1);
    assert.equal(parsed.value.subscriptionPricingMode, "progressive_space_pricing");
    assert.equal(parsed.value.tiers[0].incrementalAmount, 50);
  }

  const overlapWrite = parseCommercialTermsWriteBody({
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "progressive_space_pricing",
    monthly_subscription_amount: 250,
    subscription_included_units: 1,
    tiers: [
      { min_count: 2, max_count: 10, incremental_amount: 50 },
      { min_count: 8, max_count: null, incremental_amount: 25 },
    ],
    effective_from: "2026-11-01",
  });
  assert.equal(overlapWrite.ok, false);
}

{
  const progressiveTiers: CommercialTermTier[] = [
    {
      id: "b1",
      minCount: 2,
      maxCount: 10,
      monthlyAmount: 0,
      incrementalAmount: 50,
      label: "2–10",
      sortOrder: 0,
    },
    {
      id: "b2",
      minCount: 11,
      maxCount: null,
      monthlyAmount: 0,
      incrementalAmount: 25,
      label: "11+",
      sortOrder: 1,
    },
  ];
  const v1 = term({
    id: "prog-v1",
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "progressive_space_pricing",
    monthly_subscription_amount: 250,
    subscription_included_units: 1,
    tiers: progressiveTiers,
    effective_from: "2026-01-01T00:00:00.000Z",
    superseded_at: "2026-06-01T00:00:00.000Z",
  });
  const v2 = term({
    id: "prog-v2",
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "progressive_space_pricing",
    monthly_subscription_amount: 400,
    subscription_included_units: 1,
    tiers: progressiveTiers,
    effective_from: "2026-06-01T00:00:00.000Z",
  });
  const jan = withSubscriptionResolution(
    resolveCommercialTerms({
      organisationId: ORG,
      effectiveAt: "2026-03-15T00:00:00.000Z",
      rows: [v1, v2],
    }),
    {
      organisationId: ORG,
      inventory: {
        scopeType: "organisation",
        scopeId: ORG,
        propertyCount: 1,
        spaceCount: 5,
        organisationBillable: true,
      },
    }
  );
  const jul = withSubscriptionResolution(
    resolveCommercialTerms({
      organisationId: ORG,
      effectiveAt: "2026-07-15T00:00:00.000Z",
      rows: [v1, v2],
    }),
    {
      organisationId: ORG,
      inventory: {
        scopeType: "organisation",
        scopeId: ORG,
        propertyCount: 1,
        spaceCount: 5,
        organisationBillable: true,
      },
    }
  );
  assert.equal(jan.termsId, "prog-v1");
  assert.equal(jan.monthlySubscriptionAmount, 450);
  assert.equal(jan.subscriptionBaseAmount, 250);
  assert.equal(jul.termsId, "prog-v2");
  assert.equal(jul.monthlySubscriptionAmount, 600);
  assert.equal(jul.subscriptionBaseAmount, 400);
}

{
  const propertyBands = [
    { minCount: 2, maxCount: 10, incrementalAmount: 50, label: "2–10" },
    { minCount: 11, maxCount: null, incrementalAmount: 25, label: "11+" },
  ];
  const amountFor = (count: number) =>
    calculateProgressiveSubscription({
      baseAmount: 250,
      includedUnits: 1,
      bands: propertyBands,
      unitCount: count,
      unitType: "property",
    });

  assert.equal(amountFor(0).monthlyAmount, 0);
  assert.equal(amountFor(0).covered, true);
  assert.equal(amountFor(0).calculationText, "No billable properties");
  assert.equal(amountFor(1).monthlyAmount, 250);
  assert.equal(amountFor(1).calculationText, "Base");
  assert.equal(amountFor(2).monthlyAmount, 300);
  assert.equal(amountFor(2).calculationText, "R250 + 1 × R50");
  assert.equal(amountFor(3).monthlyAmount, 350);
  const spacesLabel = calculateProgressiveSubscription({
    baseAmount: 250,
    includedUnits: 1,
    bands: [
      { minCount: 2, maxCount: 10, incrementalAmount: 50, label: "2-10 Spaces" },
    ],
    unitCount: 3,
    unitType: "property",
  });
  assert.equal(spacesLabel.monthlyAmount, 350);
  assert.equal(spacesLabel.breakdown[1]?.label, "2–10 properties");
  assert.equal(amountFor(5).monthlyAmount, 450);
  assert.equal(amountFor(5).calculationText, "R250 + 4 × R50");
  assert.equal(amountFor(10).monthlyAmount, 700);
  assert.equal(amountFor(11).monthlyAmount, 725);
  assert.equal(amountFor(11).calculationText, "R700 + 1 × R25");
  assert.equal(amountFor(20).monthlyAmount, 950);
  assert.equal(amountFor(20).calculationText, "R700 + 10 × R25");
  assert.equal(amountFor(50).monthlyAmount, 1700);
  assert.ok(progressivePreviewCounts(1, propertyBands, "property").includes(3));

  const overlap = validateProgressiveBands(
    [
      { minCount: 2, maxCount: 10, incrementalAmount: 50, label: null },
      { minCount: 8, maxCount: null, incrementalAmount: 25, label: null },
    ],
    "property"
  );
  assert.equal(overlap.ok, false);

  const gapCalc = calculateProgressiveSubscription({
    baseAmount: 250,
    includedUnits: 1,
    bands: [
      { minCount: 3, maxCount: 10, incrementalAmount: 50, label: "3–10" },
      { minCount: 11, maxCount: null, incrementalAmount: 25, label: "11+" },
    ],
    unitCount: 5,
    unitType: "property",
  });
  assert.equal(gapCalc.covered, false);
  assert.equal(gapCalc.monthlyAmount, 0);
  assert.equal(gapCalc.unresolvedReason, "no_matching_tier");

  const parsedProperty = parseCommercialTermsWriteBody({
    scope_type: "platform",
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "progressive_property_pricing",
    monthly_subscription_amount: 250,
    subscription_included_units: 1,
    tiers: [
      { min_count: 2, max_count: 10, incremental_amount: 50, label: "2–10" },
      { min_count: 11, max_count: null, incremental_amount: 25, label: "11+" },
    ],
    effective_from: "2026-11-01",
  });
  assert.equal(parsedProperty.ok, true);
  if (parsedProperty.ok) {
    assert.equal(parsedProperty.value.subscriptionPricingMode, "progressive_property_pricing");
    assert.equal(parsedProperty.value.monthlySubscriptionAmount, 250);
    assert.equal(parsedProperty.value.subscriptionIncludedUnits, 1);
  }

  const inventory = {
    scopeType: "organisation" as const,
    scopeId: ORG,
    propertyCount: 3,
    spaceCount: 20,
    organisationBillable: true,
  };
  assert.equal(
    inventoryCountForMode("progressive_property_pricing", inventory),
    3
  );
  assert.equal(inventoryCountForMode("progressive_space_pricing", inventory), 20);
  assert.equal(inventoryCountForMode("by_property_count", inventory), 3);

  const propertyResolved = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "progressive_property_pricing",
    fixedMonthlyAmount: 250,
    includedUnits: 1,
    tiers: [
      {
        id: "p1",
        minCount: 2,
        maxCount: 10,
        monthlyAmount: 0,
        incrementalAmount: 50,
        label: "2–10",
        sortOrder: 0,
      },
      {
        id: "p2",
        minCount: 11,
        maxCount: null,
        monthlyAmount: 0,
        incrementalAmount: 25,
        label: "11+",
        sortOrder: 1,
      },
    ],
    inventory,
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(propertyResolved.inventoryBasis, "property");
  assert.equal(propertyResolved.inventoryCount, 3);
  assert.equal(propertyResolved.monthlyAmount, 350);
  assert.equal(propertyResolved.unresolvedReason, null);

  const spaceStillUsesSpaces = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "progressive_space_pricing",
    fixedMonthlyAmount: 250,
    includedUnits: 1,
    tiers: [
      {
        id: "s1",
        minCount: 2,
        maxCount: 10,
        monthlyAmount: 0,
        incrementalAmount: 50,
        label: "2–10",
        sortOrder: 0,
      },
      {
        id: "s2",
        minCount: 11,
        maxCount: null,
        monthlyAmount: 0,
        incrementalAmount: 25,
        label: "11+",
        sortOrder: 1,
      },
    ],
    inventory,
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(spaceStillUsesSpaces.inventoryBasis, "space");
  assert.equal(spaceStillUsesSpaces.inventoryCount, 20);
  assert.equal(spaceStillUsesSpaces.monthlyAmount, 950);

  const fixedPropertyTier = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_property_count",
    fixedMonthlyAmount: 0,
    tiers: [
      {
        id: "fp",
        minCount: 1,
        maxCount: 5,
        monthlyAmount: 400,
        label: "1–5 properties",
        sortOrder: 0,
      },
    ],
    inventory,
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(fixedPropertyTier.inventoryCount, 3);
  assert.equal(fixedPropertyTier.monthlyAmount, 400);
  assert.equal(fixedPropertyTier.unresolvedReason, null);
}

{
  const DRAKENSTEIN = "384246ab-50b2-430e-b53c-475b574b6fa6";
  const PGH = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
  const platform = term({
    id: "fb73f905-f560-4c25-bff8-548508904afa",
    scope_type: "platform",
    commercial_model: "commission",
    commission_percent: 10,
    transaction_fee_percent: 5,
    monthly_subscription_amount: 0,
    effective_from: "2026-09-27T22:00:00.000Z",
  });
  const pgh = term({
    id: "10dbeb16-a5d1-4bd6-8c66-09b5a064748e",
    scope_type: "organisation",
    scope_id: PGH,
    commercial_model: "free",
    commission_percent: 0,
    transaction_fee_percent: 5,
    monthly_subscription_amount: 0,
    effective_from: "2026-09-27T22:00:00.000Z",
  });
  const drakenstein = term({
    id: "2486aade-6746-44e3-bbf5-4e0478a81345",
    scope_type: "organisation",
    scope_id: DRAKENSTEIN,
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "by_space_count",
    monthly_subscription_amount: 0,
    tiers: [
      {
        id: "f7bbef2e-d29c-46a4-a7ca-993de2820604",
        minCount: 1,
        maxCount: 3,
        monthlyAmount: 250,
        label: "1-3 Spaces",
        sortOrder: 0,
      },
    ],
    effective_from: "2026-09-27T22:00:00.000Z",
  });
  const rows = [platform, pgh, drakenstein];

  const platformResolved = resolveCommercialTerms({
    effectiveAt: "2026-09-28T12:00:00.000Z",
    rows,
  });
  assert.equal(platformResolved.model, "commission");
  assert.equal(platformResolved.commissionPercent, 10);
  assert.equal(platformResolved.transactionFeePercent, 5);

  const pghResolved = resolveCommercialTerms({
    organisationId: PGH,
    effectiveAt: "2026-09-28T12:00:00.000Z",
    rows,
  });
  assert.equal(pghResolved.model, "free");
  assert.equal(pghResolved.commissionPercent, 0);
  assert.equal(pghResolved.transactionFeePercent, 5);

  const drakensteinResolved = withSubscriptionResolution(
    resolveCommercialTerms({
      organisationId: DRAKENSTEIN,
      effectiveAt: "2026-09-28T12:00:00.000Z",
      rows,
    }),
    {
      organisationId: DRAKENSTEIN,
      inventory: {
        scopeType: "organisation",
        scopeId: DRAKENSTEIN,
        propertyCount: 3,
        spaceCount: 2,
        organisationBillable: true,
      },
    }
  );
  assert.equal(drakensteinResolved.model, "subscription");
  assert.equal(drakensteinResolved.subscriptionPricingMode, "by_space_count");
  assert.equal(drakensteinResolved.monthlySubscriptionAmount, 250);
  assert.equal(drakensteinResolved.subscription?.unresolvedReason, null);

  const fixedMonthly = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "fixed",
    fixedMonthlyAmount: 1800,
    tiers: [],
    inventory: null,
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(fixedMonthly.monthlyAmount, 1800);
  assert.equal(fixedMonthly.unresolvedReason, null);
}

{
  assert.equal(
    commercialCalendarDate("2026-09-27T22:00:00.000Z"),
    "2026-09-28"
  );
  assert.equal(commercialCalendarDate("2026-09-28T00:00:00+02:00"), "2026-09-28");
  assert.equal(formatCommercialDisplayDate("2026-09-28T00:00:00+02:00"), "28 September 2026");
  assert.equal(
    suggestedCommercialEffectiveDate({
      occupiedFrom: ["2026-09-27T22:00:00.000Z"],
      today: "2026-09-28",
    }),
    "2026-09-29"
  );
  assert.equal(
    suggestedCommercialEffectiveDate({
      occupiedFrom: ["2026-09-27T00:00:00.000Z"],
      today: "2026-09-28",
    }),
    "2026-09-28"
  );
  const conflict = commercialEffectiveDateConflictMessage(
    "2026-09-27T22:00:00.000Z",
    "2026-09-29"
  );
  assert.match(conflict, /already starts on 28 September 2026/);
  assert.match(conflict, /Suggested effective date: 29 September 2026/);
  assert.doesNotMatch(conflict, /commercial_terms_scope_effective_uidx/);
  assert.doesNotMatch(conflict, /duplicate key/);

  assert.equal(
    isCommercialTermsEffectiveDateUniqueConflict({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "commercial_terms_scope_effective_uidx"',
    }),
    true
  );
  const friendly = friendlyCommercialTermsWriteError(
    'duplicate key value violates unique constraint "commercial_terms_scope_effective_uidx"'
  );
  assert.ok(friendly);
  assert.doesNotMatch(String(friendly), /commercial_terms_scope_effective_uidx/);
  assert.doesNotMatch(String(friendly), /duplicate key/);
  assert.equal(COMMERCIAL_TERMS_EFFECTIVE_DATE_CONFLICT, "commercial_terms_effective_date_conflict");

  const fakeRes = {
    headers: { get: () => "application/json" },
    status: 500,
    statusText: "Internal Server Error",
  } as unknown as Response;
  const sanitized = parseApiFetchError(
    fakeRes,
    'duplicate key value violates unique constraint "commercial_terms_scope_effective_uidx"',
    {
      error:
        'duplicate key value violates unique constraint "commercial_terms_scope_effective_uidx"',
    }
  );
  assert.doesNotMatch(sanitized, /commercial_terms_scope_effective_uidx/);
  assert.doesNotMatch(sanitized, /duplicate key/);
  assert.match(sanitized, /already starts on this effective date/);

  const incomplete = parseCommercialTermsWriteBody({
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "progressive_property_pricing",
    monthly_subscription_amount: 250,
    subscription_included_units: 1,
    tiers: [{ min_count: 2, max_count: 3, incremental_amount: 50, label: "2–3" }],
    effective_from: "2026-09-28",
  });
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) {
    assert.match(incomplete.error, /properties 4 and above are not covered/);
  }

  const allowedIncomplete = parseCommercialTermsWriteBody({
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "progressive_property_pricing",
    monthly_subscription_amount: 250,
    subscription_included_units: 1,
    tiers: [{ min_count: 2, max_count: 3, incremental_amount: 50, label: "2–3" }],
    effective_from: "2026-09-29",
    allow_incomplete_schedule: true,
  });
  assert.equal(allowedIncomplete.ok, true);

  const laterDate = parseCommercialTermsWriteBody({
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    subscription_pricing_mode: "progressive_property_pricing",
    monthly_subscription_amount: 250,
    subscription_included_units: 1,
    tiers: [
      { min_count: 2, max_count: 10, incremental_amount: 50, label: "2–10" },
      { min_count: 11, max_count: null, incremental_amount: 25, label: "11+" },
    ],
    effective_from: "2026-09-29",
  });
  assert.equal(laterDate.ok, true);

  const termsApi = readFileSync("app/api/admin/commercial-terms/route.ts", "utf8");
  assert.match(termsApi, /COMMERCIAL_TERMS_EFFECTIVE_DATE_CONFLICT/);
  assert.match(termsApi, /CommercialTermsWriteError/);
  const termsLib = readFileSync("lib/commercial-terms.ts", "utf8");
  assert.match(termsLib, /commercial_terms_effective_date_conflict/);
  const termsServer = readFileSync("lib/commercial-terms-server.ts", "utf8");
  assert.match(termsServer, /COMMERCIAL_TERMS_EFFECTIVE_DATE_CONFLICT/);
  assert.match(termsServer, /isCommercialTermsEffectiveDateUniqueConflict/);
  assert.doesNotMatch(
    termsServer,
    /throw new Error\(error\?\.message \|\| "Could not save commercial terms\."\);[\s\S]*commercial_terms_scope_effective_uidx/
  );

  const uniqueIndex = readFileSync(
    "supabase/migrations/071_20260928_platform_commercial_terms.sql",
    "utf8"
  );
  assert.match(uniqueIndex, /commercial_terms_scope_effective_uidx/);
}

console.log("commercial-terms tests passed");
