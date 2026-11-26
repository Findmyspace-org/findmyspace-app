import { NextRequest, NextResponse } from "next/server";
import { getBookingRequirementAccess } from "@/lib/booking-requirement-access";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;
  const { bookingId } = await params;
  const access = await getBookingRequirementAccess(auth.admin, auth.userId, bookingId);
  if (!access) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { data: booking } = await auth.admin
    .from("bookings")
    .select("total_price, original_requested_total")
    .eq("id", bookingId)
    .maybeSingle();
  const { data: discount, error } = await auth.admin
    .from("booking_discounts")
    .select("discount_type, discount_value, discount_amount, original_rental, approved_rental, platform_fee, host_payout, reason, created_at")
    .eq("booking_id", bookingId)
    .is("removed_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ discount: null });

  const row = discount as {
    discount_type: string;
    discount_value: number;
    discount_amount: number;
    original_rental: number;
    approved_rental: number;
    platform_fee: number | null;
    host_payout: number | null;
    reason: string | null;
    created_at: string;
  } | null;
  if (!row) return NextResponse.json({ discount: null });

  const manager = access !== "renter";
  return NextResponse.json({
    discount: {
      originalAmount: row.original_rental,
      discountAmount: row.discount_amount,
      payableAmount: (booking as { total_price?: number | null } | null)?.total_price ?? row.approved_rental,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      reason: manager ? row.reason : null,
      platformFee: manager ? row.platform_fee : null,
      hostPayout: manager ? row.host_payout : null,
      createdAt: manager ? row.created_at : null,
    },
  });
}
