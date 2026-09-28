#!/usr/bin/env node
/**
 * Monthly subscription billing — eligibility, snapshots, invoice numbers,
 * authority, and accounting separation. No production writes.
 * Run: npm run test:subscription-billing
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import { calculateProgressiveSubscription } from "../lib/commercial-progressive-pricing";
import {
  billingMonthStart,
  buildSubscriptionPeriodSnapshot,
  resolveSubscriptionAmount,
} from "../lib/commercial-subscription";
import {
  resolveCommercialTerms,
  withSubscriptionResolution,
  type CommercialTermRow,
} from "../lib/commercial-terms";
import { generateInvoiceNumber } from "../lib/invoice";
import {
  buildSubscriptionCalculationSnapshot,
  canIssueSubscriptionInvoice,
  canRecordSubscriptionPayment,
  canVoidSubscriptionInvoice,
  defaultSubscriptionDueDate,
  evaluateSubscriptionEligibility,
  formatSubscriptionInvoiceNumber,
  isSubscriptionInvoiceNumber,
  parseBillingMonthInput,
  billingMonthEffectiveAt,
  skipReasonMessage,
  summariseSubscriptionRevenue,
  type SubscriptionPeriodRow,
} from "../lib/subscription-billing";
import { hostingNavItems } from "../lib/dashboard-nav";
import { summarizeHostingAccessForContext } from "../lib/access/hosting-access";

const ORG = "384246ab-50b2-430e-b53c-475b574b6fa6";
const PGH = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const USER = "11111111-1111-4111-8111-111111111111";

function grant(
  role: OrganisationAccessGrant["role"],
  organisationId = ORG
): OrganisationAccessGrant {
  return {
    organisationId,
    role,
    propertyId: null,
    spaceId: null,
    status: "active",
  };
}

function access(ctx: Partial<AccessContext> = {}): ReturnType<typeof computeAccess> {
  return computeAccess({
    userId: ctx.userId ?? USER,
    profileRole: ctx.profileRole ?? "user",
    adminAccessDisabled: ctx.adminAccessDisabled ?? false,
    grants: ctx.grants ?? [],
    organisationId: ctx.organisationId ?? ORG,
    propertyId: ctx.propertyId ?? null,
    spaceId: ctx.spaceId ?? null,
    spaceOwnerId: ctx.spaceOwnerId ?? null,
    propertyOwnerId: ctx.propertyOwnerId ?? null,
  });
}

{
  assert.equal(parseBillingMonthInput("2026-10"), "2026-10-01");
  assert.equal(parseBillingMonthInput("2026-10-01"), "2026-10-01");
  assert.equal(billingMonthStart("2026-10-15T22:00:00.000Z"), "2026-10-01");
  assert.equal(
    billingMonthEffectiveAt("2026-10-01").toISOString(),
    "2026-09-30T22:00:00.000Z"
  );
  assert.equal(defaultSubscriptionDueDate("2026-10-01"), "2026-10-15");
}

{
  const commission = evaluateSubscriptionEligibility({
    model: "commission",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    resolution: null,
  });
  assert.equal(commission.eligible, false);
  if (!commission.eligible) assert.equal(commission.reason, "excluded_model");

  const free = evaluateSubscriptionEligibility({
    model: "free",
    billedScope: { scopeType: "organisation", scopeId: PGH },
    resolution: null,
  });
  assert.equal(free.eligible, false);
  if (!free.eligible) assert.equal(free.reason, "excluded_model");
}

{
  const progressive = calculateProgressiveSubscription({
    baseAmount: 250,
    includedUnits: 1,
    bands: [{ minCount: 2, maxCount: 10, incrementalAmount: 50, label: "2–10" }],
    unitCount: 3,
    unitType: "property",
  });
  assert.equal(progressive.covered, true);
  assert.equal(progressive.monthlyAmount, 350);

  const resolution = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "progressive_property_pricing",
    fixedMonthlyAmount: 250,
    includedUnits: 1,
    tiers: [
      {
        id: "band-2-10",
        minCount: 2,
        maxCount: 10,
        monthlyAmount: 0,
        incrementalAmount: 50,
        label: "2–10",
        sortOrder: 0,
      },
    ],
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 3,
      spaceCount: 2,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(resolution.unresolvedReason, null);
  assert.equal(resolution.monthlyAmount, 350);
  const eligible = evaluateSubscriptionEligibility({
    model: "subscription",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    resolution,
  });
  assert.equal(eligible.eligible, true);
}

{
  const fixed = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "fixed",
    fixedMonthlyAmount: 1800,
    tiers: [],
    inventory: null,
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(fixed.monthlyAmount, 1800);
  assert.equal(
    evaluateSubscriptionEligibility({
      model: "subscription",
      billedScope: { scopeType: "organisation", scopeId: ORG },
      resolution: fixed,
    }).eligible,
    true
  );

  const tiered = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: [
      {
        id: "1-3",
        minCount: 1,
        maxCount: 3,
        monthlyAmount: 250,
        incrementalAmount: null,
        label: "1-3 Spaces",
        sortOrder: 0,
      },
    ],
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 3,
      spaceCount: 2,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(tiered.monthlyAmount, 250);
  assert.equal(tiered.unresolvedReason, null);

  const spaceProgressive = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "progressive_space_pricing",
    fixedMonthlyAmount: 250,
    includedUnits: 1,
    tiers: [
      {
        id: "2-10",
        minCount: 2,
        maxCount: 10,
        monthlyAmount: 0,
        incrementalAmount: 50,
        label: "2–10",
        sortOrder: 0,
      },
    ],
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 3,
      spaceCount: 5,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(spaceProgressive.monthlyAmount, 450);
}

{
  const unresolved = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "by_space_count",
    fixedMonthlyAmount: 0,
    tiers: [
      {
        id: "1-3",
        minCount: 1,
        maxCount: 3,
        monthlyAmount: 250,
        incrementalAmount: null,
        label: "1-3",
        sortOrder: 0,
      },
    ],
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 1,
      spaceCount: 8,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(unresolved.unresolvedReason, "no_matching_tier");
  const blocked = evaluateSubscriptionEligibility({
    model: "subscription",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    resolution: unresolved,
  });
  assert.equal(blocked.eligible, false);
  if (!blocked.eligible) assert.equal(blocked.reason, "unresolved");
  assert.match(skipReasonMessage("unresolved"), /unresolved/i);
}

{
  const zeroInventory = resolveSubscriptionAmount({
    model: "subscription",
    pricingMode: "progressive_property_pricing",
    fixedMonthlyAmount: 250,
    includedUnits: 1,
    tiers: [
      {
        id: "2-10",
        minCount: 2,
        maxCount: 10,
        monthlyAmount: 0,
        incrementalAmount: 50,
        label: "2–10",
        sortOrder: 0,
      },
    ],
    inventory: {
      scopeType: "organisation",
      scopeId: ORG,
      propertyCount: 0,
      spaceCount: 0,
      organisationBillable: true,
    },
    billedScope: { scopeType: "organisation", scopeId: ORG },
  });
  assert.equal(zeroInventory.monthlyAmount, 0);
  const skipped = evaluateSubscriptionEligibility({
    model: "subscription",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    resolution: zeroInventory,
  });
  assert.equal(skipped.eligible, false);
  if (!skipped.eligible) assert.equal(skipped.reason, "zero_inventory");
}

{
  const october = buildSubscriptionPeriodSnapshot({
    billingAt: "2026-10-01T00:00:00+02:00",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    commercialTermsId: "terms-oct",
    resolution: {
      billedScopeType: "organisation",
      billedScopeId: ORG,
      pricingMode: "progressive_property_pricing",
      inventoryBasis: "property",
      inventoryCount: 3,
      matchedTier: null,
      monthlyAmount: 350,
      unresolvedReason: null,
      breakdown: [],
    },
  });
  const november = buildSubscriptionPeriodSnapshot({
    billingAt: "2026-11-01T00:00:00+02:00",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    commercialTermsId: "terms-nov",
    resolution: {
      billedScopeType: "organisation",
      billedScopeId: ORG,
      pricingMode: "progressive_property_pricing",
      inventoryBasis: "property",
      inventoryCount: 5,
      matchedTier: null,
      monthlyAmount: 450,
      unresolvedReason: null,
      breakdown: [],
    },
  });
  assert.equal(october.billingMonth, "2026-10-01");
  assert.equal(october.monthlyAmount, 350);
  assert.equal(october.inventoryCount, 3);
  assert.equal(november.billingMonth, "2026-11-01");
  assert.equal(november.monthlyAmount, 450);
  assert.notEqual(october.monthlyAmount, november.monthlyAmount);
}

{
  const previous: CommercialTermRow = {
    id: "old",
    scope_type: "organisation",
    scope_id: ORG,
    commercial_model: "subscription",
    commission_percent: 0,
    transaction_fee_percent: 5,
    monthly_subscription_amount: 250,
    subscription_pricing_mode: "fixed",
    subscription_included_units: null,
    effective_from: "2026-09-01T00:00:00+02:00",
    superseded_at: "2026-10-15T00:00:00+02:00",
    admin_note: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00+02:00",
    tiers: [],
  };
  const next: CommercialTermRow = {
    ...previous,
    id: "new",
    monthly_subscription_amount: 400,
    effective_from: "2026-10-15T00:00:00+02:00",
    superseded_at: null,
  };
  const october = withSubscriptionResolution(
    resolveCommercialTerms({
      organisationId: ORG,
      effectiveAt: billingMonthEffectiveAt("2026-10-01"),
      rows: [previous, next],
    }),
    { organisationId: ORG }
  );
  const november = withSubscriptionResolution(
    resolveCommercialTerms({
      organisationId: ORG,
      effectiveAt: billingMonthEffectiveAt("2026-11-01"),
      rows: [previous, next],
    }),
    { organisationId: ORG }
  );
  assert.equal(october.monthlySubscriptionAmount, 250);
  assert.equal(november.monthlySubscriptionAmount, 400);
}

{
  assert.equal(formatSubscriptionInvoiceNumber(2026, 1), "FMS-SUB-2026-0001");
  assert.equal(formatSubscriptionInvoiceNumber(2026, 12), "FMS-SUB-2026-0012");
  assert.equal(isSubscriptionInvoiceNumber("FMS-SUB-2026-0001"), true);
  assert.equal(isSubscriptionInvoiceNumber(generateInvoiceNumber(ORG)), false);
  assert.match(generateInvoiceNumber(ORG), /^FMS-/);
  assert.doesNotMatch(generateInvoiceNumber(ORG), /^FMS-SUB-/);
}

{
  const open: Pick<SubscriptionPeriodRow, "status" | "payment_status" | "monthly_amount"> = {
    status: "open",
    payment_status: "unpaid",
    monthly_amount: 350,
  };
  assert.equal(canIssueSubscriptionInvoice(open).ok, true);
  const invoiced = { ...open, status: "invoiced" as const };
  assert.equal(canIssueSubscriptionInvoice(invoiced).ok, false);
  assert.equal(canRecordSubscriptionPayment(invoiced).ok, true);
  assert.equal(canRecordSubscriptionPayment(open).ok, false);
  const paid = { ...invoiced, payment_status: "paid" as const };
  assert.equal(canVoidSubscriptionInvoice(paid).ok, false);
  assert.equal(canVoidSubscriptionInvoice(invoiced).ok, true);
  assert.deepEqual(
    summariseSubscriptionRevenue([
      { status: "invoiced", payment_status: "unpaid", monthly_amount: 350 },
      { status: "invoiced", payment_status: "paid", monthly_amount: 350 },
      { status: "open", payment_status: "unpaid", monthly_amount: 999 },
    ]),
    { invoiced: 700, paid: 350, outstanding: 350 }
  );
}

{
  const snapshot = buildSubscriptionCalculationSnapshot({
    billingMonth: "2026-10-01",
    billedScope: { scopeType: "organisation", scopeId: ORG },
    billedOrganisationId: ORG,
    billedOrganisationName: "Drakenstein Municipality",
    billedPartyName: "Drakenstein Municipality",
    termsId: "571d053b-dac6-48ee-b6ef-a038a44f82ba",
    termsEffectiveFrom: "2026-09-28T22:00:00.000Z",
    includedUnits: 1,
    baseAmount: 250,
    arrangementSummary: "Subscription",
    resolution: {
      billedScopeType: "organisation",
      billedScopeId: ORG,
      pricingMode: "progressive_property_pricing",
      inventoryBasis: "property",
      inventoryCount: 3,
      matchedTier: null,
      monthlyAmount: 350,
      unresolvedReason: null,
      breakdown: [
        { kind: "base", label: "Base", unitCount: 1, rate: 250, subtotal: 250, minCount: null, maxCount: null },
        { kind: "band", label: "2–10", unitCount: 2, rate: 50, subtotal: 100, minCount: 2, maxCount: 10 },
      ],
    },
  });
  assert.equal(snapshot.monthlyAmount, 350);
  assert.equal(snapshot.transactionFeesIncluded, false);
  snapshot.monthlyAmount = 999;
  assert.equal(snapshot.inventoryCount, 3);
}

{
  const oa = access({ grants: [grant("org_admin")] });
  assert.equal(oa.isOrganisationAdmin, true);
  assert.equal(oa.canManageOrganisationFinance, true);
  const pm = access({
    grants: [
      {
        organisationId: ORG,
        role: "property_manager",
        propertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        spaceId: null,
        status: "active",
      },
    ],
    propertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.equal(pm.canManageOrganisationFinance, false);
  const sm = access({
    grants: [
      {
        organisationId: ORG,
        role: "space_manager",
        propertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        spaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "active",
      },
    ],
    propertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    spaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  assert.equal(sm.canManageOrganisationFinance, false);
  const ga = access({ profileRole: "admin" });
  assert.equal(ga.canManageOrganisationFinance, true);
}

{
  const oaNav = hostingNavItems(
    summarizeHostingAccessForContext(
      {
        profileRole: "user",
        isHostProfile: false,
        ownedSpaceCount: 0,
        ownedPropertyCount: 0,
        grants: [grant("org_admin")],
      },
      { kind: "organisation", organisationId: ORG }
    ),
    ORG
  ).map((item) => item.href.split("?")[0]);
  assert.equal(oaNav.includes("/dashboard/subscription"), true);

  const pmNav = hostingNavItems(
    summarizeHostingAccessForContext(
      {
        profileRole: "user",
        isHostProfile: false,
        ownedSpaceCount: 0,
        ownedPropertyCount: 0,
        grants: [
          {
            organisationId: ORG,
            role: "property_manager",
            propertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            spaceId: null,
            status: "active",
          },
        ],
      },
      { kind: "organisation", organisationId: ORG }
    ),
    ORG
  ).map((item) => item.href.split("?")[0]);
  assert.equal(pmNav.includes("/dashboard/subscription"), false);

  const smNav = hostingNavItems(
    summarizeHostingAccessForContext(
      {
        profileRole: "user",
        isHostProfile: false,
        ownedSpaceCount: 0,
        ownedPropertyCount: 0,
        grants: [
          {
            organisationId: ORG,
            role: "space_manager",
            propertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            spaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "active",
          },
        ],
      },
      { kind: "organisation", organisationId: ORG }
    ),
    ORG
  ).map((item) => item.href.split("?")[0]);
  assert.equal(smNav.includes("/dashboard/subscription"), false);
}

{
  const migration = readFileSync(
    "supabase/migrations/076_20260928_subscription_billing_invoices.sql",
    "utf8"
  );
  assert.match(migration, /invoice_number/);
  assert.match(migration, /payment_status/);
  assert.match(migration, /FMS-SUB-/);
  assert.match(migration, /next_subscription_invoice_number/);
  assert.doesNotMatch(migration, /INSERT INTO public\.commercial_terms/);
  assert.doesNotMatch(migration, /UPDATE public\.bookings/);
  assert.doesNotMatch(migration, /INSERT INTO public\.organisation_payouts/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.commercial_subscription_invoice_counters FROM authenticated/);
}

{
  const server = readFileSync("lib/subscription-billing-server.ts", "utf8");
  assert.match(server, /createSubscriptionPeriodForMonth/);
  assert.match(server, /subscription_period_unresolved/);
  assert.match(server, /created: false/);
  assert.doesNotMatch(server, /organisation_payouts/);
  assert.doesNotMatch(server, /platform_fee/);
  assert.doesNotMatch(server, /owner_earnings/);
  assert.match(server, /sendEmail/);
  assert.match(server, /No billing email configured/);

  const api = readFileSync("app/api/admin/subscription-billing/route.ts", "utf8");
  assert.match(api, /requireAdminApi/);
  assert.match(api, /create_month/);
  assert.match(api, /record_payment/);

  const oaApi = readFileSync(
    "app/api/organisations/[organisationId]/subscription-billing/route.ts",
    "utf8"
  );
  assert.match(oaApi, /requireOrgCommercialApi/);
  assert.doesNotMatch(oaApi, /recordSubscriptionPayment/);
  assert.doesNotMatch(oaApi, /voidSubscriptionInvoice/);

  const pdf = readFileSync("lib/subscription-invoice-document.ts", "utf8");
  assert.match(pdf, /Subscription invoice/);
  assert.match(pdf, /Not included in this invoice/);
  assert.doesNotMatch(pdf, /owner_earnings/);
  assert.doesNotMatch(pdf, /PayFast/);

  const adminPage = readFileSync("app/admin/subscriptions/page.tsx", "utf8");
  assert.match(adminPage, /Create billing periods/);
  assert.match(adminPage, /Record payment/);
  assert.match(adminPage, /Issue invoice/);

  const hostPage = readFileSync("app/dashboard/subscription/page.tsx", "utf8");
  assert.match(hostPage, /showOrganisationCommercial/);
  assert.doesNotMatch(hostPage, /record_payment/);
  assert.doesNotMatch(hostPage, /Issue invoice/);

  const financeApi = readFileSync("app/api/admin/finance/route.ts", "utf8");
  assert.match(financeApi, /subscriptionInvoiced/);
  assert.doesNotMatch(financeApi, /commercial_subscription_periods[\s\S]*platform_fee/);

  const nextConfig = readFileSync("next.config.ts", "utf8");
  assert.match(nextConfig, /subscription-invoices\/\*\/pdf/);
}

console.log("subscription-billing tests passed");
