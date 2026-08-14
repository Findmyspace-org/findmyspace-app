"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import { shouldShowBookingRequestNotes } from "@/lib/booking-notes-visibility";
import { isSpaceBookable } from "@/lib/listing-lifecycle";
import BookingPriceBreakdown from "@/app/components/BookingPriceBreakdown";
import { bookingHasVisibleDiscount } from "@/lib/booking-discount";

type PageProps = {
  params: Promise<{ id: string }>;
};

type BookingRow = {
  id: string;
  space_id: string;
  renter_id: string;
  owner_id: string;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  notes: string | null;
  owner_response_message: string | null;
  status: string | null;
  payment_status: string | null;
  total_price: number | null;
  original_total_price?: number | null;
  discount_amount?: number | null;
  created_at: string | null;
};

type SpaceRow = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  status: string | null;
};

type PaymentInsertRow = {
  booking_id: string;
  payer_id: string;
  owner_id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  payment_method: string;
  paid_at: string;
};

export default function BookingPaymentPage({ params }: PageProps) {
  const router = useRouter();
  const [bookingId, setBookingId] = useState("");
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [space, setSpace] = useState<SpaceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function resolveAndLoad() {
      const { id } = await params;
      setBookingId(id);
      await loadBooking(id);
    }

    resolveAndLoad();
  }, [params]);

  async function loadBooking(id: string) {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please log in first.");
      setLoading(false);
      return;
    }

    const { data: rawBooking, error: bookingError } = await (supabase
      .from("bookings") as any)
      .select(
        "id, space_id, renter_id, owner_id, booking_unit, start_at, end_at, notes, owner_response_message, status, payment_status, total_price, original_total_price, discount_amount, created_at"
      )
      .eq("id", id)
      .eq("renter_id", user.id)
      .single();

    const bookingData = rawBooking as BookingRow | null;

    if (bookingError || !bookingData) {
      setMessage(bookingError?.message || "Booking not found.");
      setLoading(false);
      return;
    }

    setBooking(bookingData);

    const { data: rawSpace, error: spaceError } = await supabase
      .from("spaces")
      .select("id, title, city, suburb, address_line_1, status")
      .eq("id", bookingData.space_id)
      .single();

    const spaceData = rawSpace as SpaceRow | null;

    if (spaceError) {
      setMessage(spaceError.message);
      setLoading(false);
      return;
    }

    setSpace(spaceData);
    setLoading(false);
  }

  function formatBookingRange() {
    if (!booking?.start_at || !booking?.end_at) return "Dates not set";

    if (booking.booking_unit === "hour") {
      const start = new Date(booking.start_at);
      const end = new Date(booking.end_at);

      return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })} - ${end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    if (booking.booking_unit === "month") {
      const start = new Date(booking.start_at);
      const end = new Date(booking.end_at);

      return `${start.toLocaleDateString([], {
        year: "numeric",
        month: "long",
      })} - ${end.toLocaleDateString([], {
        year: "numeric",
        month: "long",
      })}`;
    }

    const start = new Date(booking.start_at);
    const end = new Date(booking.end_at);

    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  const canPay = useMemo(() => {
    return (
      booking?.status === "accepted_awaiting_payment" &&
      (booking.payment_status || "unpaid") === "awaiting_payment"
    );
  }, [booking]);

  async function handleMockPayment() {
    if (!booking) return;

    setPaying(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Please log in first.");
        setPaying(false);
        return;
      }

      if (booking.renter_id !== user.id) {
        setMessage("You can only pay for your own booking.");
        setPaying(false);
        return;
      }

      if (!canPay) {
        setMessage("This booking is not ready for payment.");
        setPaying(false);
        return;
      }

      const { data: liveSpace } = await supabase
        .from("spaces")
        .select("status, public_listing_mode")
        .eq("id", booking.space_id)
        .maybeSingle();

      if (
        !isSpaceBookable(
          (liveSpace as {
            status: string | null;
            public_listing_mode: string | null;
          } | null) ?? null
        )
      ) {
        setMessage("Payment is not available because this listing is no longer active.");
        setPaying(false);
        return;
      }

      const paymentRow: PaymentInsertRow = {
        booking_id: booking.id,
        payer_id: user.id,
        owner_id: booking.owner_id,
        amount: Number(booking.total_price || 0),
        currency: "ZAR",
        provider: "manual_mvp",
        status: "paid",
        payment_method: "manual_test",
        paid_at: new Date().toISOString(),
      };

      const { error: paymentError } = await (supabase.from("payments") as any).insert(
        paymentRow
      );

      if (paymentError) {
        setMessage(paymentError.message);
        setPaying(false);
        return;
      }

      const { error: bookingUpdateError } = await (supabase
        .from("bookings") as any)
        .update({
          status: "paid_confirmed",
          payment_status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      if (bookingUpdateError) {
        setMessage(bookingUpdateError.message);
        setPaying(false);
        return;
      }

      const {
        data: { session: syncSession },
      } = await supabase.auth.getSession();
      if (syncSession?.access_token) {
        try {
          await fetch("/api/booking-charges/sync-paid", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${syncSession.access_token}`,
            },
            body: JSON.stringify({ bookingId: booking.id }),
          });
        } catch (syncErr) {
          console.error("sync-paid failed:", syncErr);
        }
      }

      const notificationResponse = await fetch("/api/notifications/booking-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: booking.id,
          eventType: "payment_confirmed",
        }),
      });

      if (!notificationResponse.ok) {
        const errorPayload = await notificationResponse.json().catch(() => null);
        setMessage(
          errorPayload?.error ||
            "Payment was recorded, but confirmation notifications could not be sent."
        );
      }

      setBooking((current) =>
        current
          ? {
              ...current,
              status: "paid_confirmed",
              payment_status: "paid",
            }
          : current
      );

      setMessage("Payment recorded successfully. Your booking is now confirmed.");
      setPaying(false);
      router.push("/dashboard/my-bookings?payment=success");
      router.refresh();
      return;
    } catch {
      setMessage("Something went wrong while processing payment.");
      setPaying(false);
    }
  }

  function getDisplayStatus() {
    if (!booking) return "Unknown";

    if (booking.status === "expired") {
      return "expired — payment window closed";
    }

    if (
      booking.status === "accepted_awaiting_payment" &&
      booking.payment_status === "awaiting_payment"
    ) {
      return "approved - awaiting payment";
    }

    if (booking.status === "paid_confirmed" && booking.payment_status === "paid") {
      return "confirmed - paid";
    }

    return booking.status || "pending";
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold">Pay for booking</h1>
            <p className="text-gray-600">
              Complete payment to confirm your booking.
            </p>
          </div>

          {message && (
            <div className="mb-6 rounded-lg bg-gray-100 p-3 text-sm text-gray-800">
              {message}
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-gray-300 p-6 text-sm text-gray-600 shadow-sm">
              Loading booking...
            </div>
          ) : !booking ? (
            <div className="rounded-2xl border border-gray-300 p-6 text-sm text-gray-600 shadow-sm">
              Booking not found.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-300 p-6 shadow-sm">
                <h2 className="text-2xl font-semibold">
                  {space?.title || "Booking"}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {[space?.address_line_1, space?.suburb, space?.city]
                    .filter(Boolean)
                    .join(", ") || "Address not set"}
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <p>
                      <b>Booking type:</b> {booking.booking_unit || "day"}
                    </p>
                    <p>
                      <b>Requested period:</b> {formatBookingRange()}
                    </p>
                    <p>
                      <b>Status:</b> {getDisplayStatus()}
                    </p>
                    <p>
                      <b>Payment:</b> {booking.payment_status || "unpaid"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Amount due</p>
                    {bookingHasVisibleDiscount(booking.discount_amount) ? (
                      <div className="mt-2">
                        <BookingPriceBreakdown
                          originalAmount={booking.original_total_price}
                          discountAmount={booking.discount_amount}
                          finalAmount={booking.total_price}
                          size="md"
                        />
                      </div>
                    ) : (
                      <p className="mt-2 text-3xl font-semibold">
                        R{Number(booking.total_price || 0).toFixed(2)}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-gray-600">
                      MVP payment test flow
                    </p>
                  </div>
                </div>

                {((shouldShowBookingRequestNotes(booking.status, booking.payment_status) &&
                  (booking.notes || "").trim() !== "") ||
                  booking.owner_response_message) && (
                  <div className="mt-6 space-y-3">
                    {shouldShowBookingRequestNotes(booking.status, booking.payment_status) &&
                      (booking.notes || "").trim() !== "" && (
                        <div>
                          <p className="mb-2 text-sm font-medium">Your message</p>
                          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                            {booking.notes}
                          </div>
                        </div>
                      )}

                    {booking.owner_response_message && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-[#192a3a]">Owner reply</p>
                        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
                          {booking.owner_response_message}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {booking.status === "expired" && (
                  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    This booking expired because payment was not completed within 24 hours. Please
                    submit a new booking request if you still need the space.
                  </div>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/dashboard/my-bookings"
                    className="rounded-lg border px-4 py-2 text-sm"
                  >
                    Back to my bookings
                  </Link>

                  <button
                    type="button"
                    onClick={handleMockPayment}
                    disabled={!canPay || paying}
                    className={`rounded-lg px-4 py-2 text-sm ${
                      canPay
                        ? "bg-black text-white"
                        : "cursor-not-allowed bg-gray-200 text-gray-500"
                    }`}
                  >
                    {paying ? "Processing..." : "Pay now"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}