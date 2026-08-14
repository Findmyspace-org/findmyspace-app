import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import {
  COMPLIMENTARY_FULL_DISCOUNT_REFERENCE,
  computeBookingDiscount,
  feesFromFinalAmount,
  monthlySplitAfterDiscount,
  parseApproverDiscountBody,
  redistributePendingChargesToFinal,
  resolveOriginalBookingAmount,
  roundMoney,
  type BookingDiscountType,
} from "@/lib/booking-discount";
import { isPaymentSettledForReporting } from "@/lib/finance-status";
import { markBookingChargesPaid } from "@/lib/invoice-payments";
import { isSpaceBookable } from "@/lib/listing-lifecycle";
import { assertCanApproveSpaceBooking } from "@/lib/space-listing-access";

const PENDING_STATUSES = ["pending_owner", "pending"] as const;
const BLOCKING_STATUSES = [
  "approved",
  "accepted_awaiting_payment",
  "awaiting_payment",
  "paid_confirmed",
  "confirmed",
  "completed",
] as const;

const AUTO_DECLINE_MESSAGE =
  "Your booking request was declined because another overlapping booking was approved for this space. Thank you for your interest. Please try another date.";

export class BookingApproveError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BookingApproveError";
    this.status = status;
  }
}

export type ApproveBookingResult = {
  bookingId: string;
  status: "accepted_awaiting_payment" | "paid_confirmed";
  paymentStatus: "awaiting_payment" | "paid";
  complimentary: boolean;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  discountType: BookingDiscountType | null;
  declinedCompetingIds: string[];
};

type BookingApproveRow = {
  id: string;
  space_id: string;
  renter_id: string;
  owner_id: string;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  payment_status: string | null;
  total_price: number | null;
  original_total_price: number | null;
  platform_fee: number | null;
  owner_earnings: number | null;
  monthly_rent: number | null;
  deposit_amount: number | null;
  initial_payment_amount: number | null;
};

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  if (![aS, aE, bS, bE].every((n) => Number.isFinite(n))) return false;
  return aS < bE && bS < aE;
}

