"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import { shouldShowBookingRequestNotes } from "@/lib/booking-notes-visibility";
import { bookingAllowsManualMvpPayment } from "@/lib/manual-mvp-payment";

type PageProps = {
  params: Promise<{ id: string }>;
};

type BookingRow = {
  id: string;
  space_id: string;
  renter_id: string;
  owner_id: string | null;
  organisation_id?: string | null;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  notes: string | null;
  owner_response_message: string | null;
  status: string | null;
  payment_status: string | null;
  total_price: number | null;
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

export default function BookingPaymentPage({ params }: PageProps) {
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
        "id, space_id, renter_id, owner_id, organisation_id, booking_unit, start_at, end_at, notes, owner_response_message, status, payment_status, total_price, created_at"
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

  async function handlePayFastRedirect() {
    if (!booking) return;

    setPaying(true);
    setMessage("");

    try {
      // Manual MVP is never used on this page. PayFast is required for
      // organisation / NULL-owner bookings (payments.owner_id is NOT NULL)
      // and is also the supported production checkout for legacy bookings.
      void bookingAllowsManualMvpPayment(booking);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Please log in first.");
        setPaying(false);
        return;
      }

      if (booking.renter_id !== session.user.id) {
        setMessage("You can only pay for your own booking.");
        setPaying(false);
        return;
      }

      if (!canPay) {
        setMessage("This booking is not ready for payment.");
        setPaying(false);
        return;
      }

      const response = await fetch("/api/payfast/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId: booking.id }),
      });

      const raw = await response.text();
      let result: { error?: string; processUrl?: string; fields?: Record<string, string> } = {};
      try {
        result = JSON.parse(raw);
      } catch {
        result = { error: raw };
      }

      if (!response.ok || !result.processUrl || !result.fields) {
        setMessage(result.error || "Could not start payment.");
        setPaying(false);
        return;
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = result.processUrl;
      Object.entries(result.fields).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch {
      setMessage("Something went wrong while starting payment.");
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
                    <p className="mt-2 text-3xl font-semibold">
                      R{Number(booking.total_price || 0).toFixed(2)}
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      Pay securely with PayFast
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
                    onClick={handlePayFastRedirect}
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