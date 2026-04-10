"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import { getDisplayName } from "@/lib/utils";
import {
  MapPin,
  User,
  CalendarDays,
  Wallet,
  CreditCard,
  Eye,
  FileText,
  MessageSquare,
  Send,
} from "lucide-react";

type Booking = {
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
  created_at: string | null;
};

type Space = {
  id: string;
  title: string;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
};

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type EnrichedBooking = Booking & {
  space?: Space;
  owner?: Profile;
};

type BookingMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string | null;
};

export default function MyBookingsPage() {
  const searchParams = useSearchParams();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
  const [paymentModalBookingId, setPaymentModalBookingId] = useState<string | null>(null);
  const [successModalBookingId, setSuccessModalBookingId] = useState<string | null>(null);
  const [messagesByBooking, setMessagesByBooking] = useState<Record<string, BookingMessage[]>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [sendingMessageBookingId, setSendingMessageBookingId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  useEffect(() => {
    loadMyBookings();
  }, []);

  useEffect(() => {
    if (searchParams.get("payment") === "success") {
      const bookingId = searchParams.get("bookingId");
      setMessage("Payment received. Your booking is confirmed.");
      if (bookingId) {
        setSuccessModalBookingId(bookingId);
      }
    }
  }, [searchParams]);

  async function loadMyBookings() {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Please log in first.");
        setLoading(false);
        return;
      }

      setSessionEmail(user.email ?? null);
      setSessionUserId(user.id);

      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, space_id, renter_id, owner_id, booking_unit, start_at, end_at, notes, owner_response_message, status, payment_status, total_price, created_at"
        )
        .eq("renter_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const rawBookings = (data || []) as Booking[];

      const spaceIds = Array.from(new Set(rawBookings.map((b) => b.space_id)));
      const ownerIds = Array.from(new Set(rawBookings.map((b) => b.owner_id)));

      let spacesMap = new Map<string, Space>();
      let ownersMap = new Map<string, Profile>();

      if (spaceIds.length > 0) {
        const { data: spacesData } = await supabase
          .from("spaces")
          .select("id, title, city, suburb, address_line_1")
          .in("id", spaceIds);

        spacesMap = new Map(
          ((spacesData || []) as Space[]).map((s) => [s.id, s])
        );
      }

      if (ownerIds.length > 0) {
        const { data: ownersData } = await (supabase
          .from("profiles") as any)
          .select("id, first_name, last_name, email")
          .in("id", ownerIds);

        ownersMap = new Map(
          ((ownersData || []) as Profile[]).map((p) => [p.id, p])
        );
      }

      const enriched = rawBookings.map((b) => ({
        ...b,
        space: spacesMap.get(b.space_id),
        owner: ownersMap.get(b.owner_id),
      }));

      setBookings(enriched);
      await loadMessagesForBookings(enriched);
      setLoading(false);
    } catch {
      setMessage("Something went wrong while loading your bookings.");
      setLoading(false);
    }
  }

  function canUseMessaging(booking: Booking) {
    return (
      booking.payment_status === "paid" ||
      booking.payment_status === "paid_confirmed" ||
      booking.status === "paid_confirmed" ||
      booking.status === "confirmed"
    );
  }

  function canCancelBooking(booking: Booking) {
    return (
      booking.status === "pending_owner" ||
      booking.status === "accepted_awaiting_payment"
    );
  }

  async function loadMessagesForBookings(bookingsToLoad: EnrichedBooking[]) {
    const eligibleBookingIds = bookingsToLoad
      .filter((booking) => canUseMessaging(booking))
      .map((booking) => booking.id);

    if (eligibleBookingIds.length === 0) {
      setMessagesByBooking({});
      return;
    }

    const { data, error } = await (supabase.from("booking_messages") as any)
      .select("id, booking_id, sender_id, recipient_id, message, created_at")
      .in("booking_id", eligibleBookingIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load booking messages:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        raw: error,
      });
      return;
    }

    const grouped = ((data || []) as BookingMessage[]).reduce(
      (acc, item) => {
        if (!acc[item.booking_id]) acc[item.booking_id] = [];
        acc[item.booking_id].push(item);
        return acc;
      },
      {} as Record<string, BookingMessage[]>
    );

    setMessagesByBooking(grouped);
  }

  async function sendBookingMessage(booking: EnrichedBooking) {
    if (!sessionUserId) {
      setMessage("Please log in first.");
      return;
    }

    const draft = (messageDrafts[booking.id] || "").trim();

    if (!draft) {
      setMessage("Please type a message first.");
      return;
    }

    if (!canUseMessaging(booking)) {
      setMessage("Messaging becomes available after payment is confirmed.");
      return;
    }

    setSendingMessageBookingId(booking.id);
    setMessage("");

    const payload = {
      booking_id: booking.id,
      sender_id: sessionUserId,
      recipient_id: booking.owner_id,
      message: draft,
    };

    const { data, error } = await (supabase.from("booking_messages") as any)
      .insert(payload)
      .select("id, booking_id, sender_id, recipient_id, message, created_at")
      .single();

    if (error) {
      setMessage(error.message || "Could not send message.");
      setSendingMessageBookingId(null);
      return;
    }

    const newMessage = data as BookingMessage;

    setMessagesByBooking((current) => ({
      ...current,
      [booking.id]: [...(current[booking.id] || []), newMessage],
    }));

    try {
      await fetch("/api/notifications/booking-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: booking.id,
          eventType: "booking_message",
          senderId: sessionUserId,
          recipientId: booking.owner_id,
          message: draft,
        }),
      });
    } catch (notificationError) {
      console.error(
        "Failed to fire booking message notification:",
        notificationError
      );
    }

    setMessageDrafts((current) => ({
      ...current,
      [booking.id]: "",
    }));

    setSendingMessageBookingId(null);
  }

  async function handleCancelBooking(booking: EnrichedBooking) {
    if (!sessionUserId) {
      setMessage("Please log in first.");
      return;
    }

    setMessage("");
    setCancellingBookingId(booking.id);

    const cancelMessage =
      "The renter has cancelled this booking request. Thank you for your interest and understanding.";

    const { error: bookingError } = await (supabase.from("bookings") as any)
      .update({
        status: "declined",
        payment_status: "unpaid",
      })
      .eq("id", booking.id);

    if (bookingError) {
      setMessage(bookingError.message || "Could not cancel booking.");
      setCancellingBookingId(null);
      return;
    }

    const { data: insertedMessage, error: messageError } = await (supabase.from("booking_messages") as any)
      .insert({
        booking_id: booking.id,
        sender_id: sessionUserId,
        recipient_id: booking.owner_id,
        message: cancelMessage,
      })
      .select("id, booking_id, sender_id, recipient_id, message, created_at")
      .single();

    if (!messageError && insertedMessage) {
      const typedMessage = insertedMessage as BookingMessage;
      setMessagesByBooking((current) => ({
        ...current,
        [booking.id]: [...(current[booking.id] || []), typedMessage],
      }));
    }

    try {
      await fetch("/api/notifications/booking-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: booking.id,
          eventType: "booking_message",
          senderId: sessionUserId,
          recipientId: booking.owner_id,
          message: cancelMessage,
        }),
      });
    } catch (notificationError) {
      console.error("Failed to send cancellation notification:", notificationError);
    }

    setBookings((current) =>
      current.map((item) =>
        item.id === booking.id
          ? {
              ...item,
              status: "declined",
              payment_status: "unpaid",
            }
          : item
      )
    );

    setMessage("Booking cancelled. The owner has been notified.");
    setCancellingBookingId(null);
  }

  async function handlePayFastRedirect(booking: EnrichedBooking) {
    setMessage("");
    setPayingBookingId(booking.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Please log in first.");
        setPayingBookingId(null);
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

      let result: any = {};
      try {
        result = JSON.parse(raw);
      } catch {
        result = { error: raw };
      }

      if (!response.ok) {
        setMessage(result.error || "Could not start payment.");
        setPayingBookingId(null);
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

      setPaymentModalBookingId(null);
      document.body.appendChild(form);
      form.submit();
    } catch (error: any) {
      setMessage(error?.message || "Something went wrong while starting payment.");
      setPayingBookingId(null);
    }
  }

  function formatBookingRange(booking: Booking) {
    if (!booking.start_at || !booking.end_at) return "Dates not set";

    const start = new Date(booking.start_at);
    const end = new Date(booking.end_at);

    if (booking.booking_unit === "hour") {
      return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })} - ${end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    if (booking.booking_unit === "month") {
      const displayEnd = new Date(end);
      displayEnd.setMonth(displayEnd.getMonth() - 1);

      return `${start.toLocaleDateString([], {
        year: "numeric",
        month: "long",
      })} - ${displayEnd.toLocaleDateString([], {
        year: "numeric",
        month: "long",
      })}`;
    }

    const displayEnd = new Date(end);
    displayEnd.setDate(displayEnd.getDate() - 1);

    return `${start.toLocaleDateString()} - ${displayEnd.toLocaleDateString()}`;
  }

  function getStatusBadgeClass(status: string | null) {
    if (status === "paid_confirmed") return "bg-green-100 text-green-800";
    if (status === "accepted_awaiting_payment") {
      return "bg-blue-100 text-blue-800";
    }
    if (status === "declined") return "bg-red-100 text-red-800";
    return "bg-yellow-100 text-yellow-800";
  }

  function getDisplayStatus(status: string | null) {
    if (status === "pending_owner") return "Pending owner approval";
    if (status === "accepted_awaiting_payment") return "Awaiting payment";
    if (status === "paid_confirmed") return "Confirmed";
    if (status === "declined") return "Declined";
    return status || "pending";
  }

  const counts = useMemo(() => {
    return {
      all: bookings.length,
      pending: bookings.filter((b) => b.status === "pending_owner").length,
      awaiting_payment: bookings.filter(
        (b) => b.status === "accepted_awaiting_payment"
      ).length,
      paid: bookings.filter((b) => b.status === "paid_confirmed").length,
      declined: bookings.filter((b) => b.status === "declined").length,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    if (statusFilter === "all") return bookings;

    if (statusFilter === "pending") {
      return bookings.filter((b) => b.status === "pending_owner");
    }

    if (statusFilter === "awaiting_payment") {
      return bookings.filter((b) => b.status === "accepted_awaiting_payment");
    }

    if (statusFilter === "paid") {
      return bookings.filter((b) => b.status === "paid_confirmed");
    }

    if (statusFilter === "declined") {
      return bookings.filter((b) => b.status === "declined");
    }

    return bookings;
  }, [bookings, statusFilter]);

  const paymentModalBooking = useMemo(
    () => bookings.find((booking) => booking.id === paymentModalBookingId) || null,
    [bookings, paymentModalBookingId]
  );

  const successModalBooking = useMemo(
    () => bookings.find((booking) => booking.id === successModalBookingId) || null,
    [bookings, successModalBookingId]
  );

  return (
    <RequireAuth>
      <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="mb-1 text-3xl font-semibold">My bookings</h1>
            <p className="text-sm text-gray-600">
              Track the booking requests you have sent to space owners.
            </p>
            {sessionEmail && (
              <p className="mt-2 text-sm text-gray-500">
                Logged in as {sessionEmail}
              </p>
            )}
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {[
              { key: "all", label: "All", count: counts.all },
              { key: "pending", label: "Pending", count: counts.pending },
              {
                key: "awaiting_payment",
                label: "Awaiting payment",
                count: counts.awaiting_payment,
              },
              { key: "paid", label: "Paid", count: counts.paid },
              { key: "declined", label: "Declined", count: counts.declined },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(item.key)}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${statusFilter === item.key
                  ? "border-[#192a3a] bg-[#192a3a] text-white"
                  : "border-gray-300 bg-white text-[#192a3a]"
                  }`}
              >
                <span>{item.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusFilter === item.key
                    ? "bg-white text-[#192a3a]"
                    : "bg-gray-200 text-gray-700"
                    }`}
                >
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          {message && (
            <div
              className={`mb-6 rounded-md border p-3 text-sm ${message.toLowerCase().includes("payment received") ||
                message.toLowerCase().includes("confirmed")
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-gray-200 bg-gray-50 text-gray-800"
                }`}
            >
              {message}
            </div>
          )}

          {loading ? (
            <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
              Loading bookings...
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
              No bookings found.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {booking.space?.title || "Untitled space"}
                      </h2>
                      <div className="mt-1 flex items-start gap-2 text-sm text-gray-500">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <p>
                          {[
                            booking.space?.address_line_1,
                            booking.space?.suburb,
                            booking.space?.city,
                          ]
                            .filter(Boolean)
                            .join(", ") || "Address not set"}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                        booking.status
                      )}`}
                    >
                      {getDisplayStatus(booking.status)}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2 text-sm text-gray-700">
                      <div className="flex items-start gap-2">
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                        <p>
                          <span className="font-medium text-[#192a3a]">Owner:</span>{" "}
                          {getDisplayName(booking.owner)}
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                        <p>
                          <span className="font-medium text-[#192a3a]">Type:</span>{" "}
                          {booking.booking_unit || "day"}
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                        <p>
                          <span className="font-medium text-[#192a3a]">Period:</span>{" "}
                          {formatBookingRange(booking)}
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                        <p>
                          <span className="font-medium text-[#192a3a]">Total:</span>{" "}
                          R{Number(booking.total_price || 0).toFixed(2)}
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                        <p>
                          <span className="font-medium text-[#192a3a]">Payment:</span>{" "}
                          {booking.payment_status || "unpaid"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="mb-2 text-sm font-medium text-[#192a3a]">Your message</p>
                        <div className="min-h-[72px] rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                          {booking.notes || "No message added."}
                        </div>
                      </div>

                      {booking.owner_response_message && (
                        <div>
                          <p className="mb-2 text-sm font-medium text-[#192a3a]">Owner reply</p>
                          <div className="min-h-[56px] rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                            {booking.owner_response_message}
                          </div>
                        </div>
                      )}

                      {canUseMessaging(booking) && (
                        <div>
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#192a3a]">
                            <MessageSquare className="h-4 w-4" />
                            Messages with owner
                          </div>

                          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3">
                            {(messagesByBooking[booking.id] || []).length === 0 ? (
                              <p className="text-sm text-gray-500">
                                No messages yet. You can now coordinate directly with the owner.
                              </p>
                            ) : (
                              (messagesByBooking[booking.id] || []).map((item) => {
                                const isMine = item.sender_id === sessionUserId;

                                return (
                                  <div
                                    key={item.id}
                                    className={`max-w-[88%] rounded-md px-3 py-2 text-sm ${isMine
                                      ? "ml-auto bg-[#192a3a] text-white"
                                      : "mr-auto bg-white text-[#192a3a] border border-gray-200"
                                      }`}
                                  >
                                    <p className="whitespace-pre-wrap">{item.message}</p>
                                    <p
                                      className={`mt-1 text-[11px] ${isMine ? "text-gray-200" : "text-gray-500"
                                        }`}
                                    >
                                      {item.created_at
                                        ? new Date(item.created_at).toLocaleString()
                                        : ""}
                                    </p>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          <div className="mt-3 flex flex-col gap-2">
                            <textarea
                              value={messageDrafts[booking.id] || ""}
                              onChange={(e) =>
                                setMessageDrafts((current) => ({
                                  ...current,
                                  [booking.id]: e.target.value,
                                }))
                              }
                              rows={3}
                              placeholder="Send a message to the owner"
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] outline-none focus:border-[#192a3a]"
                            />
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => void sendBookingMessage(booking)}
                                disabled={sendingMessageBookingId === booking.id}
                                className="flex items-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                              >
                                <Send className="h-4 w-4" />
                                {sendingMessageBookingId === booking.id ? "Sending..." : "Send message"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/spaces/${booking.space_id}`}
                      className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-gray-50"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Link>

                    {(booking.payment_status === "paid" ||
                      booking.payment_status === "paid_confirmed" ||
                      booking.status === "paid_confirmed") && (
                        <button
                          type="button"
                          onClick={() => window.open(`/api/invoice/${booking.id}`, "_blank")}
                          className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-gray-50"
                        >
                          <FileText className="h-4 w-4" />
                          Invoice
                        </button>
                      )}

                    {booking.status === "accepted_awaiting_payment" &&
                      (booking.payment_status || "unpaid") === "awaiting_payment" && (
                        <button
                          type="button"
                          onClick={() => setPaymentModalBookingId(booking.id)}
                          disabled={payingBookingId === booking.id}
                          className="flex items-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                        >
                          <CreditCard className="h-4 w-4" />
                          {payingBookingId === booking.id ? "Redirecting..." : "Pay now"}
                        </button>
                      )}
                    {canCancelBooking(booking) && (
                      <button
                        type="button"
                        onClick={() => void handleCancelBooking(booking)}
                        disabled={cancellingBookingId === booking.id || payingBookingId === booking.id}
                        className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        {cancellingBookingId === booking.id ? "Cancelling..." : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {paymentModalBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="mb-2 text-xl font-semibold text-[#192a3a]">
                Complete payment
              </h2>

              <p className="mb-4 text-sm text-gray-600">
                You are about to pay for{" "}
                <span className="font-medium text-[#192a3a]">
                  {paymentModalBooking.space?.title || "this booking"}
                </span>
                .
              </p>

              <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <p className="mb-2">
                  <span className="font-medium text-[#192a3a]">Booking period:</span>{" "}
                  {formatBookingRange(paymentModalBooking)}
                </p>
                <p>
                  <span className="font-medium text-[#192a3a]">Total:</span>{" "}
                  R{Number(paymentModalBooking.total_price || 0).toFixed(2)}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void handlePayFastRedirect(paymentModalBooking)}
                  disabled={payingBookingId === paymentModalBooking.id}
                  className="rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {payingBookingId === paymentModalBooking.id ? "Processing..." : "Pay now"}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentModalBookingId(null)}
                  disabled={payingBookingId === paymentModalBooking.id}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-[#192a3a] hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {successModalBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
              <h2 className="mb-2 text-xl font-semibold text-green-700">
                Payment received
              </h2>

              <p className="mb-2 text-sm text-gray-700">
                Your booking is now confirmed.
              </p>

              <p className="mb-6 text-sm text-gray-500">
                {successModalBooking.space?.title || "This booking"} has been successfully paid and confirmed.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSuccessModalBookingId(null);
                  window.location.href = "/dashboard/my-bookings";
                }}
                className="w-full rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Go to My Bookings
              </button>
            </div>
          </div>
        )}
      </main>
    </RequireAuth>
  );
}