import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPublicSiteUrlFromEnv } from "@/lib/site-url";

const RENTER_EXPIRY_MESSAGE =
  "Your booking expired because payment was not completed within 24 hours. Thank you for your interest. Please try again if you would still like to book this space.";

const OWNER_EXPIRY_MESSAGE =
  "A booking request for your space expired because the renter did not complete payment within 24 hours. The dates are now available again.";

function bookingIdsFromExpireRpcResult(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const row of data) {
    if (typeof row === "string") {
      ids.push(row);
      continue;
    }
    if (row && typeof row === "object") {
      const id =
        (row as { id?: string; booking_id?: string }).id ??
        (row as { booking_id?: string }).booking_id;
      if (typeof id === "string") ids.push(id);
    }
  }
  return ids;
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Cron error: missing Supabase server configuration");
      return NextResponse.json(
        { error: "Missing server configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const { data, error } = await supabase.rpc("expire_unpaid_bookings");

    if (error) {
      console.error("Cron error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const bookingIds = bookingIdsFromExpireRpcResult(data);
    console.log("RPC result:", data);
    console.log("Expired booking IDs:", bookingIds);

    const appBaseUrl = getPublicSiteUrlFromEnv() ?? "";

    if (bookingIds.length > 0) {
      const { data: expiredBookings, error: fetchError } = await (supabase
        .from("bookings") as any)
        .select("id, renter_id, owner_id")
        .in("id", bookingIds);
      console.log("Expired bookings fetched:", expiredBookings);

      if (fetchError) {
        console.error("Cron: failed to load expired bookings:", fetchError);
      } else {
        for (const booking of (expiredBookings || []) as {
          id: string;
          renter_id: string;
          owner_id: string;
        }[]) {
          const { id: bookingId, renter_id, owner_id } = booking;
          console.log("Processing booking:", bookingId, { renter_id, owner_id });

          if (!renter_id || !owner_id) {
            console.error(`Cron: missing renter_id or owner_id for booking ${bookingId}`);
            continue;
          }

          const { error: insertError } = await (supabase
            .from("booking_messages") as any)
            .insert([
              {
                booking_id: bookingId,
                sender_id: owner_id,
                recipient_id: renter_id,
                message: RENTER_EXPIRY_MESSAGE,
              },
              {
                booking_id: bookingId,
                sender_id: owner_id,
                recipient_id: owner_id,
                message: OWNER_EXPIRY_MESSAGE,
              },
            ]);
          console.log("Insert attempted for booking:", bookingId);

          if (insertError) {
            console.error(
              `Cron: booking_messages insert failed for ${bookingId}:`,
              insertError
            );
            console.log("Insert error details:", insertError);
            continue;
          }

          if (appBaseUrl) {
            try {
              const res = await fetch(
                `${appBaseUrl}/api/notifications/booking-event`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    bookingId,
                    eventType: "booking_expired",
                  }),
                }
              );
              if (!res.ok) {
                console.error(
                  `Cron: booking-event notification failed for ${bookingId}:`,
                  await res.text()
                );
              }
            } catch (notifyErr) {
              console.error(
                `Cron: booking-event fetch failed for ${bookingId}:`,
                notifyErr
              );
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      expired: bookingIds.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
