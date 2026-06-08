import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getCanonicalPublicSiteUrl,
  getPublicSiteUrlFromEnv,
} from "@/lib/site-url";
import {
  buildSignedPayFastCheckoutPayload,
  readPayFastMerchantSecrets,
  validateBookingForPayFastInitiate,
} from "@/lib/payfast-initiate-shared";

type BookingRow = {
  id: string;
  renter_id: string;
  owner_id: string;
  status: string | null;
  payment_status: string | null;
  total_price: number | null;
  space_id: string;
};

type SpaceRow = {
  id: string;
  title: string | null;
};

function resolveAppBaseUrl(req: NextRequest): string | null {
  const envBase = getPublicSiteUrlFromEnv();
  const canonicalBase = getCanonicalPublicSiteUrl();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.trim();
  const origin = req.headers.get("origin")?.trim();

  const isSafe = (url: string) => {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (process.env.NODE_ENV === "production") {
        if (
          host.includes("localhost") ||
          host.includes("127.0.0.1") ||
          host.includes("ngrok") ||
          host.includes(".vercel.app")
        ) {
          return false;
        }
      }
      return u.protocol === "https:" || process.env.NODE_ENV !== "production";
    } catch {
      return false;
    }
  };

  if (forwardedHost) {
    const proto =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : process.env.NODE_ENV === "production"
          ? "https"
          : "http";
    const candidate = `${proto}://${forwardedHost}`;
    if (isSafe(candidate)) {
      return candidate.replace(/\/+$/, "");
    }
  }

  if (origin && isSafe(origin)) {
    return origin.replace(/\/+$/, "");
  }

  return envBase || canonicalBase || null;
}

export async function POST(req: NextRequest) {
  try {
    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
    } = process.env;

    const merchant = readPayFastMerchantSecrets();
    const missingVars: string[] = [];
    if (!NEXT_PUBLIC_SUPABASE_URL?.trim()) missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY?.trim()) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
      missingVars.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    if (
      missingVars.length > 0 ||
      !merchant
    ) {
      const message =
        missingVars.length > 0
          ? `Missing required environment variables for payment initiation: ${missingVars.join(", ")}`
          : "Invalid PayFast configuration. Check PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, and PAYFAST_PROCESS_URL.";
      return NextResponse.json(
        {
          error: message,
        },
        { status: 500 }
      );
    }

    const supabaseUrl = NEXT_PUBLIC_SUPABASE_URL as string;
    const supabaseAnonKey = NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    const supabaseServiceRoleKey = SUPABASE_SERVICE_ROLE_KEY as string;

    const body = await req.json();
    const bookingId =
      typeof body.bookingId === "string" ? body.bookingId.trim() : "";

    if (!bookingId) {
      return NextResponse.json(
        { error: "Missing bookingId." },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing auth token." },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");

    const supabaseUserClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "User not authenticated." },
        { status: 401 }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const appBaseUrl = resolveAppBaseUrl(req);

    if (!appBaseUrl) {
      return NextResponse.json(
        {
          error:
            "Could not determine application base URL. Set NEXT_PUBLIC_SITE_URL to your public origin.",
        },
        { status: 500 }
      );
    }

    const { data: bookingRows, error: bookingError } = await (supabaseAdmin
      .from("bookings") as any)
      .select(
        "id, renter_id, owner_id, status, payment_status, total_price, space_id"
      )
      .eq("id", bookingId)
      .limit(1);

    if (bookingError) {
      console.error("Booking lookup error full:", bookingError);
      return NextResponse.json(
        {
          error: `Booking lookup failed: ${bookingError.message}`,
          details: bookingError,
        },
        { status: 500 }
      );
    }

    if (!bookingRows || bookingRows.length === 0) {
      return NextResponse.json(
        { error: `Booking not found for id: ${bookingId}` },
        { status: 404 }
      );
    }

    const booking = bookingRows[0] as BookingRow;

    if (booking.renter_id !== user.id) {
      return NextResponse.json(
        { error: "You can only pay for your own booking." },
        { status: 403 }
      );
    }

    const { data: spaceData } = await supabaseAdmin
      .from("spaces")
      .select("id, title, status")
      .eq("id", booking.space_id)
      .single();

    const space = (spaceData || null) as (SpaceRow & { status: string | null }) | null;

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

    const { processUrl, fields } = buildSignedPayFastCheckoutPayload({
      appBaseUrl,
      booking: {
        id: booking.id,
        space_id: booking.space_id,
        total_price: booking.total_price as number,
      },
      spaceTitle: space?.title ?? null,
      payerFirstName: String(user.user_metadata?.first_name || "FindMySpace"),
      payerLastName: String(user.user_metadata?.last_name || "User"),
      payerEmail: String(user.email || ""),
      merchant,
    });

    return NextResponse.json({
      processUrl,
      fields,
    });
  } catch (error: any) {
    console.error("PayFast initiate error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not initiate PayFast payment." },
      { status: 500 }
    );
  }
}