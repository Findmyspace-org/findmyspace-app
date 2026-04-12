import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { markBookingChargesPaid } from "@/lib/invoice-payments";

function generateNotifySignatureFromRawBody(
  rawBody: string,
  passphrase?: string
) {
  const pieces = rawBody
    .split("&")
    .filter((part) => !part.startsWith("signature="));

  let signatureString = pieces.join("&");

  if (passphrase && passphrase.trim() !== "") {
    signatureString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  }

  return crypto.createHash("md5").update(signatureString).digest("hex");
}

export async function GET() {
  return new NextResponse("Method not allowed", { status: 405 });
}

export async function POST(req: Request) {
  try {
    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      PAYFAST_PASSPHRASE,
    } = process.env;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Notify error: missing env vars");
      return new NextResponse("Missing server config", { status: 500 });
    }

    const rawBody = await req.text();
    console.log("PayFast notify raw body:", rawBody);

    const params = new URLSearchParams(rawBody);
    const data: Record<string, string> = {};

    params.forEach((value, key) => {
      data[key] = value;
    });

    console.log("PayFast notify parsed data:", data);

    const receivedSignature = data.signature || "";
    const calculatedSignature = generateNotifySignatureFromRawBody(
      rawBody,
      PAYFAST_PASSPHRASE
    );

    console.log("PayFast notify signatures:", {
      receivedSignature,
      calculatedSignature,
    });

    if (receivedSignature !== calculatedSignature) {
      console.error("Notify error: invalid signature");
      return new NextResponse("Invalid signature", { status: 400 });
    }

    const bookingId = data.m_payment_id || data.custom_str1 || "";
    const paymentStatus = data.payment_status || "";
    const amountGross = Number(data.amount_gross || data.amount || 0);
    const pfPaymentId = data.pf_payment_id || "";

    console.log("PayFast notify booking info:", {
      bookingId,
      paymentStatus,
      amountGross,
    });

    if (!bookingId) {
      console.error("Notify error: missing booking ID");
      return new NextResponse("Missing booking ID", { status: 400 });
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

    const { data: bookingRows, error: bookingError } = await (supabaseAdmin
      .from("bookings") as any)
      .select("id, total_price, status, payment_status")
      .eq("id", bookingId)
      .limit(1);

    if (bookingError) {
      console.error("Notify booking lookup error:", bookingError);
      return new NextResponse("Booking lookup failed", { status: 500 });
    }

    if (!bookingRows || bookingRows.length === 0) {
      console.error("Notify error: booking not found", bookingId);
      return new NextResponse("Booking not found", { status: 404 });
    }

    const booking = bookingRows[0];

    console.log("Current booking row before notify update:", booking);

    const expectedAmount = Number(booking.total_price || 0).toFixed(2);
    const actualAmount = Number(amountGross || 0).toFixed(2);

    console.log("PayFast notify amount check:", {
      expectedAmount,
      actualAmount,
    });

    if (expectedAmount !== actualAmount) {
      console.error("Notify error: amount mismatch", {
        expectedAmount,
        actualAmount,
      });
      return new NextResponse("Amount mismatch", { status: 400 });
    }

    if (paymentStatus === "COMPLETE") {
      if (
        booking.status === "paid_confirmed" &&
        booking.payment_status === "paid"
      ) {
        console.log("Notify skipped: booking already marked as paid", bookingId);
        return new NextResponse("OK", { status: 200 });
      }

      const payable =
        booking.status === "accepted_awaiting_payment" &&
        (booking.payment_status || "unpaid") === "awaiting_payment";

      if (!payable) {
        console.log("Notify ignored COMPLETE: booking not awaiting payment", {
          bookingId,
          status: booking.status,
          payment_status: booking.payment_status,
        });
        return new NextResponse("OK", { status: 200 });
      }

      console.log("About to update booking to paid:", bookingId);

      const paidAt = new Date().toISOString();
      const { data: updatedRows, error: updateError } = await (supabaseAdmin
        .from("bookings") as any)
        .update({
          status: "paid_confirmed",
          payment_status: "paid",
          paid_at: paidAt,
          ...(pfPaymentId ? { payment_reference: pfPaymentId } : {}),
        })
        .eq("id", bookingId)
        .eq("status", "accepted_awaiting_payment")
        .eq("payment_status", "awaiting_payment")
        .select("id, status, payment_status, paid_at");

      if (updateError) {
        console.error("Notify update error:", updateError);
        return new NextResponse("Could not update booking", { status: 500 });
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.log(
          "Notify: no row updated (race or state changed), treating as OK",
          bookingId
        );
        return new NextResponse("OK", { status: 200 });
      }

      console.log("Notify success: booking updated to paid_confirmed", bookingId);
      console.log("Updated booking rows:", updatedRows);

      const { error: markChargesError } = await markBookingChargesPaid(
        supabaseAdmin,
        bookingId,
        paidAt,
        pfPaymentId || null
      );
      if (markChargesError) {
        console.error("Notify: could not mark booking_charges paid:", markChargesError);
      }

      const { data: verifyRows, error: verifyError } = await (supabaseAdmin
        .from("bookings") as any)
        .select("id, status, payment_status, paid_at")
        .eq("id", bookingId)
        .limit(1);

      if (verifyError) {
        console.error("Notify verify read error:", verifyError);
      } else {
        console.log("Booking row after update verification:", verifyRows?.[0]);
      }

      if (appBaseUrl) {
        try {
          const emailResponse = await fetch(
            `${appBaseUrl}/api/notifications/booking-event`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                bookingId,
                eventType: "payment_confirmed",
              }),
            }
          );

          console.log("Payment confirmed email trigger status:", {
            status: emailResponse.status,
            baseUrl: appBaseUrl,
          });

          if (!emailResponse.ok) {
            const emailText = await emailResponse.text();
            console.error("Payment confirmed email trigger failed:", {
              status: emailResponse.status,
              baseUrl: appBaseUrl,
              body: emailText,
            });
          }
        } catch (error) {
          console.error("Could not send payment confirmed emails:", {
            baseUrl: appBaseUrl,
            error,
          });
        }
      } else {
        console.error(
          "Could not send payment confirmed emails: no base URL available"
        );
      }
    } else {
      console.log("Notify received non-complete payment status:", paymentStatus);
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("PayFast notify fatal error:", error);
    return new NextResponse("Server error", { status: 500 });
  }
}