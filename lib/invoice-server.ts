/**
 * Shared invoice data loading for HTML and PDF routes (auth + DB only).
 */

import { createClient } from "@supabase/supabase-js";
import { isInvoiceEligibleBooking } from "@/lib/finance-status";
import {
  buildInvoiceDocument,
  type InvoiceBookingRow,
  type InvoiceChargeRow,
  type InvoiceDocument,
} from "@/lib/invoice-document";

export async function loadInvoiceDocumentForRequest(params: {
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  authHeader: string | null;
  bookingId: string;
}): Promise<
  { ok: true; doc: InvoiceDocument } | { ok: false; response: Response }
> {
  const { supabaseUrl, serviceKey, anonKey, authHeader, bookingId } = params;

  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
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
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
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
      monthly_rent,
      months_total,
      months_paid,
      deposit_amount,
      initial_payment_amount,
      next_payment_date,
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
    return { ok: false, response: new Response("Booking not found", { status: 404 }) };
  }

  const row = booking as typeof booking & {
    renter_id: string;
    owner_id: string;
  };

  if (row.renter_id !== user.id && row.owner_id !== user.id) {
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }

  if (!isInvoiceEligibleBooking(row.status, row.payment_status)) {
    return {
      ok: false,
      response: new Response("Invoice available after payment is confirmed.", {
        status: 403,
      }),
    };
  }

  const { data: chargeRows } = await supabase
    .from("booking_charges")
    .select(
      "id, charge_type, description, billing_period_start, billing_period_end, amount, currency, status, invoice_number, payment_reference, paid_at"
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  const charges = (chargeRows || []) as InvoiceChargeRow[];

  const doc = buildInvoiceDocument(
    booking as unknown as InvoiceBookingRow,
    charges
  );

  return { ok: true, doc };
}

export type { InvoiceDocument };
