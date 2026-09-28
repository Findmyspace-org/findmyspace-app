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

export const TEST_INVOICE_BANNER = "TEST INVOICE — NOT FOR PAYMENT";
export const TEST_INVOICE_EXPLANATION =
  "This invoice was generated for billing workflow testing. No payment is required.";
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
  is_test_invoice: boolean;
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
  coverageWarning?: string | null;
  billingEmail: string | null;
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

export function johannesburgCalendarDate(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SUBSCRIPTION_BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
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

export function resolveSubscriptionDueDate(
  invoiceDate: string,
  dueDateOverride?: string | null
): string {
  const trimmed = dueDateOverride?.trim() || "";
  if (trimmed) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new SubscriptionBillingError(
        "Due date must be a calendar date.",
        "invalid_due_date"
      );
    }
    return trimmed;
  }
  return defaultSubscriptionDueDate(invoiceDate);
}

export function subscriptionIssueIsTestInvoice(input: {
  eftConfigured: boolean;
  allowIncompletePaymentInstructions?: boolean;
}): boolean {
  return !input.eftConfigured && Boolean(input.allowIncompletePaymentInstructions);
}

export function shouldSendSubscriptionInvoiceEmail(input: {
  isTestInvoice: boolean;
  sendEmail?: boolean;
  sendTestInvoiceEmail?: boolean;
}): boolean {
  if (input.isTestInvoice) return input.sendTestInvoiceEmail === true;
  return input.sendEmail !== false;
}

export function organisationCanSeeSubscriptionInvoice(
  period: Pick<SubscriptionPeriodRow, "status" | "is_test_invoice">
): boolean {
  return !period.is_test_invoice && period.status !== "draft";
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

export function canRecordSubscriptionPayment(
  period: Pick<SubscriptionPeriodRow, "status" | "payment_status"> & {
    is_test_invoice?: boolean;
  }
): {
  ok: true;
} | { ok: false; error: string } {
  if (period.is_test_invoice) {
    return { ok: false, error: "Test invoices cannot be marked paid through the normal payment flow." };
  }
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
  periods: Array<
    Pick<SubscriptionPeriodRow, "status" | "payment_status" | "monthly_amount"> & {
      is_test_invoice?: boolean;
    }
  >
): {
  invoiced: number;
  paid: number;
  outstanding: number;
  testInvoiceCount: number;
} {
  let invoiced = 0;
  let paid = 0;
  let testInvoiceCount = 0;
  for (const period of periods) {
    if (period.is_test_invoice) {
      testInvoiceCount += 1;
      continue;
    }
    if (period.status !== "invoiced") continue;
    const amount = roundMoney(period.monthly_amount);
    invoiced += amount;
    if (period.payment_status === "paid") paid += amount;
  }
  return {
    invoiced: roundMoney(invoiced),
    paid: roundMoney(paid),
    outstanding: roundMoney(invoiced - paid),
    testInvoiceCount,
  };
}

export function formatSubscriptionArrangement(): string {
  return "Subscription";
}

export const FMS_BILLING_ENV_KEYS = {
  bankName: ["FMS_BILLING_BANK_NAME", "FINDYMYSPACE_SUBSCRIPTION_BANK_NAME"],
  accountName: [
    "FMS_BILLING_ACCOUNT_NAME",
    "FINDYMYSPACE_SUBSCRIPTION_ACCOUNT_HOLDER",
  ],
  accountNumber: [
    "FMS_BILLING_ACCOUNT_NUMBER",
    "FINDYMYSPACE_SUBSCRIPTION_ACCOUNT_NUMBER",
  ],
  branchCode: ["FMS_BILLING_BRANCH_CODE", "FINDYMYSPACE_SUBSCRIPTION_BRANCH_CODE"],
  accountType: ["FMS_BILLING_ACCOUNT_TYPE"],
} as const;

export type FindmyspaceBillingBankDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
};

export type FindmyspaceBillingBankStatus = {
  configured: boolean;
  missing: string[];
};

function firstEnvValue(keys: readonly string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim() || "";
    if (value) return value;
  }
  return "";
}

export function readFindmyspaceBillingBankDetails(): FindmyspaceBillingBankDetails {
  return {
    bankName: firstEnvValue(FMS_BILLING_ENV_KEYS.bankName),
    accountName: firstEnvValue(FMS_BILLING_ENV_KEYS.accountName),
    accountNumber: firstEnvValue(FMS_BILLING_ENV_KEYS.accountNumber),
    branchCode: firstEnvValue(FMS_BILLING_ENV_KEYS.branchCode),
    accountType: firstEnvValue(FMS_BILLING_ENV_KEYS.accountType),
  };
}

