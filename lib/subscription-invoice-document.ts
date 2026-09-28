import { escapeHtml, formatZar, resolveInvoiceLogoDataUrl } from "@/lib/invoice-document";
import { subscriptionPricingMethodLabel } from "@/lib/commercial-admin-display";
import {
  formatBillingMonthLabel,
  subscriptionPaymentInstructions,
  type SubscriptionPeriodRow,
} from "@/lib/subscription-billing";

function brandMarkHtml(logoDataUrl: string | null): string {
  if (logoDataUrl) {
    return `<div class="brand-mark"><img class="brand-logo" src="${logoDataUrl}" alt="FindMySpace" /></div>`;
  }
  return `<div class="brand-mark"><span class="brand-text">FindMySpace</span></div>`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+02:00` : value));
}

export function renderSubscriptionInvoiceHtml(period: SubscriptionPeriodRow): string {
  const snapshot = period.calculation_snapshot;
  const logo = resolveInvoiceLogoDataUrl();
  const instructions = subscriptionPaymentInstructions({
    bankName: process.env.FINDYMYSPACE_SUBSCRIPTION_BANK_NAME,
    accountHolder: process.env.FINDYMYSPACE_SUBSCRIPTION_ACCOUNT_HOLDER,
    accountNumber: process.env.FINDYMYSPACE_SUBSCRIPTION_ACCOUNT_NUMBER,
    branchCode: process.env.FINDYMYSPACE_SUBSCRIPTION_BRANCH_CODE,
  });
  const breakdown = (snapshot?.breakdown || [])
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.label)}</td><td class="num">${escapeHtml(formatZar(line.subtotal))}</td></tr>`
    )
    .join("");
  const billedTo = [
    snapshot?.billedPartyName || period.billed_party_name || "—",
    snapshot?.billedOrganisationName &&
    snapshot.billedOrganisationName !== snapshot.billedPartyName
      ? snapshot.billedOrganisationName
      : null,
  ]
    .filter(Boolean)
    .join("<br />");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>FindMySpace subscription invoice ${escapeHtml(period.invoice_number || "")}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #192a3a; margin: 0; }
    .page { padding: 8mm 4mm; }
    .brand-logo { height: 36px; }
    h1 { font-size: 22px; margin: 16px 0 4px; }
    .muted { color: #6b7280; font-size: 12px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td, th { padding: 6px 0; }
    .num { text-align: right; }
    .total { font-size: 16px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="page">
    ${brandMarkHtml(logo)}
    <h1>Subscription invoice</h1>
    <p class="muted">FindMySpace · monthly organisation subscription. This is not a renter booking invoice.</p>
    <div class="card">
      <table>
        <tr><td>Invoice number</td><td class="num">${escapeHtml(period.invoice_number || "Draft")}</td></tr>
        <tr><td>Invoice date</td><td class="num">${escapeHtml(formatDate(period.invoice_date))}</td></tr>
        <tr><td>Due date</td><td class="num">${escapeHtml(formatDate(period.due_date))}</td></tr>
        <tr><td>Status</td><td class="num">${escapeHtml(period.payment_status === "paid" ? "Paid" : "Unpaid")}</td></tr>
      </table>
    </div>
    <div class="card">
      <strong>Billed to</strong>
      <p>${billedTo}</p>
    </div>
    <div class="card">
      <table>
        <tr><td>Billing month</td><td class="num">${escapeHtml(formatBillingMonthLabel(period.billing_month))}</td></tr>
        <tr><td>Commercial arrangement</td><td class="num">Subscription</td></tr>
        <tr><td>Pricing basis</td><td class="num">${escapeHtml(subscriptionPricingMethodLabel(period.pricing_mode))}</td></tr>
        <tr><td>Snapshot</td><td class="num">${escapeHtml(String(period.inventory_count))} billable ${
          snapshot?.inventoryBasis === "space" ? "spaces" : "properties"
        }</td></tr>
      </table>
    </div>
    <div class="card">
      <strong>Calculation</strong>
      <table>
        ${breakdown || `<tr><td>${escapeHtml(snapshot?.calculationText || "Monthly subscription")}</td><td class="num">${escapeHtml(formatZar(period.monthly_amount))}</td></tr>`}
        <tr class="total"><td>Monthly subscription</td><td class="num">${escapeHtml(formatZar(period.monthly_amount))}</td></tr>
        <tr><td>Transaction fees</td><td class="num">Not included in this invoice</td></tr>
        <tr class="total"><td>Amount due</td><td class="num">${escapeHtml(formatZar(period.monthly_amount))}</td></tr>
      </table>
    </div>
    <div class="card">
      <strong>Payment instructions</strong>
      ${instructions.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </div>
  </div>
</body>
</html>`;
}
