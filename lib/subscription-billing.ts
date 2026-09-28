/**
 * Monthly subscription billing owed TO FindMySpace.
 * Separate from renter booking money, PayFast charges, and organisation payouts.
 */

import { roundMoney } from "@/lib/commercial-calculator";
import type { BillableInventoryScope } from "@/lib/commercial-inventory";
import type { ProgressiveBreakdownLine } from "@/lib/commercial-progressive-pricing";
import {
  billingMonthStart,
  isProgressivePricingMode,
  type SubscriptionPricingMode,
  type SubscriptionResolution,
} from "@/lib/commercial-subscription";
import type { CommercialModel } from "@/lib/commercial-terms";

export const SUBSCRIPTION_INVOICE_PREFIX = "FMS-SUB";
export const DEFAULT_SUBSCRIPTION_DUE_DAYS = 14;
export const SUBSCRIPTION_BILLING_TIMEZONE = "Africa/Johannesburg";

export type SubscriptionBillingStatus = "draft" | "open" | "invoiced" | "void";
export type SubscriptionPaymentStatus = "unpaid" | "paid";

export type SubscriptionSkipReason =
  | "excluded_model"
  | "zero_inventory"
  | "zero_amount"
  | "unresolved"
  | "no_billed_scope";

export class SubscriptionBillingError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "SubscriptionBillingError";
    this.code = code;
    this.status = status;
  }
}

export type SubscriptionCalculationSnapshot = {
  billingMonth: string;
  billedScopeType: BillableInventoryScope;
  billedScopeId: string;
  billedOrganisationId: string | null;
  billedOrganisationName: string | null;
  billedPartyName: string;
  commercialTermsId: string | null;
  commercialTermsEffectiveFrom: string | null;
  commercialModel: "subscription";
  pricingMode: SubscriptionPricingMode | null;
  inventoryCount: number;
  inventoryBasis: "fixed" | "property" | "space" | null;
  includedUnits: number | null;
  baseAmount: number | null;
  matchedTierId: string | null;
  matchedTierLabel: string | null;
  monthlyAmount: number;
  calculationText: string | null;
  breakdown: ProgressiveBreakdownLine[] | null;
  arrangementSummary: string;
  transactionFeesIncluded: false;
};

export type SubscriptionPeriodRow = {
  id: string;
  billing_month: string;
  scope_type: BillableInventoryScope;
  scope_id: string;
  billed_organisation_id: string | null;
  billed_party_name: string | null;
  commercial_terms_id: string | null;
  pricing_mode: SubscriptionPricingMode | null;
  inventory_count: number;
  matched_tier_id: string | null;
  matched_tier_label: string | null;
  monthly_amount: number;
  status: SubscriptionBillingStatus;
  payment_status: SubscriptionPaymentStatus;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  amount_paid: number | null;
  payment_reference: string | null;
  payment_note: string | null;
  payment_recorded_by: string | null;
  calculation_snapshot: SubscriptionCalculationSnapshot | null;
  billing_email: string | null;
  email_sent_at: string | null;
  issued_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
};

export type SubscriptionPeriodPreview = {
  billingMonth: string;
  billedScopeType: BillableInventoryScope;
  billedScopeId: string;
  billedOrganisationId: string | null;
  billedOrganisationName: string | null;
  billedPartyName: string;
  commercialModel: CommercialModel;
  pricingMode: SubscriptionPricingMode | null;
  inventoryCount: number;
  monthlyAmount: number;
  eligible: boolean;
  skipReason: SubscriptionSkipReason | null;
  unresolvedReason: string | null;
  warning: string | null;
  snapshot: SubscriptionCalculationSnapshot | null;
};

export function parseBillingMonthInput(value: string): string {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) {
    return `${raw}-01`;
  }
  if (/^\d{4}-\d{2}-01$/.test(raw)) {
    return raw;
  }
  return billingMonthStart(
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+02:00` : raw
  );
}

export function billingMonthEffectiveAt(billingMonth: string): Date {
  const month = parseBillingMonthInput(billingMonth);
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    throw new SubscriptionBillingError(
      "Billing month must be the first calendar day of a month.",
      "invalid_billing_month"
    );
  }
  return new Date(`${month}T00:00:00+02:00`);
}

export function formatBillingMonthLabel(billingMonth: string): string {
  const month = parseBillingMonthInput(billingMonth);
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: SUBSCRIPTION_BILLING_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}T00:00:00+02:00`));
}

