import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateInvoiceNumber } from "@/lib/invoice";
import { isInvoiceEligibleBooking } from "@/lib/finance-status";

function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ChargeRow = {
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return new NextResponse("Server configuration error", { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      renter_id,
      owner_id,
      booking_unit,
      start_at,
      end_at,
      total_price,
      payment_status,
      status,
      paid_at,
      payment_reference,
      spaces (
        title,
        address_line_1,
        suburb,
        city
      ),
      renter:profiles!bookings_renter_id_fkey (
        first_name,
        last_name,
        email
      ),
      owner:profiles!bookings_owner_id_fkey (
        first_name,
        last_name,
        email
      )
    `
    )
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    return new NextResponse("Booking not found", { status: 404 });
  }

  const row = booking as typeof booking & {
    renter_id: string;
    owner_id: string;
    payment_reference?: string | null;
    paid_at?: string | null;
  };

  if (row.renter_id !== user.id && row.owner_id !== user.id) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const paidForInvoice = isInvoiceEligibleBooking(
    row.status,
    row.payment_status
  );

  if (!paidForInvoice) {
    return new NextResponse("Invoice available after payment is confirmed.", {
      status: 403,
    });
  }

  const { data: chargeRows } = await supabase
    .from("booking_charges")
    .select(
      "id, charge_type, description, billing_period_start, billing_period_end, amount, currency, status, invoice_number, payment_reference, paid_at"
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  const charges = (chargeRows || []) as ChargeRow[];

  const space = (booking as any).spaces;
  const renter = (booking as any).renter;
  const owner = (booking as any).owner;

  const start = new Date(booking.start_at).toLocaleDateString();
  const end = new Date(booking.end_at).toLocaleDateString();

  const invoiceNumber =
    charges.find((c) => c.invoice_number)?.invoice_number ||
    generateInvoiceNumber(booking.id);

  const lineItemsHtml =
    charges.length > 0
      ? charges
          .map((c) => {
            const amt = Number(c.amount || 0).toFixed(2);
            const label =
              c.description ||
              c.charge_type.replace(/_/g, " ") ||
              "Line item";
            return `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(label)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">R${escapeHtml(amt)}</td>
          </tr>`;
          })
          .join("")
      : `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">Booking total</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">R${escapeHtml(Number(booking.total_price || 0).toFixed(2))}</td>
        </tr>`;

  const totalFromCharges =
    charges.length > 0
      ? charges.reduce((sum, c) => sum + Number(c.amount || 0), 0)
      : Number(booking.total_price || 0);

  const displayRef =
    charges.find((c) => c.payment_reference)?.payment_reference ||
    row.payment_reference;
  const displayPaidAt =
    charges.find((c) => c.paid_at)?.paid_at || row.paid_at;

  const html = `
  <html>
    <head>
      <title>Invoice ${escapeHtml(invoiceNumber)}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 40px;
          color: #192a3a;
        }
        h1 {
          margin-bottom: 10px;
        }
        .section {
          margin-top: 20px;
        }
        .box {
          border: 1px solid #ddd;
          padding: 15px;
          border-radius: 8px;
        }
        .row {
          margin-bottom: 6px;
        }
        .total {
          font-size: 20px;
          font-weight: bold;
          margin-top: 15px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          text-align: left;
          padding: 8px;
          border-bottom: 2px solid #ddd;
        }
      </style>
    </head>
    <body>
      <h1>Invoice</h1>
      <div class="row"><strong>Invoice number:</strong> ${escapeHtml(invoiceNumber)}</div>
      <div class="row"><strong>Booking ID:</strong> ${escapeHtml(booking.id)}</div>
      <div class="row">Issued: ${escapeHtml(new Date().toLocaleDateString())}</div>

      <div class="section box">
        <strong>Renter</strong>
        <div class="row">${escapeHtml(renter?.first_name || "")} ${escapeHtml(renter?.last_name || "")}</div>
        <div class="row">${escapeHtml(renter?.email || "")}</div>
      </div>

      <div class="section box">
        <strong>Space</strong>
        <div class="row">${escapeHtml(space?.title || "")}</div>
        <div class="row">
          ${escapeHtml(
            [space?.address_line_1, space?.suburb, space?.city]
              .filter(Boolean)
              .join(", ")
          )}
        </div>
      </div>

      <div class="section box">
        <strong>Booking details</strong>
        <div class="row">Period: ${escapeHtml(start)} – ${escapeHtml(end)}</div>
        <div class="row">Booking type: ${escapeHtml(booking.booking_unit || "day")}</div>
        <div class="row">Status: ${escapeHtml(booking.status)}</div>
        <div class="row">Payment: ${escapeHtml(booking.payment_status)}</div>
        ${displayPaidAt ? `<div class="row">Paid at: ${escapeHtml(new Date(displayPaidAt).toLocaleString())}</div>` : ""}
        ${displayRef ? `<div class="row">Payment reference: ${escapeHtml(displayRef)}</div>` : ""}
      </div>

      <div class="section box">
        <strong>Line items</strong>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHtml}
          </tbody>
        </table>
        <div class="total">Total: R${escapeHtml(totalFromCharges.toFixed(2))}</div>
      </div>

      <p style="font-size:12px;color:#888;margin-top:30px;">
        FindMySpace - Rent spaces easily and securely
      </p>
    </body>
  </html>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