export async function approveBookingWithOptionalDiscount(
  admin: SupabaseClient,
  actorUserId: string,
  bookingId: string,
  rawBody: unknown
): Promise<ApproveBookingResult> {
  const parsed = parseApproverDiscountBody(rawBody);
  if (!parsed.ok) {
    throw new BookingApproveError(parsed.error, 400);
  }

  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, space_id, renter_id, owner_id, booking_unit, start_at, end_at, status, payment_status, total_price, original_total_price, platform_fee, owner_earnings, monthly_rent, deposit_amount, initial_payment_amount"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !bookingRow) {
    throw new BookingApproveError("Booking not found.", 404);
  }

  const booking = bookingRow as BookingApproveRow;

  try {
    await assertCanApproveSpaceBooking(admin, actorUserId, booking.space_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden.";
    if (message === "Space not found.") {
      throw new BookingApproveError(message, 404);
    }
    throw new BookingApproveError("You are not allowed to approve this booking.", 403);
  }

  if (isPaymentSettledForReporting(booking.payment_status)) {
    throw new BookingApproveError(
      "This booking is already paid. Discounts cannot be applied after payment.",
      409
    );
  }

  const status = (booking.status || "").toLowerCase();
  if (!PENDING_STATUSES.includes(status as (typeof PENDING_STATUSES)[number])) {
    throw new BookingApproveError(
      "This booking is not waiting for approval.",
      409
    );
  }

  const { data: spaceRow, error: spaceError } = await admin
    .from("spaces")
    .select("id, status, public_listing_mode")
    .eq("id", booking.space_id)
    .maybeSingle();

  if (spaceError || !spaceRow) {
    throw new BookingApproveError("Space not found.", 404);
  }

  if (
    !isSpaceBookable({
      status: (spaceRow as { status?: string | null }).status,
      public_listing_mode: (spaceRow as { public_listing_mode?: string | null })
        .public_listing_mode,
    })
  ) {
    throw new BookingApproveError(
      "This listing is not active. Approve the listing before accepting bookings.",
      400
    );
  }

  const { data: blockingRows, error: blockingError } = await admin
    .from("bookings")
    .select("id, start_at, end_at, status")
    .eq("space_id", booking.space_id)
    .in("status", [...BLOCKING_STATUSES])
    .neq("id", booking.id);

  if (blockingError) {
    throw new BookingApproveError("Could not check booking availability.", 500);
  }

  const hasConflict = ((blockingRows || []) as Array<{ start_at: string; end_at: string }>).some(
    (existing) =>
      rangesOverlap(booking.start_at, booking.end_at, existing.start_at, existing.end_at)
  );
  if (hasConflict) {
    throw new BookingApproveError(
      "This booking overlaps with another accepted booking and cannot be approved.",
      409
    );
  }

  const originalAmount = resolveOriginalBookingAmount(booking);
  if (originalAmount < 0) {
    throw new BookingApproveError("Invalid original booking amount.", 400);
  }

  const computed = computeBookingDiscount({
    originalAmount,
    type: parsed.type,
    value: parsed.value,
  });
  if ("error" in computed) {
    throw new BookingApproveError(computed.error, 400);
  }

  const { platformFee, ownerEarnings } = feesFromFinalAmount({
    originalAmount: computed.originalAmount,
    finalAmount: computed.finalAmount,
    storedPlatformFee: booking.platform_fee,
  });

  const now = new Date().toISOString();
  const complimentary = computed.finalAmount <= 0;
  const nextStatus = complimentary ? "paid_confirmed" : "accepted_awaiting_payment";
  const nextPaymentStatus = complimentary ? "paid" : "awaiting_payment";

  const financePatch: Record<string, unknown> = {
    original_total_price: computed.originalAmount,
    total_price: computed.finalAmount,
    platform_fee: platformFee,
    owner_earnings: ownerEarnings,
    discount_type: computed.discountType,
    discount_value: computed.discountValue,
    discount_amount: computed.discountAmount > 0 ? computed.discountAmount : null,
    discount_reason:
      computed.discountAmount > 0 ? parsed.reason : null,
    discount_applied_by:
      computed.discountAmount > 0 ? actorUserId : null,
    discount_applied_at: computed.discountAmount > 0 ? now : null,
    status: nextStatus,
    payment_status: nextPaymentStatus,
    owner_response_at: now,
    owner_response_message: parsed.ownerResponseMessage,
  };

  if ((booking.booking_unit || "") === "month") {
    const split = monthlySplitAfterDiscount({
      monthlyRent: booking.monthly_rent,
      depositAmount: booking.deposit_amount,
      finalAmount: computed.finalAmount,
    });
    financePatch.monthly_rent = split.monthlyRent;
    financePatch.deposit_amount = split.depositAmount;
    financePatch.initial_payment_amount = computed.finalAmount;
  }

  if (complimentary) {
    financePatch.paid_at = now;
    financePatch.payment_reference = COMPLIMENTARY_FULL_DISCOUNT_REFERENCE;
  }

  const { data: updatedRows, error: updateError } = await admin
    .from("bookings")
    .update(financePatch)
    .eq("id", booking.id)
    .in("status", [...PENDING_STATUSES])
    .select("id, status, payment_status, total_price");

  if (updateError) {
    throw new BookingApproveError(updateError.message || "Could not approve booking.", 500);
  }

  if (!updatedRows || updatedRows.length === 0) {
    throw new BookingApproveError(
      "This booking was already processed by another approver.",
      409
    );
  }

  const { data: chargeRows } = await admin
    .from("booking_charges")
    .select("id, charge_type, amount, status")
    .eq("booking_id", booking.id);

  const patches = redistributePendingChargesToFinal(
    (chargeRows || []) as Array<{
      id: string;
      charge_type: string | null;
      amount: number | string | null;
      status: string | null;
    }>,
    computed.finalAmount
  );

  for (const patch of patches) {
    const { error: chargeError } = await admin
      .from("booking_charges")
      .update({ amount: patch.amount })
      .eq("id", patch.id)
      .eq("booking_id", booking.id)
      .eq("status", "pending");
    if (chargeError) {
      console.error("Could not update booking charge after discount:", chargeError);
    }
  }

  if (complimentary) {
    const { error: markPaidError } = await markBookingChargesPaid(
      admin,
      booking.id,
      now,
      COMPLIMENTARY_FULL_DISCOUNT_REFERENCE
    );
    if (markPaidError) {
      console.error("Could not mark complimentary charges paid:", markPaidError);
    }
  }

  const { data: competingRows } = await admin
    .from("bookings")
    .select("id, start_at, end_at, status")
    .eq("space_id", booking.space_id)
    .in("status", [...PENDING_STATUSES])
    .neq("id", booking.id);

  const competingIds = (
    (competingRows || []) as Array<{
      id: string;
      start_at: string;
      end_at: string;
    }>
  )
    .filter((row) =>
      rangesOverlap(booking.start_at, booking.end_at, row.start_at, row.end_at)
    )
    .map((row) => row.id);

  if (competingIds.length > 0) {
    const { error: declineError } = await admin
      .from("bookings")
      .update({
        status: "declined",
        payment_status: "unpaid",
        owner_response_at: now,
        owner_response_message: AUTO_DECLINE_MESSAGE,
      })
      .in("id", competingIds)
      .in("status", [...PENDING_STATUSES]);
    if (declineError) {
      console.error("Could not auto-decline overlapping requests:", declineError);
    }
  }

  await adminAudit({
    action: complimentary
      ? "booking.approve_complimentary"
      : computed.discountAmount > 0
        ? "booking.approve_with_discount"
        : "booking.approve",
    actorUserId,
    targetType: "booking",
    targetId: booking.id,
    reason: parsed.reason ?? undefined,
    meta: {
      spaceId: booking.space_id,
      originalAmount: computed.originalAmount,
      discountType: computed.discountType,
      discountValue: computed.discountValue,
      discountAmount: computed.discountAmount,
      finalAmount: computed.finalAmount,
      complimentary,
    },
  });

  return {
    bookingId: booking.id,
    status: nextStatus,
    paymentStatus: nextPaymentStatus,
    complimentary,
    originalAmount: computed.originalAmount,
    discountAmount: computed.discountAmount,
    finalAmount: roundMoney(computed.finalAmount),
    discountType: computed.discountType,
    declinedCompetingIds: competingIds,
  };
}
