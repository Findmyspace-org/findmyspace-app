"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import { getDisplayName } from "@/lib/utils";
import BookingAvailabilityPreview from "@/app/components/BookingAvailabilityPreview";
import {
  ownerListingBookingStatusLabel,
  renterPaymentStatusLabel,
} from "@/lib/booking-ui-labels";
import { shouldShowBookingRequestNotes } from "@/lib/booking-notes-visibility";

type Booking = {
  id: string;
  renter_id: string;
  start_at: string;
  end_at: string;
  booking_unit: string | null;
  total_price: number | null;
  status: string | null;
  payment_status: string | null;
  notes: string | null;
};

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type BlockingBooking = {
  id: string;
  start_at: string;
  end_at: string;
};

type EnrichedBooking = Booking & {
  renter?: Profile;
};

export default function OwnerBookingsPage({
  params,
}: {
  params: { id: string };
}) {
  const spaceId = params.id;

  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [blockingBookings, setBlockingBookings] = useState<BlockingBooking[]>([]);

  useEffect(() => {
    loadBookings();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please log in.");
      setLoading(false);
      return;
    }

    const { data: bookingsData, error } = await supabase
      .from("bookings")
      .select(
        "id, renter_id, start_at, end_at, booking_unit, total_price, status, payment_status, notes"
      )
      .eq("space_id", spaceId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const rawBookings = (bookingsData || []) as Booking[];

    const renterIds = Array.from(new Set(rawBookings.map((b) => b.renter_id)));

    let rentersMap = new Map<string, Profile>();

    if (renterIds.length > 0) {
      const { data: rentersData, error: rentersError } = await (supabase
        .from("profiles") as any)
        .select("id, first_name, last_name, email")
        .in("id", renterIds);

      if (rentersError) {
        setMessage(rentersError.message);
        setLoading(false);
        return;
      }

      rentersMap = new Map(
        ((rentersData || []) as Profile[]).map((r) => [r.id, r])
      );
    }

    const enriched = rawBookings.map((booking) => ({
      ...booking,
      renter: rentersMap.get(booking.renter_id),
    }));

    setBookings(enriched);

    const { data: blockingData, error: blockingError } = await supabase
      .from("bookings")
      .select("id, start_at, end_at")
      .eq("space_id", spaceId)
      .in("status", [
        "approved",
        "accepted_awaiting_payment",
        "paid_confirmed",
        "completed",
      ]);

    if (blockingError) {
      setMessage(blockingError.message);
      setLoading(false);
      return;
    }

    setBlockingBookings((blockingData || []) as BlockingBooking[]);
    setLoading(false);
  }

  function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
    return startA < endB && endA > startB;
  }

  function formatRange(b: Booking) {
    const start = new Date(b.start_at);
    const end = new Date(b.end_at);

    if (b.booking_unit === "hour") {
      return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })} - ${end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    if (b.booking_unit === "month") {
      return `${start.toLocaleDateString([], {
        month: "long",
        year: "numeric",
      })} - ${end.toLocaleDateString([], {
        month: "long",
        year: "numeric",
      })}`;
    }

    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  function getStatusBadge(status: string | null) {
    if (status === "accepted_awaiting_payment") {
      return "bg-blue-100 text-blue-800";
    }

    if (status === "paid_confirmed" || status === "completed") {
      return "bg-green-100 text-green-800";
    }

    if (status === "declined") {
      return "bg-red-100 text-red-800";
    }

    if (status === "expired") {
      return "bg-amber-100 text-amber-900";
    }

    return "bg-yellow-100 text-yellow-800";
  }

  const pendingCount = useMemo(
    () =>
      bookings.filter(
        (b) => (b.status || "pending_owner") === "pending_owner" || b.status === "pending"
      ).length,
    [bookings]
  );

  async function approveBooking(id: string) {
    setProcessingId(id);
    setMessage("");

    const booking = bookings.find((b) => b.id === id);

    if (!booking) {
      setMessage("Booking not found.");
      setProcessingId(null);
      return;
    }

    const hasConflict = blockingBookings
      .filter((b) => b.id !== id)
      .some((b) =>
        overlaps(
          new Date(booking.start_at),
          new Date(booking.end_at),
          new Date(b.start_at),
          new Date(b.end_at)
        )
      );

    if (hasConflict) {
      setMessage("This booking overlaps with an existing accepted booking.");
      setProcessingId(null);
      return;
    }

    const { error } = await (supabase.from("bookings") as any)
      .update({
        status: "accepted_awaiting_payment",
        payment_status: "awaiting_payment",
        owner_response_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      setMessage(error.message);
      setProcessingId(null);
      return;
    }

    await loadBookings();
    setProcessingId(null);
  }

  async function declineBooking(id: string) {
    setProcessingId(id);
    setMessage("");

    const { error } = await (supabase.from("bookings") as any)
      .update({
        status: "declined",
        payment_status: "unpaid",
      })
      .eq("id", id);

    if (error) {
      setMessage(error.message);
      setProcessingId(null);
      return;
    }

    await loadBookings();
    setProcessingId(null);
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold">Booking requests</h1>
            <p className="text-sm text-gray-600">
              Review requests for this listing and see availability before approving.
            </p>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
              {bookings.length} request{bookings.length === 1 ? "" : "s"}
            </div>
            <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
              {pendingCount} awaiting response
            </div>
          </div>

          {message && (
            <div className="mb-4 rounded-md bg-gray-100 p-3 text-sm text-gray-800">
              {message}
            </div>
          )}

          {loading ? (
            <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
              Loading booking requests...
            </div>
          ) : bookings.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
              No booking requests yet.
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((b) => {
                const previewBlocking = blockingBookings.filter(
                  (existing) => existing.id !== b.id
                );

                return (
                  <div
                    key={b.id}
                    className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-base font-semibold">
                          {getDisplayName(b.renter)}
                        </p>
                        <p className="text-xs text-gray-600">
                          {b.renter?.email || "No email"}
                        </p>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusBadge(
                          b.status
                        )}`}
                      >
                        {ownerListingBookingStatusLabel(b.status)}
                      </span>
                    </div>

                    <div
                      className={`grid gap-4 ${
                        shouldShowBookingRequestNotes(b.status, b.payment_status) &&
                        (b.notes || "").trim() !== ""
                          ? "md:grid-cols-2"
                          : ""
                      }`}
                    >
                      <div className="space-y-1.5 text-xs">
                        <p>
                          <span className="font-medium">Booking type:</span>{" "}
                          {b.booking_unit || "day"}
                        </p>
                        <p>
                          <span className="font-medium">Requested period:</span>{" "}
                          {formatRange(b)}
                        </p>
                        <p>
                          <span className="font-medium">Total:</span> R
                          {Number(b.total_price || 0).toFixed(2)}
                        </p>
                        <p>
                          <span className="font-medium">Payment:</span>{" "}
                          {renterPaymentStatusLabel(b.payment_status)}
                        </p>
                      </div>

                      {shouldShowBookingRequestNotes(b.status, b.payment_status) &&
                        (b.notes || "").trim() !== "" && (
                          <div>
                            <p className="mb-2 text-xs font-medium">Message</p>
                            <div className="min-h-[88px] rounded-md bg-gray-50 p-3 text-xs text-gray-700">
                              {b.notes}
                            </div>
                          </div>
                        )}
                    </div>

                    <div className="mt-4">
                      <BookingAvailabilityPreview
                        bookingUnit={b.booking_unit}
                        requestedStart={b.start_at}
                        requestedEnd={b.end_at}
                        existingBookings={previewBlocking}
                      />
                    </div>

                    {(b.status === "pending_owner" || b.status === "pending" || !b.status) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => approveBooking(b.id)}
                          disabled={processingId === b.id}
                          className="rounded-md bg-[#192a3a] px-3 py-1.5 text-xs text-white disabled:opacity-50"
                        >
                          {processingId === b.id ? "Processing..." : "Approve & request payment"}
                        </button>

                        <button
                          onClick={() => declineBooking(b.id)}
                          disabled={processingId === b.id}
                          className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}