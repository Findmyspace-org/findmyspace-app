import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

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

function generatePayFastSignature(
  data: Record<string, string>,
  passphrase?: string
) {
  const orderedKeys = [
    "merchant_id",
    "merchant_key",
    "return_url",
    "cancel_url",
    "notify_url",
    "name_first",
    "name_last",
    "email_address",
    "m_payment_id",
    "amount",
    "item_name",
    "custom_str1",
    "custom_str2",
  ];

  const paramString = orderedKeys
    .filter((key) => data[key] !== undefined && data[key] !== null && data[key] !== "")
    .map((key) => {
      const value = String(data[key]).trim();
      return `${key}=${encodeURIComponent(value).replace(/%20/g, "+")}`;
    })
    .join("&");

  const finalString =
    passphrase && passphrase.trim() !== ""
      ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`
      : paramString;

  return crypto.createHash("md5").update(finalString).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SITE_URL,
      PAYFAST_MERCHANT_ID,
      PAYFAST_MERCHANT_KEY,
      PAYFAST_PASSPHRASE,
      PAYFAST_PROCESS_URL,
    } = process.env;

    if (
      !NEXT_PUBLIC_SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !PAYFAST_MERCHANT_ID ||
      !PAYFAST_MERCHANT_KEY ||
      !PAYFAST_PROCESS_URL
    ) {
      return NextResponse.json(
        { error: "Missing required environment variables." },
        { status: 500 }
      );
    }

    console.log("Has service role key:", !!SUPABASE_SERVICE_ROLE_KEY);
    console.log("Supabase URL:", NEXT_PUBLIC_SUPABASE_URL);

    const keyParts = SUPABASE_SERVICE_ROLE_KEY.split(".");
    if (keyParts.length === 3) {
      const payload = JSON.parse(
        Buffer.from(keyParts[1], "base64").toString("utf-8")
      );
      console.log("Service key role:", payload.role);
    }

    const body = await req.json();
    const bookingId =
      typeof body.bookingId === "string" ? body.bookingId.trim() : "";

    console.log("PayFast initiate bookingId:", bookingId);

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
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const requestOrigin = (() => {
      try {
        return new URL(req.url).origin;
      } catch {
        return null;
      }
    })();

    const appBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || requestOrigin || null;

    if (!appBaseUrl) {
      return NextResponse.json(
        { error: "Could not determine application base URL." },
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

    if (
      booking.status !== "accepted_awaiting_payment" ||
      (booking.payment_status || "unpaid") !== "awaiting_payment"
    ) {
      return NextResponse.json(
        { error: "This booking is not ready for payment." },
        { status: 400 }
      );
    }

    if (!booking.total_price || booking.total_price <= 0) {
      return NextResponse.json(
        { error: "Invalid booking amount." },
        { status: 400 }
      );
    }

    const { data: spaceData } = await supabaseAdmin
      .from("spaces")
      .select("id, title")
      .eq("id", booking.space_id)
      .single();

    const space = (spaceData || null) as SpaceRow | null;

    const amount = Number(booking.total_price).toFixed(2);

    const paymentData: Record<string, string> = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${appBaseUrl}/dashboard/my-bookings?payment=success&bookingId=${booking.id}`,
      cancel_url: `${appBaseUrl}/dashboard/my-bookings?payment=cancelled&bookingId=${booking.id}`,
      notify_url: `${appBaseUrl}/api/payfast/notify`,
      name_first: String(user.user_metadata?.first_name || "FindMySpace"),
      name_last: String(user.user_metadata?.last_name || "User"),
      email_address: String(user.email || ""),
      m_payment_id: String(booking.id),
      amount,
      item_name: space?.title
        ? `FindMySpace - ${space.title}`
        : `FindMySpace booking ${booking.id}`,
      custom_str1: String(booking.id),
      custom_str2: String(booking.space_id),
    };

    console.log("PayFast paymentData:", paymentData);
    console.log("PayFast passphrase set:", !!PAYFAST_PASSPHRASE);

    const signature = generatePayFastSignature(
      paymentData,
      PAYFAST_PASSPHRASE
    );

    return NextResponse.json({
      processUrl: PAYFAST_PROCESS_URL,
      fields: {
        ...paymentData,
        signature,
      },
    });
  } catch (error: any) {
    console.error("PayFast initiate error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not initiate PayFast payment." },
      { status: 500 }
    );
  }
}