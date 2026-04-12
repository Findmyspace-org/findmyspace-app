import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvoiceNumber } from "@/lib/invoice";

/**
 * Mark all pending booking_charges as paid with a single invoice number (server/service role).
 */
export async function markBookingChargesPaid(
  admin: SupabaseClient,
  bookingId: string,
  paidAt: string,
  paymentReference: string | null
): Promise<{ error: Error | null }> {
  const invoiceNumber = generateInvoiceNumber(bookingId);

  const { error } = await (admin.from("booking_charges") as any)
    .update({
      status: "paid",
      paid_at: paidAt,
      payment_reference: paymentReference,
      invoice_number: invoiceNumber,
    })
    .eq("booking_id", bookingId)
    .eq("status", "pending");

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}
