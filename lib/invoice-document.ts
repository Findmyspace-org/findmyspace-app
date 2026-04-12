/**
 * Invoice HTML rendering — shared by /api/invoice/[bookingId] and /pdf.
 * Business amounts come from booking_charges + monthly-contract-finance (no payment logic here).
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { generateInvoiceNumber } from "@/lib/invoice";
import { isChargeLinePendingForReporting } from "@/lib/finance-status";
import {
  getMonthlyContractSnapshot,
  type MonthlyContractSnapshot,
} from "@/lib/monthly-contract-finance";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

let cachedInvoiceLogoDataUrl: string | null | undefined;

/** Base64 data URL for PDF + iframe (relative /logo.png is unreliable in srcDoc / setContent). */
export function resolveInvoiceLogoDataUrl(): string | null {
  if (cachedInvoiceLogoDataUrl !== undefined) {
    return cachedInvoiceLogoDataUrl;
  }
  try {
    const p = join(process.cwd(), "public", "logo.png");
    if (!existsSync(p)) {
      cachedInvoiceLogoDataUrl = null;
      return null;
    }
    const buf = readFileSync(p);
    cachedInvoiceLogoDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    return cachedInvoiceLogoDataUrl;
  } catch {
    cachedInvoiceLogoDataUrl = null;
    return null;
  }
}

export type InvoiceChargeRow = {
  id: string;
  charge_type: string;
  description: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
  invoice_number: string | null;
  payment_reference: string | null;
  paid_at: string | null;
};

export type InvoiceBookingRow = {
  id: string;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  total_price: number | null;
  monthly_rent?: number | null;
  months_total?: number | null;
  months_paid?: number | null;
  deposit_amount?: number | null;
  initial_payment_amount?: number | null;
  next_payment_date?: string | null;
  payment_status: string | null;
  status: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  spaces: {
    title: string | null;
    address_line_1: string | null;
    suburb: string | null;
    city: string | null;
  } | null;
  renter: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  owner: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

export type InvoiceDocument = {
  invoiceNumber: string;
  issueDate: string;
  bookingId: string;
  renter: { name: string; email: string };
  owner: { name: string; email: string };
  space: { title: string; address: string };
  booking: {
    periodStart: string;
    periodEnd: string;
    unitLabel: string;
    status: string;
    paymentStatus: string;
  };
  /** Paid charge lines only (same as line items table). */
  lineItems: { description: string; amount: number }[];
  totalPaid: number;
  paymentRef: string | null;
  paidAtLabel: string | null;
  /** Pending `booking_charges` rows only (deposit, fees, etc.). */
  outstandingPending: number;
  /**
   * Renter-facing “still to pay”: pending charge lines plus future scheduled rent
   * (future months are derived on the booking, not stored as charge rows until due).
   */
  totalOutstandingForRenter: number;
  /** Monthly lease: rent paid to date (months_paid × monthly_rent), capped to contract rent. */
  rentPaidToDateGross: number | null;
  monthly: MonthlyContractSnapshot | null;
};

export function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatZar(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function displayName(
  p: { first_name: string | null; last_name: string | null } | null
): string {
  if (!p) return "";
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
}

function bookingUnitLabel(unit: string | null | undefined): string {
  const u = (unit || "day").toLowerCase();
  if (u === "month") return "Monthly";
  if (u === "hour") return "Hourly";
  return "Daily";
}

function lineLabelForCharge(c: InvoiceChargeRow): string {
  const ct = (c.charge_type || "").toLowerCase();
  if (ct === "first_month_rent") return "First month rent";
  if (ct === "deposit") return "Deposit";
  if (ct === "booking_total") return "Booking total";
  return (
    c.description ||
    c.charge_type.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()) ||
    "Line item"
  );
}

export function buildInvoiceDocument(
  booking: InvoiceBookingRow,
  charges: InvoiceChargeRow[]
): InvoiceDocument {
  const space = booking.spaces;
  const address = [space?.address_line_1, space?.suburb, space?.city]
    .filter(Boolean)
    .join(", ");

  const invoiceNumber =
    charges.find((c) => c.invoice_number)?.invoice_number ||
    generateInvoiceNumber(booking.id);

  const lineItems: { description: string; amount: number }[] =
    charges.length > 0
      ? charges.map((c) => ({
          description: lineLabelForCharge(c),
          amount: Number(c.amount || 0),
        }))
      : [
          {
            description: "Booking total",
            amount: Number(booking.total_price || 0),
          },
        ];

  const totalPaid = lineItems.reduce((s, x) => s + x.amount, 0);

  const displayRef =
    charges.find((c) => c.payment_reference)?.payment_reference ||
    booking.payment_reference;
  const rawPaidAt = charges.find((c) => c.paid_at)?.paid_at || booking.paid_at;
  const paidAtLabel = rawPaidAt
    ? new Date(rawPaidAt).toLocaleString("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const outstandingPending = charges.reduce((sum, c) => {
    if (!isChargeLinePendingForReporting(c.status)) return sum;
    return sum + Number(c.amount || 0);
  }, 0);

  const monthlySnap = getMonthlyContractSnapshot({
    booking_unit: booking.booking_unit,
    monthly_rent: booking.monthly_rent,
    months_total: booking.months_total,
    months_paid: booking.months_paid,
    deposit_amount: booking.deposit_amount,
    initial_payment_amount: booking.initial_payment_amount,
    next_payment_date: booking.next_payment_date,
  });

  let rentPaidToDateGross: number | null = null;
  let totalOutstandingForRenter = outstandingPending;

  if (monthlySnap && monthlySnap.monthsTotal > 0 && monthlySnap.monthlyRent > 0) {
    const rawPaid = round2(monthlySnap.monthsPaid * monthlySnap.monthlyRent);
    rentPaidToDateGross = Math.min(
      rawPaid,
      monthlySnap.totalContractRentGross
    );
    totalOutstandingForRenter = round2(
      outstandingPending + monthlySnap.committedFutureIncomeGross
    );
  }

  return {
    invoiceNumber,
    issueDate: new Date().toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    bookingId: booking.id,
    renter: {
      name: displayName(booking.renter) || "—",
      email: booking.renter?.email || "—",
    },
    owner: {
      name: displayName(booking.owner) || "—",
      email: booking.owner?.email || "—",
    },
    space: {
      title: space?.title || "—",
      address: address || "—",
    },
    booking: {
      periodStart: new Date(booking.start_at).toLocaleDateString("en-ZA"),
      periodEnd: new Date(booking.end_at).toLocaleDateString("en-ZA"),
      unitLabel: bookingUnitLabel(booking.booking_unit),
      status: booking.status || "—",
      paymentStatus: booking.payment_status || "—",
    },
    lineItems,
    totalPaid,
    paymentRef: displayRef || null,
    paidAtLabel,
    outstandingPending,
    totalOutstandingForRenter,
    rentPaidToDateGross,
    monthly: monthlySnap,
  };
}