export function findmyspaceBillingBankStatus(
  details: FindmyspaceBillingBankDetails = readFindmyspaceBillingBankDetails()
): FindmyspaceBillingBankStatus {
  const missing: string[] = [];
  if (!details.bankName) missing.push("bank name");
  if (!details.accountName) missing.push("account name");
  if (!details.accountNumber) missing.push("account number");
  if (!details.branchCode) missing.push("branch code");
  return { configured: missing.length === 0, missing };
}

export type SubscriptionInvoiceReadinessItem = {
  key:
    | "terms"
    | "amount"
    | "party"
    | "email"
    | "eft"
    | "positive_amount";
  ok: boolean;
  requiredForIssue: boolean;
  label: string;
  detail: string;
};

export function subscriptionInvoiceReadiness(input: {
  termsResolved: boolean;
  amountResolved: boolean;
  billedPartyResolved: boolean;
  monthlyAmount: number;
  hasBillingEmail: boolean;
  eftConfigured: boolean;
}): {
  items: SubscriptionInvoiceReadinessItem[];
  canIssue: boolean;
  canIssueWithoutEft: boolean;
  canEmail: boolean;
} {
  const items: SubscriptionInvoiceReadinessItem[] = [
    {
      key: "terms",
      ok: input.termsResolved,
      requiredForIssue: true,
      label: "Commercial terms resolved",
      detail: input.termsResolved
        ? "Effective subscription terms are available for this month."
        : "Fix the commercial schedule before issuing.",
    },
    {
      key: "amount",
      ok: input.amountResolved,
      requiredForIssue: true,
      label: "Subscription amount resolved",
      detail: input.amountResolved
        ? "Monthly amount is calculated."
        : "Pricing is unresolved or excluded.",
    },
    {
      key: "party",
      ok: input.billedPartyResolved,
      requiredForIssue: true,
      label: "Billing party resolved",
      detail: input.billedPartyResolved
        ? "The organisation to bill is known."
        : "No billed organisation is resolved.",
    },
    {
      key: "positive_amount",
      ok: roundMoney(input.monthlyAmount) > 0,
      requiredForIssue: true,
      label: "Invoice amount > 0",
      detail:
        roundMoney(input.monthlyAmount) > 0
          ? `Amount due is R ${roundMoney(input.monthlyAmount).toFixed(2)}.`
          : "R0 invoices are not issued.",
    },
    {
      key: "eft",
      ok: input.eftConfigured,
      requiredForIssue: true,
      label: "EFT/payment instructions configured",
      detail: input.eftConfigured
        ? "FindMySpace billing bank details are configured."
        : "Set FMS_BILLING_BANK_NAME, FMS_BILLING_ACCOUNT_NAME, FMS_BILLING_ACCOUNT_NUMBER, and FMS_BILLING_BRANCH_CODE.",
    },
    {
      key: "email",
      ok: input.hasBillingEmail,
      requiredForIssue: false,
      label: "Billing email configured",
      detail: input.hasBillingEmail
        ? "Invoice email can be sent."
        : "Invoice can be issued. Email cannot be sent until a billing email is saved.",
    },
  ];
  const required = items.filter((item) => item.requiredForIssue);
  const canIssue = required.every((item) => item.ok);
  const canIssueWithoutEft = required
    .filter((item) => item.key !== "eft")
    .every((item) => item.ok);
  return {
    items,
    canIssue,
    canIssueWithoutEft,
    canEmail: canIssueWithoutEft && input.hasBillingEmail,
  };
}

export function subscriptionTestInvoicePaymentLines(): string[] {
  return [
    "Banking details are not configured. Do not make payment against this test invoice.",
  ];
}

export function subscriptionPaymentInstructions(
  details: FindmyspaceBillingBankDetails = readFindmyspaceBillingBankDetails()
): { configured: boolean; lines: string[] } {
  const status = findmyspaceBillingBankStatus(details);
  if (!status.configured) {
    return {
      configured: false,
      lines: [
        "Pay by EFT to FindMySpace.",
        "Banking details are not configured in this environment. Contact FindMySpace for payment instructions.",
      ],
    };
  }
  const lines = [
    "Pay by EFT to FindMySpace.",
    `Account holder: ${details.accountName}`,
    `Bank: ${details.bankName}`,
    `Account number: ${details.accountNumber}`,
    `Branch code: ${details.branchCode}`,
  ];
  if (details.accountType) lines.push(`Account type: ${details.accountType}`);
  lines.push("Use the invoice number as the payment reference.");
  return { configured: true, lines };
}
