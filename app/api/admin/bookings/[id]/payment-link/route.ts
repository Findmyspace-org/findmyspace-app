import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { getPublicSiteUrlFromEnv } from "@/lib/site-url";
import {
  buildSignedPayFastCheckoutPayload,
  readPayFastMerchantSecrets,
  resolvePayFastPayerNamesFromProfile,
  validateBookingForPayFastInitiate,
  type BookingRowForPayFastInitiate,
  type PayFastPayerProfileRow,
} from "@/lib/payfast-initiate-shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id: rawId } = await params;
    const bookingId = (rawId || "").trim();
    if (!UUID_RE.test(bookingId)) {
      return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
    }

    let body: { reason?: string };
    try {
      body = (await req.json()) as { reason?: string };
    } catch {
      body = {};
    }
    const reason = (body.reason || "").trim();
    if (reason.length < 3) {
      return NextResponse.json(
        { error: "Reason must be at least 3 characters." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing server configuration." },
        { status: 500 }
      );
    }

    const merchant = readPayFastMerchantSecrets();
    if (!merchant) {
      return NextResponse.json(
        {
          error:
            "PayFast is not configured. Check PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PROCESS_URL.",
        },
        { status: 500 }
      );
    }

    const appBaseUrl = getPublicSiteUrlFromEnv();
    if (!appBaseUrl) {
      return NextResponse.json(
        {
          error:
            "Could not determine application base URL. Set NEXT_PUBLIC_SITE_URL.",
        },
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

    // Load booking with renter profile via FK so payer fields always match booking.renter_id
    // (never derived from the admin session — auth.userId is only for audit below).
    const { data: bookingRow, error: bookingError } = await (admin
      .from("bookings") as any)
      .select(
        `id, renter_id, owner_id, status, payment_status, total_price, space_id,
         renter:profiles!bookings_renter_id_fkey ( first_name, last_name, full_name, email )`
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      return NextResponse.json(
        { error: bookingError.message },
        { status: 500 }
      );
    }
    if (!bookingRow) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const booking = bookingRow as BookingRowForPayFastInitiate & {
      renter: PayFastPayerProfileRow | null;
    };

    if (!booking.renter_id) {
      return NextResponse.json(
        { error: "Booking has no renter; cannot build payment link." },
        { status: 400 }
      );
    }

    const { data: spaceData } = await admin
      .from("spaces")
      .select("id, title, status")
      .eq("id", booking.space_id)
      .single();

    const space = (spaceData || null) as {
      id: string;
      title: string | null;
      status: string | null;
    } | null;

    const eligibility = validateBookingForPayFastInitiate(
      booking,
      space?.status ?? null
    );
    if (!eligibility.ok) {
      return NextResponse.json(
        { error: eligibility.error },
        { status: eligibility.status }
      );
    }

    const rp = booking.renter;
    if (!rp) {
      return NextResponse.json(
        { error: "Could not load renter profile for payment details." },
        { status: 500 }
      );
    }

    const email = (rp.email || "").trim();
    if (!email) {
      return NextResponse.json(
        { error: "Renter profile has no email; cannot build PayFast checkout." },
        { status: 400 }
      );
    }

    const { payerFirstName, payerLastName } =
      resolvePayFastPayerNamesFromProfile(rp);

    const { processUrl, fields } = buildSignedPayFastCheckoutPayload({
      appBaseUrl,
      booking: {
        id: booking.id,
        space_id: booking.space_id,
        total_price: booking.total_price as number,
      },
      spaceTitle: space?.title ?? null,
      payerFirstName,
      payerLastName,
      payerEmail: email,
      merchant,
    });

    await adminAudit({
      action: "booking_payment_link_resend",
      actorUserId: auth.userId,
      targetType: "booking",
      targetId: booking.id,
      reason,
      meta: {
        bookingStatus: booking.status,
        paymentStatus: booking.payment_status,
      },
    });

    return NextResponse.json({
      processUrl,
      fields,
      hint:
        "Same payload as renter Pay now — renter must complete checkout while logged in as themselves for session consistency.",
    });
  } catch (e: unknown) {
    console.error("admin booking payment-link POST:", e);
    return NextResponse.json(
      { error: "Could not build payment link." },
      { status: 500 }
    );
  }
}