function paidNowRowsFromLineItems(
  doc: InvoiceDocument
): { label: string; amount: number }[] {
  return doc.lineItems.map((row) => ({
    label: row.description,
    amount: row.amount,
  }));
}

function brandMarkHtml(logoDataUrl: string | null): string {
  if (logoDataUrl) {
    return `
  <div class="brand-mark">
    <img class="brand-logo" src="${logoDataUrl}" alt="FindMySpace" />
  </div>`;
  }
  return `
  <div class="brand-mark" aria-hidden="true">
    <span class="brand-accent"></span>
    <span class="brand-text">FindMySpace</span>
  </div>`;
}

export function renderInvoiceHtml(doc: InvoiceDocument): string {
  const logoDataUrl = resolveInvoiceLogoDataUrl();
  const paidNowRows = paidNowRowsFromLineItems(doc);
  const m = doc.monthly;

  const lineRows = doc.lineItems
    .map(
      (row) => `
    <tr>
      <td class="td-desc">${escapeHtml(row.description)}</td>
      <td class="td-amt">${escapeHtml(formatZar(row.amount))}</td>
    </tr>`
    )
    .join("");

  const paymentSummaryHtml = m
    ? `
    <section class="card">
      <h2 class="card-title">Payment summary</h2>

      <div class="subsection">
        <h3 class="sub-title">Paid now</h3>
        <table class="mini-table">
          <tbody>
            ${paidNowRows
              .map(
                (r) => `
            <tr>
              <td>${escapeHtml(r.label)}</td>
              <td class="num">${escapeHtml(formatZar(r.amount))}</td>
            </tr>`
              )
              .join("")}
            <tr class="total-row">
              <td><strong>Total paid</strong></td>
              <td class="num"><strong>${escapeHtml(formatZar(doc.totalPaid))}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="subsection divider-top">
        <h3 class="sub-title">Financial breakdown <span class="tag">monthly lease</span></h3>
        <dl class="kv">
          <div class="kv-row"><dt>Monthly rent</dt><dd>${escapeHtml(formatZar(m.monthlyRent))}</dd></div>
          <div class="kv-row"><dt>Lease length</dt><dd>${escapeHtml(String(m.monthsTotal))} month(s)</dd></div>
          <div class="kv-row"><dt>Months paid</dt><dd>${escapeHtml(String(m.monthsPaid))}</dd></div>
          <div class="kv-row"><dt>Remaining months</dt><dd>${escapeHtml(String(m.futureRentMonths))}</dd></div>
          <div class="kv-row highlight">
            <dt>Next payment due</dt>
            <dd>${escapeHtml(formatZar(m.nextRentAmount))}${
              m.nextPaymentDate
                ? ` <span class="muted">· ${escapeHtml(
                    new Date(m.nextPaymentDate).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  )}</span>`
                : ""
            }</dd>
          </div>
        </dl>
      </div>

      <div class="subsection divider-top">
        <h3 class="sub-title">Contract summary</h3>
        <dl class="kv">
          <div class="kv-row"><dt>Total contract value</dt><dd>${escapeHtml(formatZar(m.totalContractRentGross))}</dd></div>
          <div class="kv-row">
            <dt>Amount paid to date (rent)</dt>
            <dd>${escapeHtml(
              formatZar(doc.rentPaidToDateGross ?? 0)
            )}</dd>
          </div>
          <div class="kv-row emphasize">
            <dt>Remaining payments due</dt>
            <dd>${escapeHtml(formatZar(m.committedFutureIncomeGross))}</dd>
          </div>
        </dl>
        <p class="fine-print">
          Scheduled rent after payments made to date. Each period becomes payable when charged on your booking.
        </p>
      </div>

      <div class="subsection divider-top muted-box">
        <dl class="kv">
          <div class="kv-row">
            <dt>Outstanding charges (pending)</dt>
            <dd>${escapeHtml(formatZar(doc.totalOutstandingForRenter))}</dd>
          </div>
        </dl>
        <p class="fine-print" style="margin-top:8px;">
          Includes any unpaid charge lines on this booking plus remaining scheduled rent (future months are tracked on the lease until invoiced).
        </p>
      </div>
    </section>`
    : `
    <section class="card">
      <h2 class="card-title">Payment summary</h2>
      <div class="subsection">
        <h3 class="sub-title">Paid now</h3>
        <table class="mini-table">
          <tbody>
            ${paidNowRows
              .map(
                (r) => `
            <tr>
              <td>${escapeHtml(r.label)}</td>
              <td class="num">${escapeHtml(formatZar(r.amount))}</td>
            </tr>`
              )
              .join("")}
            <tr class="total-row">
              <td><strong>Total paid</strong></td>
              <td class="num"><strong>${escapeHtml(formatZar(doc.totalPaid))}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="subsection divider-top muted-box">
        <dl class="kv">
          <div class="kv-row">
            <dt>Outstanding charges (pending)</dt>
            <dd>${escapeHtml(formatZar(doc.totalOutstandingForRenter))}</dd>
          </div>
        </dl>
      </div>
    </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${escapeHtml(doc.invoiceNumber)} — FindMySpace</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: #0a0a0a;
      background: #ffffff;
    }
    .page {
      max-width: 720px;
      margin: 0 auto;
      padding: 8px 0 32px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
      margin-bottom: 24px;
    }
    .brand-block { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
    .brand-mark {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-accent {
      display: inline-block;
      width: 10px;
      height: 28px;
      background: #dc2626;
      border-radius: 2px;
    }
    .brand-logo {
      display: block;
      height: 40px;
      width: auto;
      max-width: 200px;
      object-fit: contain;
      object-position: left center;
    }
    .brand-text {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #0a0a0a;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-meta h1 {
      margin: 0 0 6px;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0a0a0a;
    }
    .meta-line { margin: 2px 0; font-size: 13px; color: #374151; }
    .meta-line strong { color: #0a0a0a; font-weight: 600; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    @media (max-width: 560px) {
      .grid-2 { grid-template-columns: 1fr; }
      .invoice-meta { text-align: left; }
      .header { flex-direction: column; }
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 18px 20px;
      margin-bottom: 16px;
      background: #fafafa;
    }
    .card-title {
      margin: 0 0 14px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #6b7280;
    }
    .party-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #dc2626;
      margin-bottom: 8px;
    }
    .party-name { font-size: 15px; font-weight: 600; color: #0a0a0a; margin-bottom: 4px; }
    .party-email { font-size: 13px; color: #4b5563; word-break: break-all; }
    .subsection { margin-top: 0; }
    .subsection.divider-top {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid #e5e7eb;
    }
    .sub-title {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 600;
      color: #111827;
    }
    .tag {
      display: inline-block;
      margin-left: 6px;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6b7280;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 999px;
      vertical-align: middle;
    }
    dl.kv { margin: 0; }
    .kv-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 6px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .kv-row:last-child { border-bottom: none; }
    .kv-row dt {
      margin: 0;
      font-size: 13px;
      color: #4b5563;
      font-weight: 500;
    }
    .kv-row dd {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: #0a0a0a;
      text-align: right;
    }
    .kv-row.highlight dt { color: #0a0a0a; }
    .kv-row.emphasize dd { color: #b91c1c; }
    .muted { font-weight: 400; color: #6b7280; font-size: 12px; }
    .fine-print {
      margin: 12px 0 0;
      font-size: 11px;
      line-height: 1.5;
      color: #6b7280;
    }
    .muted-box { background: #fff; border-radius: 8px; padding: 10px 12px; border: 1px dashed #e5e7eb; }
    .booking-kv .kv-row dt { min-width: 120px; }
    table.lines {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    table.lines thead th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #6b7280;
      padding: 12px 14px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }
    table.lines thead th:last-child { text-align: right; }
    .td-desc { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; }
    .td-amt {
      padding: 12px 14px;
      border-bottom: 1px solid #f3f4f6;
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      white-space: nowrap;
    }
    table.lines tbody tr:last-child .td-desc,
    table.lines tbody tr:last-child .td-amt { border-bottom: none; }
    .lines-caption {
      margin: 0 0 8px;
      font-size: 12px;
      color: #4b5563;
    }
    table.mini-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    table.mini-table td {
      padding: 10px 12px;
      font-size: 13px;
      border-bottom: 1px solid #f3f4f6;
    }
    table.mini-table tr:last-child td { border-bottom: none; }
    table.mini-table td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    table.mini-table tr.total-row td {
      background: #f9fafb;
      font-size: 14px;
      border-top: 2px solid #e5e7eb;
    }
    .footer {
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #4b5563;
    }
    .footer strong { color: #0a0a0a; }
    .disclaimer {
      margin-top: 12px;
      font-size: 11px;
      color: #6b7280;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="brand-block">
        ${brandMarkHtml(logoDataUrl)}
      </div>
      <div class="invoice-meta">
        <h1>Invoice</h1>
        <div class="meta-line"><strong>${escapeHtml(doc.invoiceNumber)}</strong></div>
        <div class="meta-line">Issued ${escapeHtml(doc.issueDate)}</div>
        <div class="meta-line muted">Booking ${escapeHtml(doc.bookingId)}</div>
      </div>
    </header>

    <div class="grid-2">
      <section class="card" style="margin-bottom:0;">
        <p class="party-label">Bill to — Renter</p>
        <p class="party-name">${escapeHtml(doc.renter.name)}</p>
        <p class="party-email">${escapeHtml(doc.renter.email)}</p>
      </section>
      <section class="card" style="margin-bottom:0;">
        <p class="party-label">From — Space owner</p>
        <p class="party-name">${escapeHtml(doc.owner.name)}</p>
        <p class="party-email">${escapeHtml(doc.owner.email)}</p>
      </section>
    </div>

    <section class="card booking-kv">
      <h2 class="card-title">Booking details</h2>
      <dl class="kv">
        <div class="kv-row"><dt>Space</dt><dd>${escapeHtml(doc.space.title)}</dd></div>
        <div class="kv-row"><dt>Address</dt><dd>${escapeHtml(doc.space.address)}</dd></div>
        <div class="kv-row"><dt>Period</dt><dd>${escapeHtml(doc.booking.periodStart)} – ${escapeHtml(doc.booking.periodEnd)}</dd></div>
        <div class="kv-row"><dt>Booking type</dt><dd>${escapeHtml(doc.booking.unitLabel)}</dd></div>
        <div class="kv-row"><dt>Status</dt><dd>${escapeHtml(doc.booking.status)}</dd></div>
        <div class="kv-row"><dt>Payment status</dt><dd>${escapeHtml(doc.booking.paymentStatus)}</dd></div>
      </dl>
    </section>

    ${paymentSummaryHtml}

    <section class="card" style="background:#fff;">
      <h2 class="card-title">Line items</h2>
      <p class="lines-caption">Charges settled in this payment (actual paid items only).</p>
      <table class="lines">
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align:right;width:140px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
      </table>
    </section>

    <footer class="footer">
      ${doc.paymentRef ? `<p><strong>Payment reference</strong> ${escapeHtml(doc.paymentRef)}</p>` : ""}
      ${doc.paidAtLabel ? `<p><strong>Paid</strong> ${escapeHtml(doc.paidAtLabel)}</p>` : ""}
      <p class="disclaimer">
        This invoice summarises amounts you have paid and what remains on your booking, including scheduled rent still to come. Amounts not yet charged for a period are not due until that period is invoiced.
      </p>
      <p style="margin-top:16px;font-size:11px;color:#9ca3af;">FindMySpace · Rent spaces easily and securely</p>
    </footer>
  </div>
</body>
</html>`;
}
