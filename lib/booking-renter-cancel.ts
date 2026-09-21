import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBookingHostRecipientId } from "@/lib/access/resolve-operational-booking-managers";

export const RENTER_CANCEL_MESSAGE =
  "The renter has cancelled this booking request. Thank you for your interest and understanding.";

export const RENTER_CANCEL_STATUSES = [
  "pending_owner",
  "accepted_awaiting_payment",
] as const;

export function canRenterCancelStatus(
  status: string | null | undefined
): boolean {
  return (
    status === "pending_owner" || status === "accepted_awaiting_payment"
  );
}

/**
 * Renter cancel. renterId MUST be the authenticated session user (never a body field).
 * Transition is conditional on current cancellable status so a stale request
 * cannot overwrite a later host/payment state.
 */
export async function applyRenterBookingCancel(
  admin: SupabaseClient,
  params: { bookingId: string; renterId: string }
): Promise<{ bookingId: string; hostRecipientId: string | null }> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, renter_id, owner_id, space_id, status, payment_status")
    .eq("id", params.bookingId)
    .maybeSingle();

  if (error || !booking) {
    throw new Error("Booking not found.");
  }

  const row = booking as {
    id: string;
    renter_id: string;
    owner_id: string | null;
    space_id: string;
    status: string | null;
    payment_status: string | null;
  };

  if (row.renter_id !== params.renterId) {
    throw new Error("You can only cancel your own booking.");
  }

  const { data: updatedRows, error: updateError } = await admin
    .from("bookings")
    .update({
      status: "declined",
      payment_status: "unpaid",
    })
    .eq("id", row.id)
    .eq("renter_id", params.renterId)
    .in("status", [...RENTER_CANCEL_STATUSES])
    .select("id");

  if (updateError) {
    throw new Error(updateError.message || "Could not cancel booking.");
  }

  if (!updatedRows?.length) {
    throw new Error("This booking can no longer be cancelled.");
  }

  const hostRecipientId = await resolveBookingHostRecipientId(admin, {
    owner_id: row.owner_id,
    space_id: row.space_id,
  });

  if (hostRecipientId) {
    await admin.from("booking_messages").insert({
      booking_id: row.id,
      sender_id: params.renterId,
      recipient_id: hostRecipientId,
      message: RENTER_CANCEL_MESSAGE,
    });
  }

  return { bookingId: row.id, hostRecipientId };
}
