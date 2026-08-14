import type { BookingApproveDiscountPayload } from "@/lib/booking-discount";

export type BookingApproveApiResult = {
  ok: true;
  bookingId: string;
  status: string;
  paymentStatus: string;
  complimentary: boolean;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  discountType: string | null;
  declinedCompetingIds: string[];
};

export async function postBookingApprove(params: {
  accessToken: string;
  bookingId: string;
  discount: BookingApproveDiscountPayload;
  ownerResponseMessage?: string | null;
}): Promise<BookingApproveApiResult> {
  const res = await fetch(`/api/bookings/${params.bookingId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      discountType: params.discount.discountType,
      discountValue: params.discount.discountValue,
      discountReason: params.discount.discountReason,
      ownerResponseMessage: params.ownerResponseMessage ?? null,
    }),
  });

  const data = (await res.json().catch(() => null)) as
    | (BookingApproveApiResult & { error?: string })
    | { error?: string }
    | null;

  if (!res.ok) {
    throw new Error(
      (data && "error" in data && data.error) || "Could not approve booking."
    );
  }

  return data as BookingApproveApiResult;
}
