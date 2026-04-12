import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  buildFinanceLineItems,
  type FinanceBookingInput,
} from "@/lib/finance-booking-lines";
import {
  filterFinanceLineItems,
  groupMonthlyPaidLines,
  parseAdminFinanceFilters,
  summarizePaidLines,
} from "@/lib/admin-finance-filters";
import { FINANCE_BOOKINGS_QUERY_LIMIT } from "@/lib/finance-query-limits";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const searchParams = req.nextUrl.searchParams;
  const filters = parseAdminFinanceFilters(searchParams);

  const { data: bookingRows, error: bookingError } = await (admin
    .from("bookings") as any)
    .select(
      `
      id,
      space_id,
      total_price,
      platform_fee,
      owner_earnings,
      status,
      payment_status,
      paid_at,
      created_at,
      space:spaces(title),
      renter:profiles!bookings_renter_id_fkey(first_name, last_name, email),
      owner:profiles!bookings_owner_id_fkey(first_name, last_name, email),
      booking_charges(
        id,
        charge_type,
        description,
        billing_period_start,
        billing_period_end,
        amount,
        status,
        paid_at,
        payment_reference,
        statement_month
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(FINANCE_BOOKINGS_QUERY_LIMIT);

  if (bookingError) {
    console.error("admin finance bookings:", bookingError);
    return NextResponse.json(
      { error: bookingError.message },
      { status: 500 }
    );
  }

  const bookings = (bookingRows || []) as FinanceBookingInput[];
  const allLines = buildFinanceLineItems(bookings);
  const filteredLines = filterFinanceLineItems(allLines, bookings, filters);
  const paidSummary = summarizePaidLines(filteredLines);
  const monthly = groupMonthlyPaidLines(filteredLines, bookings);

  const { data: expiredRows } = await admin
    .from("bookings")
    .select("total_price")
    .eq("status", "expired");

  const expiredUnpaid =
    (expiredRows || []).reduce(
      (sum, row: { total_price: number | null }) =>
        sum + Number(row.total_price || 0),
      0
    ) ?? 0;

  const { data: paymentRows, error: payErr } = await (admin
    .from("payments") as any)
    .select("id, amount, status, failed_at, booking_id");

  if (payErr) {
    console.error("admin finance payments:", payErr);
  }

  const failedPayments = (paymentRows || []).filter(
    (p: {
      failed_at?: string | null;
      status?: string | null;
    }) => {
      if (p.failed_at) return true;
      const s = String(p.status || "").toLowerCase();
      return (
        s === "failed" ||
        s === "declined" ||
        s === "error" ||
        s === "cancelled"
      );
    }
  );

  const paymentFailureCount = failedPayments.length;
  const paymentFailureAmount = failedPayments.reduce(
    (sum: number, p: { amount?: number | string | null }) =>
      sum + Number(p.amount || 0),
    0
  );

  const chargeTypes = Array.from(
    new Set(allLines.map((l) => l.chargeType))
  ).sort();

  const spaceOptions = Array.from(
    new Map(
      bookings.map((b) => [
        b.space_id,
        { id: b.space_id, title: b.space?.title || "Untitled" },
      ])
    ).values()
  ).sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  return NextResponse.json({
    summary: {
      grossBookingValue: paidSummary.grossBookingValue,
      totalPlatformFees: paidSummary.totalPlatformFees,
      totalOwnerEarnings: paidSummary.totalOwnerEarnings,
      depositsCollected: paidSummary.depositsCollected,
      expiredUnpaid,
      paymentFailures: paymentFailureCount,
      paymentFailureAmount,
    },
    filters: {
      chargeTypes,
      spaceOptions,
    },
    transactions: filteredLines,
    monthly,
  });
}