export function addSubscriptionCalendarDays(yyyyMmDd: string, days: number): string {
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function defaultSubscriptionDueDate(invoiceDate: string): string {
  return addSubscriptionCalendarDays(invoiceDate, DEFAULT_SUBSCRIPTION_DUE_DAYS);
}

export function formatSubscriptionInvoiceNumber(year: number, seq: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid subscription invoice year.");
  }
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error("Invalid subscription invoice sequence.");
  }
  return `${SUBSCRIPTION_INVOICE_PREFIX}-${year}-${String(seq).padStart(4, "0")}`;
}

export function isSubscriptionInvoiceNumber(value: string | null | undefined): boolean {
  return Boolean(value && /^FMS-SUB-[0-9]{4}-[0-9]{4,}$/.test(value));
}

export function subscriptionInvoiceYear(invoiceDate: string): number {
  const year = Number(invoiceDate.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new SubscriptionBillingError("Invalid invoice date.", "invalid_invoice_date");
  }
  return year;
}

export function skipReasonMessage(reason: SubscriptionSkipReason): string {
  switch (reason) {
    case "excluded_model":
      return "Commission and free arrangements are not billed as subscriptions.";
    case "zero_inventory":
      return "No billable inventory for this month.";
    case "zero_amount":
      return "Resolved monthly amount is R0, so no payable invoice is created.";
    case "unresolved":
      return "Pricing is unresolved, so no payable period is created.";
    case "no_billed_scope":
      return "No organisation, property, or space to bill.";
    default:
      return "Not eligible for subscription billing.";
  }
}

export function evaluateSubscriptionEligibility(input: {
  model: CommercialModel;
  billedScope: { scopeType: BillableInventoryScope; scopeId: string } | null;
  resolution: SubscriptionResolution | null;
}): { eligible: true } | { eligible: false; reason: SubscriptionSkipReason } {
  if (input.model !== "subscription") {
    return { eligible: false, reason: "excluded_model" };
  }
  if (!input.billedScope) {
    return { eligible: false, reason: "no_billed_scope" };
  }
  const resolution = input.resolution;
  if (!resolution) {
    return { eligible: false, reason: "unresolved" };
  }
  if (resolution.unresolvedReason) {
    return { eligible: false, reason: "unresolved" };
  }
  const mode = resolution.pricingMode;
  if (mode && mode !== "fixed") {
    const count = resolution.inventoryCount;
    if (count == null || count <= 0) {
      return { eligible: false, reason: "zero_inventory" };
    }
  }
  if (roundMoney(resolution.monthlyAmount) <= 0) {
    return { eligible: false, reason: "zero_amount" };
  }
  return { eligible: true };
}

export function buildSubscriptionCalculationSnapshot(input: {
  billingMonth: string;
  billedScope: { scopeType: BillableInventoryScope; scopeId: string };
  billedOrganisationId: string | null;
  billedOrganisationName: string | null;
  billedPartyName: string;
  termsId: string | null;
  termsEffectiveFrom: string | null;
  includedUnits: number | null;
  baseAmount: number | null;
  arrangementSummary: string;
  resolution: SubscriptionResolution;
}): SubscriptionCalculationSnapshot {
  return {
    billingMonth: parseBillingMonthInput(input.billingMonth),
    billedScopeType: input.billedScope.scopeType,
    billedScopeId: input.billedScope.scopeId,
    billedOrganisationId: input.billedOrganisationId,
    billedOrganisationName: input.billedOrganisationName,
    billedPartyName: input.billedPartyName,
    commercialTermsId: input.termsId,
    commercialTermsEffectiveFrom: input.termsEffectiveFrom,
    commercialModel: "subscription",
    pricingMode: input.resolution.pricingMode,
    inventoryCount: input.resolution.inventoryCount ?? 0,
    inventoryBasis: input.resolution.inventoryBasis,
    includedUnits: input.includedUnits,
    baseAmount: input.baseAmount,
    matchedTierId: input.resolution.matchedTier?.id ?? null,
    matchedTierLabel: input.resolution.matchedTier?.label ?? null,
    monthlyAmount: roundMoney(input.resolution.monthlyAmount),
    calculationText: snapshotCalculationText(input.resolution),
    breakdown: input.resolution.breakdown ?? null,
    arrangementSummary: input.arrangementSummary,
    transactionFeesIncluded: false,
  };
}

