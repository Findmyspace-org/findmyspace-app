import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  buildFinanceLineItems,
  type FinanceBookingInput,
} from "@/lib/finance-booking-lines";
import {
  filterFinanceLineItems,
  parseAdminFinanceFilters,
} from "@/lib/admin-finance-filters";
import { FINANCE_BOOKINGS_QUERY_LIMIT } from "@/lib/finance-query-limits";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error("admin finance export: missing Supabase server configuration");
      return NextResponse.json(
        { error: "Missing server configuration." },
        { status: 500 }
      );
    }

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
      return NextResponse.json(
        { error: bookingError.message },
        { status: 500 }
      );
    }

    const bookings = (bookingRows || []) as FinanceBookingInput[];
    const allLines = buildFinanceLineItems(bookings);
    const filteredLines = filterFinanceLineItems(allLines, bookings, filters);

    const header = [
      "booking_id",
      "property",
      "owner",
      "renter",
      "charge_type",
      "billing_period",
      "gross",
      "platform_fee",
      "net_owner",
      "status",
      "paid_at",
      "payment_reference",
    ];

    const lines = [
      header.join(","),
      ...filteredLines.map((t) =>
        [
          csvEscape(t.bookingId),
          csvEscape(t.propertyTitle),
          csvEscape(t.ownerLabel),
          csvEscape(t.renterLabel),
          csvEscape(t.chargeType),
          csvEscape(t.billingPeriodLabel),
          csvEscape(String(t.gross.toFixed(2))),
          csvEscape(String(t.platformFee.toFixed(2))),
          csvEscape(String(t.netOwner.toFixed(2))),
          csvEscape(t.status),
          csvEscape(t.paidAt || ""),
          csvEscape(t.paymentRef || ""),
        ].join(",")
      ),
    ];

    const csv = "\uFEFF" + lines.join("\n");

    const filename = `findmyspace-finance-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("admin finance export error:", error);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
