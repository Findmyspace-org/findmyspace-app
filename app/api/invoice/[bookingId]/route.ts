import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(`
      id,
      start_at,
      end_at,
      total_price,
      payment_status,
      status,
      paid_at,
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
    `)
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    return new NextResponse("Booking not found", { status: 404 });
  }

  const space = (booking as any).spaces;
  const renter = (booking as any).renter;
  const owner = (booking as any).owner;

  const start = new Date(booking.start_at).toLocaleDateString();
  const end = new Date(booking.end_at).toLocaleDateString();

  const html = `
  <html>
    <head>
      <title>Invoice ${booking.id}</title>
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
      </style>
    </head>
    <body>
      <h1>Invoice</h1>
      <div>Invoice ID: ${booking.id}</div>
      <div>Date: ${new Date().toLocaleDateString()}</div>

      <div class="section box">
        <strong>Renter</strong>
        <div class="row">${renter?.first_name || ""} ${renter?.last_name || ""}</div>
        <div class="row">${renter?.email || ""}</div>
      </div>

      <div class="section box">
        <strong>Space</strong>
        <div class="row">${space?.title || ""}</div>
        <div class="row">
          ${[space?.address_line_1, space?.suburb, space?.city]
            .filter(Boolean)
            .join(", ")}
        </div>
      </div>

      <div class="section box">
        <strong>Booking Details</strong>
        <div class="row">Period: ${start} - ${end}</div>
        <div class="row">Status: ${booking.status}</div>
        <div class="row">Payment: ${booking.payment_status}</div>
      </div>

      <div class="section box">
        <strong>Amount</strong>
        <div class="total">R${Number(booking.total_price || 0).toFixed(2)}</div>
      </div>

      <p style="font-size:12px;color:#888;margin-top:30px;">
        FindMySpace - Rent spaces easily and securely
      </p>
    </body>
  </html>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}