function snapshotCalculationText(resolution: SubscriptionResolution): string | null {
  if (resolution.unresolvedReason) return null;
  if (isProgressivePricingMode(resolution.pricingMode)) {
    const lines = (resolution.breakdown || []).map((line) => line.label);
    return lines.length > 0 ? lines.join(" + ") : `R${roundMoney(resolution.monthlyAmount)}`;
  }
  if (resolution.matchedTier) {
    return `${resolution.matchedTier.label || "Matched tier"}: R${roundMoney(resolution.monthlyAmount)}`;
  }
  return `Fixed R${roundMoney(resolution.monthlyAmount)}`;
}

export function subscriptionPeriodIsFrozen(period: Pick<SubscriptionPeriodRow, "id" | "monthly_amount">): boolean {
  return Boolean(period.id);
}

export function canIssueSubscriptionInvoice(period: Pick<SubscriptionPeriodRow, "status" | "payment_status" | "monthly_amount">): {
  ok: true;
} | { ok: false; error: string } {
  if (period.status === "void") {
    return { ok: false, error: "A voided period cannot be invoiced." };
  }
  if (period.status === "invoiced") {
    return { ok: false, error: "This period already has an invoice." };
  }
  if (period.payment_status === "paid") {
    return { ok: false, error: "A paid period cannot be invoiced again." };
  }
  if (roundMoney(period.monthly_amount) <= 0) {
    return { ok: false, error: "R0 periods are not invoiced." };
  }
  return { ok: true };
}

export function canRecordSubscriptionPayment(period: Pick<SubscriptionPeriodRow, "status" | "payment_status">): {
  ok: true;
} | { ok: false; error: string } {
  if (period.status === "void") {
    return { ok: false, error: "A voided invoice cannot be marked paid." };
  }
  if (period.status !== "invoiced") {
    return { ok: false, error: "Issue the invoice before recording payment." };
  }
  if (period.payment_status === "paid") {
    return { ok: false, error: "Payment is already recorded." };
  }
  return { ok: true };
}

export function canVoidSubscriptionInvoice(period: Pick<SubscriptionPeriodRow, "status" | "payment_status">): {
  ok: true;
} | { ok: false; error: string } {
  if (period.status === "void") {
    return { ok: false, error: "This invoice is already void." };
  }
  if (period.payment_status === "paid") {
    return { ok: false, error: "A paid invoice cannot be voided." };
  }
  return { ok: true };
}

export function summariseSubscriptionRevenue(
  periods: Array<Pick<SubscriptionPeriodRow, "status" | "payment_status" | "monthly_amount">>
): {
  invoiced: number;
  paid: number;
  outstanding: number;
} {
  let invoiced = 0;
  let paid = 0;
  for (const period of periods) {
    if (period.status !== "invoiced") continue;
    const amount = roundMoney(period.monthly_amount);
    invoiced += amount;
    if (period.payment_status === "paid") paid += amount;
  }
  return {
    invoiced: roundMoney(invoiced),
    paid: roundMoney(paid),
    outstanding: roundMoney(invoiced - paid),
  };
}

export function formatSubscriptionArrangement(): string {
  return "Subscription";
}

export function subscriptionPaymentInstructions(input: {
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  branchCode?: string | null;
}): { configured: boolean; lines: string[] } {
  const bankName = input.bankName?.trim() || "";
  const accountHolder = input.accountHolder?.trim() || "";
  const accountNumber = input.accountNumber?.trim() || "";
  const branchCode = input.branchCode?.trim() || "";
  if (!bankName && !accountHolder && !accountNumber) {
    return {
      configured: false,
      lines: [
        "Pay by EFT to FindMySpace.",
        "Banking details are not configured in this environment. Contact FindMySpace for payment instructions.",
      ],
    };
  }
  const lines = ["Pay by EFT to FindMySpace."];
  if (accountHolder) lines.push(`Account holder: ${accountHolder}`);
  if (bankName) lines.push(`Bank: ${bankName}`);
  if (accountNumber) lines.push(`Account number: ${accountNumber}`);
  if (branchCode) lines.push(`Branch code: ${branchCode}`);
  lines.push("Use the invoice number as the payment reference.");
  return { configured: true, lines };
}
