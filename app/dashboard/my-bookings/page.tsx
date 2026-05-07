"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { RENTER_NAV } from "@/lib/dashboard-nav";
import DecisionSuggestion from "@/app/components/DecisionSuggestion";
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
  X,
  Download,
  ChevronDown,
  ChevronUp,
  Tag,
  CalendarClock,
  BookmarkCheck,
  CircleDollarSign,
  Mail,
  Phone,
} from "lucide-react";
import { downloadInvoicePdf } from "@/lib/invoice-download-client";
import { isCommunicationAllowed } from "@/lib/booking-communication";
import { renterPaymentStatusLabel } from "@/lib/booking-ui-labels";
import { resolveRenterMyBookingsUi } from "@/lib/renter-my-bookings-status";
import { shouldShowBookingRequestNotes } from "@/lib/booking-notes-visibility";
import { broadcastInboxRefresh } from "@/lib/inbox-refresh";
import BookingRequestDetailsPanel from "@/app/components/BookingRequestDetailsPanel";
import {
  aggregateRenterPageMetrics,
  computeRenterBookingFinance,
  formatPageNextPaymentSummary,
  formatRenterNextPaymentSummary,
  formatZarCompact,
  type BookingChargeLite,
} from "@/lib/renter-booking-finance";
import {
  FOCUS_HIGHLIGHT_CLASS,
  useFocusHighlight,
} from "@/lib/use-focus-highlight";

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
  monthly_rent?: number | null;
  months_total?: number | null;
  months_paid?: number | null;
  deposit_amount?: number | null;
  initial_payment_amount?: number | null;
  next_payment_date?: string | null;
};

type Space = {
  id: string;
  title: string;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  cover_image_url?: string | null;
};

type SpaceImageRow = {
  space_id: string;
  image_url: string;
  sort_order: number | null;
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
  requestDetails?: Record<string, unknown> | null;
};

function bookingDetailHref(bookingId: string) {
  return `/dashboard/my-bookings/${bookingId}/pay`;
}

function rebookListingHref(spaceId: string) {
  return `/spaces/${spaceId}?book=1`;
}

type BookingCardPrimaryActionProps = {
  booking: EnrichedBooking;
  payingBookingId: string | null;
  onPayClick: (e: React.MouseEvent) => void;
  /** When true, primary control does not stretch full width (pairs with chevron in a tight group). */
  pairWithChevron?: boolean;
};

function applyPairedPrimaryLayout(className: string, paired: boolean) {
  if (!paired) return className;
  return className
    .replace(/\bw-full\b/g, "w-auto")
    .concat(" min-w-[8.75rem] max-w-full");
}

/** Primary CTA: full width on mobile, fixed min width on md+ */
const primaryBtnClass =
  "inline-flex w-full min-h-[40px] shrink-0 items-center justify-center rounded-md bg-[#192a3a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 md:h-9 md:min-h-0 md:w-auto md:min-w-[8.75rem] md:px-3 md:py-2 md:text-xs";
const secondaryOutlineBtnClass =
  "inline-flex w-full min-h-[40px] shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#192a3a] shadow-sm hover:bg-gray-50 md:h-9 md:min-h-0 md:w-auto md:min-w-[8.75rem] md:px-3 md:py-2 md:text-xs";
const waitingStateClass =
  "inline-flex w-full min-h-[40px] shrink-0 cursor-default items-center justify-center rounded-md border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-600 md:h-9 md:min-h-0 md:w-auto md:px-3 md:py-2 md:text-xs";

function BookingCardPrimaryAction({
  booking,
  payingBookingId,
  onPayClick,
  pairWithChevron = false,
}: BookingCardPrimaryActionProps) {
  const ui = resolveRenterMyBookingsUi(booking);
  const { kind, actionLabel } = ui.primary;
  const pc = pairWithChevron;

  if (kind === "pay_now") {
    return (
      <button
        type="button"
        onClick={onPayClick}
        disabled={payingBookingId === booking.id}
        className={`${applyPairedPrimaryLayout(primaryBtnClass, pc)} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {payingBookingId === booking.id ? "…" : actionLabel}
      </button>
    );
  }

  if (kind === "none") {
    return (
      <span
        className={applyPairedPrimaryLayout(waitingStateClass, pc)}
        title={ui.helperText}
      >
        {actionLabel}
      </span>
    );
  }

  if (kind === "retry_payment" || kind === "view_booking") {
    return (
      <Link
        href={bookingDetailHref(booking.id)}
        onClick={(e) => e.stopPropagation()}
        className={applyPairedPrimaryLayout(primaryBtnClass, pc)}
      >
        {actionLabel}
      </Link>
    );
  }

  if (kind === "book_again" || kind === "continue_booking") {
    return (
      <Link
        href={rebookListingHref(booking.space_id)}
        onClick={(e) => e.stopPropagation()}
        className={applyPairedPrimaryLayout(primaryBtnClass, pc)}
      >
        {actionLabel}
      </Link>
    );
  }

  /* view_details and unknown fallbacks */
  return (
    <Link
      href={bookingDetailHref(booking.id)}
      onClick={(e) => e.stopPropagation()}
      className={applyPairedPrimaryLayout(secondaryOutlineBtnClass, pc)}
    >
      {actionLabel}
    </Link>
  );
}

type BookingMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string | null;
};

function MyBookingsPageContent({
  payment,
  bookingId,
  focusBookingId,
}: {
  payment: string | null;
  bookingId: string | null;
  focusBookingId: string | null;
}) {
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
  const [invoiceModalBookingId, setInvoiceModalBookingId] = useState<string | null>(null);
  const [invoiceHtml, setInvoiceHtml] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoicePdfLoading, setInvoicePdfLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [messagesLoadingBookingId, setMessagesLoadingBookingId] = useState<
    string | null
  >(null);
  const messagesLoadedRef = useRef<Set<string>>(new Set());
  const [chargesByBooking, setChargesByBooking] = useState<
    Record<string, BookingChargeLite[]>
  >({});
  const [communicationOpenBookingId, setCommunicationOpenBookingId] = useState<
    string | null
  >(null);
  const [ownerContactByBooking, setOwnerContactByBooking] = useState<
    Record<string, { email: string | null; phone: string | null }>
  >({});

  const { highlightedId } = useFocusHighlight({
    focusId: focusBookingId,
    ready: !loading,
    prefix: "booking-card",
  });

  useEffect(() => {
    loadMyBookings();
  }, []);

  // When arriving via `?focus=`, expand the matching booking once data loaded.
  useEffect(() => {
    if (!focusBookingId || loading) return;
    if (bookings.some((b) => b.id === focusBookingId)) {
      setExpandedBookingId(focusBookingId);
    }
  }, [focusBookingId, loading, bookings]);

  // Mark related renter-side notifications for this booking as read.
  useEffect(() => {
    if (!focusBookingId || loading) return;
    if (!bookings.some((b) => b.id === focusBookingId)) return;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        await fetch("/api/notifications/read-by-related", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            relatedEntityType: "booking",
            relatedEntityId: focusBookingId,
            types: [
              "payment_needed",
              "booking_confirmed",
              "booking_declined",
              "booking_expired",
              "booking_message",
            ],
          }),
        });
      } catch {
        /* non-fatal */
      }
    })();
  }, [focusBookingId, loading, bookings]);

  useEffect(() => {
    if (payment === "success") {
      setMessage("Payment received. Your booking is confirmed.");
      if (bookingId) {
        setSuccessModalBookingId(bookingId);
      }
      return;
    }
    if (payment === "cancelled") {
      setMessage(
        "Payment was cancelled or not completed. You can try again from this page when you are ready."
      );
    }
  }, [bookingId, payment]);

  useEffect(() => {
    if (!communicationOpenBookingId) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCommunicationOpenBookingId(null);
      }
    }
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [communicationOpenBookingId]);

  async function openInvoiceModal(bookingId: string) {
    setInvoiceError(null);
    setInvoiceHtml(null);
    setInvoiceModalBookingId(bookingId);
    setInvoiceLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setInvoiceError("Sign in to view your invoice.");
        setInvoiceLoading(false);
        return;
      }

      const res = await fetch(`/api/invoice/${bookingId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const text = await res.text();

      if (!res.ok) {
        setInvoiceError(
          res.status === 403
            ? "Your invoice appears here once payment has been confirmed—usually within a few minutes after checkout."
            : text || "We couldn’t load your invoice. Try again in a moment."
        );
        setInvoiceLoading(false);
        return;
      }

      setInvoiceHtml(text);
    } catch {
      setInvoiceError("We couldn’t load your invoice. Try again in a moment.");
    } finally {
      setInvoiceLoading(false);
    }
  }

  async function handleDownloadInvoicePdf() {
    if (!invoiceModalBookingId) return;
    setInvoicePdfLoading(true);
    setInvoiceError(null);
    try {
      const result = await downloadInvoicePdf(invoiceModalBookingId);
      if (!result.ok) {
        setInvoiceError(result.message);
      }
    } finally {
      setInvoicePdfLoading(false);
    }
  }

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
          "id, space_id, renter_id, owner_id, booking_unit, start_at, end_at, notes, owner_response_message, status, payment_status, total_price, created_at, monthly_rent, months_total, months_paid, deposit_amount, initial_payment_amount, next_payment_date"
        )
        .eq("renter_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const rawBookings = (data || []) as Booking[];

      const detailByBookingId = new Map<string, Record<string, unknown>>();
      if (rawBookings.length > 0) {
        const allIds = rawBookings.map((b) => b.id);
        const { data: detailRows, error: detailsError } = await (
          supabase.from("booking_request_details" as never) as any
        )
          .select("booking_id, data")
          .in("booking_id", allIds);

        if (detailsError) {
          console.error("booking_request_details load:", detailsError);
        } else {
          for (const row of (detailRows || []) as Array<{
            booking_id: string;
            data: unknown;
          }>) {
            if (
              row.data &&
              typeof row.data === "object" &&
              !Array.isArray(row.data)
            ) {
              detailByBookingId.set(row.booking_id, row.data as Record<string, unknown>);
            }
          }
        }
      }

      const spaceIds = Array.from(new Set(rawBookings.map((b) => b.space_id)));
      const ownerIds = Array.from(new Set(rawBookings.map((b) => b.owner_id)));

      let spacesMap = new Map<string, Space>();
      let ownersMap = new Map<string, Profile>();

      const imageMap = new Map<string, string>();
      if (spaceIds.length > 0) {
        const { data: spacesData } = await supabase
          .from("spaces")
          .select("id, title, city, suburb, address_line_1")
          .in("id", spaceIds);

        const baseSpaces = ((spacesData || []) as Space[]).map((s) => ({
          ...s,
          cover_image_url: null as string | null,
        }));

        const { data: imagesData } = await supabase
          .from("space_images")
          .select("space_id, image_url, sort_order")
          .in("space_id", spaceIds)
          .order("sort_order", { ascending: true });

        for (const image of (imagesData || []) as SpaceImageRow[]) {
          if (!imageMap.has(image.space_id)) {
            imageMap.set(image.space_id, image.image_url);
          }
        }

        spacesMap = new Map(
          baseSpaces.map((s) => [
            s.id,
            { ...s, cover_image_url: imageMap.get(s.id) || null },
          ])
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
        requestDetails: detailByBookingId.get(b.id) ?? null,
      }));

      const bookingIds = rawBookings.map((b) => b.id);
      const chargesMap: Record<string, BookingChargeLite[]> = {};
      if (bookingIds.length > 0) {
        const { data: chargeRows } = await supabase
          .from("booking_charges")
          .select("booking_id, amount, status")
          .in("booking_id", bookingIds);

        for (const row of (chargeRows || []) as {
          booking_id: string;
          amount: number | null;
          status: string | null;
        }[]) {
          if (!chargesMap[row.booking_id]) chargesMap[row.booking_id] = [];
          chargesMap[row.booking_id].push({
            amount: row.amount,
            status: row.status,
          });
        }
      }

      setChargesByBooking(chargesMap);
      setBookings(enriched);
      setLoading(false);
    } catch {
      setMessage("Something went wrong while loading your bookings.");
      setLoading(false);
    }
  }

  function canCancelBooking(booking: Booking) {
    return (
      booking.status === "pending_owner" ||
      booking.status === "accepted_awaiting_payment"
    );
  }

  async function loadMessagesFromApi(bookingId: string) {
    setMessagesLoadingBookingId(bookingId);
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Please log in to load messages.");
        return;
      }

      const res = await fetch(`/api/bookings/${bookingId}/messages`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        messages?: BookingMessage[];
        counterpartyContact?: { email: string | null; phone: string | null };
        ownerContact?: { email: string | null; phone: string | null };
      };

      if (!res.ok) {
        setMessage(
          typeof json.error === "string"
            ? json.error
            : "Could not load messages."
        );
        return;
      }

      const contact =
        json.counterpartyContact ??
        json.ownerContact ??
        ({ email: null, phone: null } as {
          email: string | null;
          phone: string | null;
        });

      setMessagesByBooking((current) => ({
        ...current,
        [bookingId]: json.messages || [],
      }));
      setOwnerContactByBooking((current) => ({
        ...current,
        [bookingId]: contact,
      }));
      messagesLoadedRef.current.add(bookingId);
    } catch {
      setMessage("Could not load messages.");
    } finally {
      setMessagesLoadingBookingId(null);
    }
  }

  async function toggleCommunicationPanel(
    booking: EnrichedBooking,
    e?: React.MouseEvent
  ) {
    e?.stopPropagation();
    if (communicationOpenBookingId === booking.id) {
      setCommunicationOpenBookingId(null);
      return;
    }
    setCommunicationOpenBookingId(booking.id);
    if (!isCommunicationAllowed(booking)) {
      return;
    }
    if (!messagesLoadedRef.current.has(booking.id)) {
      await loadMessagesFromApi(booking.id);
    }
  }

  async function toggleBookingExpanded(booking: EnrichedBooking) {
    if (expandedBookingId === booking.id) {
      setExpandedBookingId(null);
      setCommunicationOpenBookingId(null);
      return;
    }
    setExpandedBookingId(booking.id);
    setCommunicationOpenBookingId(null);
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

    if (!isCommunicationAllowed(booking)) {
      setMessage(
        "Messaging is only available after payment confirmation."
      );
      return;
    }

    setSendingMessageBookingId(booking.id);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Please log in first.");
        setSendingMessageBookingId(null);
        return;
      }

      const res = await fetch(`/api/bookings/${booking.id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: draft }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: BookingMessage;
      };

      if (!res.ok) {
        setMessage(
          typeof json.error === "string"
            ? json.error
            : "Could not send message."
        );
        return;
      }

      const newMessage = json.message;
      if (!newMessage) {
        setMessage("Could not send message.");
        return;
      }

      messagesLoadedRef.current.add(booking.id);

      setMessagesByBooking((current) => ({
        ...current,
        [booking.id]: [...(current[booking.id] || []), newMessage],
      }));

      setMessageDrafts((current) => ({
        ...current,
        [booking.id]: "",
      }));
      broadcastInboxRefresh();
    } catch {
      setMessage("Could not send message.");
    } finally {
      setSendingMessageBookingId(null);
    }
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

  function formatBookingTypeLabel(unit: string | null | undefined) {
    const u = (unit || "day").toLowerCase();
    if (u === "month") return "Monthly";
    if (u === "hour") return "Hourly";
    return "Daily";
  }

  function getPaymentStatusBadgeClass(ps: string | null | undefined) {
    const s = (ps || "unpaid").toLowerCase();
    if (s === "paid" || s === "paid_confirmed") return "bg-emerald-100 text-emerald-900";
    if (s === "awaiting_payment") return "bg-amber-100 text-amber-900";
    if (s === "unpaid") return "bg-gray-100 text-gray-700";
    return "bg-blue-100 text-blue-800";
  }

  const counts = useMemo(() => {
    return {
      all: bookings.length,
      pending: bookings.filter((b) => b.status === "pending_owner").length,
      awaiting_payment: bookings.filter(
        (b) => b.status === "accepted_awaiting_payment"
      ).length,
      paid: bookings.filter(
        (b) =>
          b.status === "paid_confirmed" ||
          b.status === "confirmed" ||
          b.status === "completed"
      ).length,
      declined: bookings.filter((b) => b.status === "declined").length,
      expired: bookings.filter((b) => b.status === "expired").length,
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
      return bookings.filter(
        (b) =>
          b.status === "paid_confirmed" ||
          b.status === "confirmed" ||
          b.status === "completed"
      );
    }

    if (statusFilter === "declined") {
      return bookings.filter((b) => b.status === "declined");
    }

    if (statusFilter === "expired") {
      return bookings.filter((b) => b.status === "expired");
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

  const pageFinance = useMemo(
    () => aggregateRenterPageMetrics(bookings, chargesByBooking),
    [bookings, chargesByBooking]
  );

  return (
    <RequireAuth>
      <DashboardShell
        workspaceLabel="My account"
        pageTitle="My bookings"
        pageSubtitle="Track the booking requests you have sent to space owners."
        navItems={RENTER_NAV}
        activeHref="/dashboard/my-bookings"
      >
        <>
          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5">
            <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                {
                  key: "spent",
                  icon: Wallet,
                  label: "Total spent",
                  value: formatZarCompact(pageFinance.totalSpent),
                },
                {
                  key: "active",
                  icon: BookmarkCheck,
                  label: "Active bookings",
                  value: String(pageFinance.activeBookingsCount),
                },
                {
                  key: "next",
                  icon: CalendarClock,
                  label: "Next payment due",
                  value: formatPageNextPaymentSummary(pageFinance),
                },
                {
                  key: "out",
                  icon: CircleDollarSign,
                  label: "Outstanding",
                  value: formatZarCompact(pageFinance.outstandingTotal),
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex min-h-[72px] flex-col justify-center rounded-md border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <item.icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="leading-tight">{item.label}</span>
                  </div>
                  <p
                    className={`text-sm font-semibold text-[#192a3a] ${item.key === "next" ? "leading-snug line-clamp-2" : "tabular-nums"}`}
                    title={item.value}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "All", count: counts.all },
                { key: "pending", label: "Awaiting host", count: counts.pending },
                {
                  key: "awaiting_payment",
                  label: "Awaiting payment",
                  count: counts.awaiting_payment,
                },
                { key: "paid", label: "Paid", count: counts.paid },
                { key: "expired", label: "Expired", count: counts.expired },
                { key: "declined", label: "Declined", count: counts.declined },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStatusFilter(item.key)}
                  className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${statusFilter === item.key
                    ? "bg-[#192a3a] text-white"
                    : "bg-white text-[#192a3a]"
                    }`}
                >
                  <span>{item.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusFilter === item.key
                      ? "bg-white text-[#192a3a]"
                      : "bg-gray-200 text-gray-700"
                      }`}
                  >
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
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
              {filteredBookings.map((booking) => {
                const isOpen = expandedBookingId === booking.id;
                const locationLabel =
                  [
                    booking.space?.address_line_1,
                    booking.space?.suburb,
                    booking.space?.city,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Address not set";
                const showInvoice =
                  booking.payment_status === "paid" ||
                  booking.payment_status === "paid_confirmed" ||
                  booking.status === "paid_confirmed" ||
                  booking.status === "confirmed" ||
                  booking.status === "completed";
                const showInvoiceHint =
                  !showInvoice &&
                  booking.status !== "declined" &&
                  booking.status !== "expired";

                const charges = chargesByBooking[booking.id] ?? [];
                const fin = computeRenterBookingFinance(booking, charges);
                const rowUi = resolveRenterMyBookingsUi(booking);

                const amountDisplay = `R${Number(booking.total_price || 0).toLocaleString("en-ZA", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`;

                return (
                  <div
                    key={booking.id}
                    id={`booking-card-${booking.id}`}
                    className={`overflow-hidden rounded-md border border-gray-200 bg-white text-left shadow-sm transition hover:border-gray-300 hover:bg-[#fbfcfd] ${
                      highlightedId === booking.id ? FOCUS_HIGHLIGHT_CLASS : ""
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-stretch">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => void toggleBookingExpanded(booking)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void toggleBookingExpanded(booking);
                          }
                        }}
                        className="min-w-0 flex-1 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#192a3a]/25"
                      >
                        <div className="p-3 pb-2 md:p-4 md:pr-3">
                          <div className="mb-3 flex items-start justify-between gap-2 md:hidden">
                            <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug text-[#192a3a]">
                              {booking.space?.title || "Untitled space"}
                            </h2>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${rowUi.badgeClassName}`}
                            >
                              {rowUi.label}
                            </span>
                          </div>

                          <div className="flex gap-3">
                            <div className="relative h-[72px] w-[92px] shrink-0 overflow-hidden rounded-md bg-gray-100">
                              {booking.space?.cover_image_url ? (
                                <Image
                                  src={booking.space.cover_image_url}
                                  alt={booking.space?.title || "Listing image"}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-gray-500">
                                  No image
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1 space-y-1.5">
                              <h2 className="hidden truncate text-base font-semibold text-[#192a3a] md:block">
                                {booking.space?.title || "Untitled space"}
                              </h2>
                              <div className="flex items-start gap-2 text-sm text-gray-600">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                <p className="min-w-0 leading-snug">{locationLabel}</p>
                              </div>
                              <div className="flex flex-col gap-1 text-xs text-gray-600">
                                <span className="inline-flex items-start gap-1.5">
                                  <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
                                  <span className="text-gray-700">
                                    {formatBookingRange(booking)}
                                  </span>
                                </span>
                                <span className="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                                  <span className="inline-flex min-w-0 items-center gap-1.5">
                                    <User className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                    <span className="truncate">
                                      {getDisplayName(booking.owner) || "Owner"}
                                    </span>
                                  </span>
                                  <span className="inline-flex shrink-0 items-center gap-1 text-gray-500">
                                    <Tag className="h-3.5 w-3.5" />
                                    {formatBookingTypeLabel(booking.booking_unit)}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col justify-center gap-2 border-t border-gray-100 px-3 pb-3 pt-2 md:w-[min(100%,15.5rem)] md:shrink-0 md:border-l md:border-t-0 md:p-4 md:pl-4">
                        <div className="hidden items-center justify-end gap-2 md:flex">
                          <span
                            className={`inline-flex max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-medium ${rowUi.badgeClassName}`}
                          >
                            {rowUi.label}
                          </span>
                          <p className="text-sm font-semibold tabular-nums text-[#192a3a]">
                            {amountDisplay}
                          </p>
                        </div>

                        <div className="flex items-baseline justify-between gap-2 md:hidden">
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Total
                          </span>
                          <p className="text-base font-semibold tabular-nums text-[#192a3a]">
                            {amountDisplay}
                          </p>
                        </div>

                        {rowUi.cardHint ? (
                          <p className="text-[11px] leading-snug text-gray-500 md:text-right">
                            {rowUi.cardHint}
                          </p>
                        ) : null}

                        {(rowUi.primary.kind === "pay_now" ||
                          rowUi.primary.kind === "retry_payment") && (
                          <div className="space-y-0.5 text-[10px] leading-snug text-gray-500 md:text-right">
                            <p className="font-medium text-gray-600">Secure payment</p>
                            <p>Your booking is only confirmed once payment is complete.</p>
                          </div>
                        )}

                        <div className="flex w-full justify-end">
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <BookingCardPrimaryAction
                              booking={booking}
                              payingBookingId={payingBookingId}
                              pairWithChevron
                              onPayClick={(e) => {
                                e.stopPropagation();
                                setPaymentModalBookingId(booking.id);
                              }}
                            />
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={
                                isOpen ? "Collapse booking details" : "Expand booking details"
                              }
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100/80 hover:text-gray-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleBookingExpanded(booking);
                              }}
                            >
                              {isOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {isOpen && (
                      <div
                        className="border-t border-gray-200 bg-[#fafbfc] px-4 py-5 sm:px-5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="space-y-6">
                            <section>
                              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                Booking details
                              </p>
                              <div className="grid gap-3 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm sm:grid-cols-2">
                                <div className="flex items-start gap-2">
                                  <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                  <div>
                                    <p className="text-xs font-medium text-gray-500">Owner</p>
                                    <p className="font-medium text-[#192a3a]">
                                      {getDisplayName(booking.owner)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                  <div>
                                    <p className="text-xs font-medium text-gray-500">Full period</p>
                                    <p className="text-[#192a3a]">{formatBookingRange(booking)}</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                  <div>
                                    <p className="text-xs font-medium text-gray-500">Payment status</p>
                                    <span
                                      className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getPaymentStatusBadgeClass(
                                        booking.payment_status
                                      )}`}
                                    >
                                      {renterPaymentStatusLabel(booking.payment_status)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                  <div>
                                    <p className="text-xs font-medium text-gray-500">Total amount</p>
                                    <p className="font-semibold tabular-nums text-[#192a3a]">
                                      R{Number(booking.total_price || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </section>

                            <BookingRequestDetailsPanel
                              data={booking.requestDetails ?? null}
                              title="Your booking request details"
                            />

                            <section>
                              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/80 p-3 sm:p-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                  Finance
                                </p>
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <div>
                                    <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                      <Wallet className="h-3.5 w-3.5 shrink-0" />
                                      Amount paid
                                    </p>
                                    <p className="text-sm font-semibold tabular-nums text-[#192a3a]">
                                      {formatZarCompact(fin.amountPaid)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                      <CircleDollarSign className="h-3.5 w-3.5 shrink-0" />
                                      Amount outstanding
                                    </p>
                                    <p className="text-sm font-semibold tabular-nums text-[#192a3a]">
                                      {formatZarCompact(fin.amountOutstanding)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                      Next payment due
                                    </p>
                                    <p className="text-sm font-semibold leading-snug text-[#192a3a]">
                                      {formatRenterNextPaymentSummary(fin)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </section>

                            {(showInvoice || showInvoiceHint) && (
                              <section className="rounded-md border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                  Invoice
                                </p>
                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                  {showInvoice && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void openInvoiceModal(booking.id);
                                      }}
                                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-[#192a3a] hover:bg-gray-50 sm:w-auto"
                                    >
                                      <FileText className="h-3.5 w-3.5 shrink-0" />
                                      View invoice
                                    </button>
                                  )}
                                  {showInvoiceHint && (
                                    <p className="text-xs text-gray-500">
                                      Your invoice will be available here once payment is confirmed.
                                    </p>
                                  )}
                                </div>
                              </section>
                            )}

                            {((shouldShowBookingRequestNotes(booking.status, booking.payment_status) &&
                              (booking.notes || "").trim() !== "") ||
                              booking.owner_response_message) && (
                              <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                  Booking request
                                </p>
                                <div className="space-y-3">
                                  {shouldShowBookingRequestNotes(
                                    booking.status,
                                    booking.payment_status
                                  ) &&
                                    (booking.notes || "").trim() !== "" && (
                                      <div>
                                        <p className="mb-1 text-xs font-medium text-gray-500">
                                          Notes with your request
                                        </p>
                                        <div className="min-h-[56px] rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                                          {booking.notes}
                                        </div>
                                      </div>
                                    )}
                                  {booking.owner_response_message && (
                                    <div>
                                      <p className="mb-1 text-xs font-medium text-gray-500">Owner reply</p>
                                      <div className="min-h-[48px] rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                                        {booking.owner_response_message}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </section>
                            )}

                            {!isCommunicationAllowed(booking) && (
                              <section className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                  Messages
                                </p>
                                <DecisionSuggestion
                                  variant="info"
                                  text="Messaging available after payment."
                                  size="sm"
                                  tooltip="Messaging unlocks once payment is confirmed."
                                />
                              </section>
                            )}

                            <div
                              className="flex flex-col gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2"
                              role="group"
                              aria-label="Booking actions"
                            >
                              <button
                                type="button"
                                onClick={(e) => void toggleCommunicationPanel(booking, e)}
                                disabled={!isCommunicationAllowed(booking)}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-[#192a3a] shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                              >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                Message owner
                              </button>
                              <Link
                                href={bookingDetailHref(booking.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-center text-xs font-medium text-[#192a3a] shadow-sm hover:bg-gray-50 sm:w-auto"
                              >
                                <Eye className="h-3.5 w-3.5 shrink-0" />
                                View details
                              </Link>
                              {canCancelBooking(booking) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleCancelBooking(booking);
                                  }}
                                  disabled={
                                    cancellingBookingId === booking.id || payingBookingId === booking.id
                                  }
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-200/90 bg-white px-3 py-2 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50/80 disabled:opacity-60 sm:w-auto"
                                >
                                  {cancellingBookingId === booking.id ? "Cancelling…" : "Cancel booking"}
                                </button>
                              )}
                            </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        {communicationOpenBookingId && (() => {
          const booking = bookings.find((b) => b.id === communicationOpenBookingId);
          if (!booking) return null;
          const thread = messagesByBooking[booking.id] || [];
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
              onClick={() => setCommunicationOpenBookingId(null)}
            >
              <div
                className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#192a3a]">
                      {booking.space?.title || "Booking conversation"}
                    </h2>
                    <p className="text-xs text-gray-600">{formatBookingRange(booking)}</p>
                    <p className="mt-2 text-xs">
                      <Link
                        href={`/dashboard/messages/${booking.id}`}
                        className="font-medium text-[#192a3a] underline hover:no-underline"
                      >
                        Open full conversation page
                      </Link>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCommunicationOpenBookingId(null)}
                    className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50"
                    aria-label="Close messaging modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-3 grid gap-3 rounded-md border border-gray-100 bg-gray-50/80 p-3 sm:grid-cols-2">
                  <div className="flex items-start gap-2 text-sm">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs font-medium text-gray-500">Owner email</p>
                      <p className="break-all text-[#192a3a]">
                        {ownerContactByBooking[booking.id]?.email || booking.owner?.email || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs font-medium text-gray-500">Owner phone</p>
                      <p className="text-[#192a3a]">
                        {ownerContactByBooking[booking.id]?.phone || "Contact number not available"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="mb-2 text-xs font-medium text-gray-500">Conversation</p>
                  <div className="max-h-[38vh] space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3">
                    {messagesLoadingBookingId === booking.id ? (
                      <p className="text-sm text-gray-500">Loading conversation...</p>
                    ) : thread.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No messages yet. Your first message will start the conversation.
                      </p>
                    ) : (
                      thread.map((item) => {
                        const isMine = item.sender_id === sessionUserId;
                        return (
                          <div
                            key={item.id}
                            className={`max-w-[88%] rounded-md px-3 py-2 text-sm ${
                              isMine
                                ? "ml-auto bg-[#192a3a] text-white"
                                : "mr-auto border border-gray-200 bg-white text-[#192a3a]"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{item.message}</p>
                            <p className={`mt-1 text-[11px] ${isMine ? "text-gray-200" : "text-gray-500"}`}>
                              <span className="font-medium">{isMine ? "Renter" : "Owner"}</span> •{" "}
                              {item.created_at ? new Date(item.created_at).toLocaleString() : "No timestamp"}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <textarea
                    value={messageDrafts[booking.id] || ""}
                    onChange={(e) =>
                      setMessageDrafts((current) => ({
                        ...current,
                        [booking.id]: e.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="Write a message to the owner"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] outline-none focus:border-[#192a3a] focus:ring-2 focus:ring-[#192a3a]/20"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void sendBookingMessage(booking)}
                      disabled={sendingMessageBookingId === booking.id || !(messageDrafts[booking.id] || "").trim()}
                      className="inline-flex items-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      {sendingMessageBookingId === booking.id ? "Sending..." : "Send message"}
                    </button>
                  </div>
                </div>
                </div>
              </div>
            </div>
          );
        })()}

        {paymentModalBooking && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
            role="presentation"
            onClick={() => {
              if (payingBookingId === paymentModalBooking.id) return;
              setPaymentModalBookingId(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="payment-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="payment-modal-title"
                className="mb-2 text-xl font-semibold text-[#192a3a]"
              >
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
                  className="w-full min-h-[48px] rounded-md bg-[#192a3a] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {payingBookingId === paymentModalBooking.id ? "Processing..." : "Pay now"}
                </button>
                <p className="text-center text-xs text-gray-600">Secure payment</p>
                <p className="text-center text-[11px] leading-snug text-gray-500">
                  Your booking is only confirmed once payment is complete.
                </p>

                <button
                  type="button"
                  onClick={() => setPaymentModalBookingId(null)}
                  disabled={payingBookingId === paymentModalBooking.id}
                  className="mt-1 w-full min-h-[44px] rounded-md border border-gray-300 px-4 py-2 text-sm text-[#192a3a] hover:bg-gray-50 disabled:opacity-60"
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

        {invoiceModalBookingId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <h2 className="text-lg font-semibold text-[#192a3a]">Your invoice</h2>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownloadInvoicePdf()}
                    disabled={invoiceLoading || !!invoiceError || !invoiceHtml || invoicePdfLoading}
                    className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {invoicePdfLoading ? "Preparing PDF…" : "Download PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceModalBookingId(null);
                      setInvoiceHtml(null);
                      setInvoiceError(null);
                    }}
                    className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-[#192a3a]"
                    aria-label="Close invoice"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {invoiceLoading && (
                  <p className="text-sm text-gray-600">Fetching your invoice…</p>
                )}
                {invoiceError && (
                  <p className="text-sm text-red-700">{invoiceError}</p>
                )}
                {!invoiceLoading && !invoiceError && invoiceHtml && (
                  <iframe
                    title="Invoice"
                    className="h-[min(70vh,720px)] w-full rounded-md border border-gray-200 bg-white"
                    srcDoc={invoiceHtml}
                    sandbox="allow-same-origin"
                  />
                )}
              </div>
            </div>
          </div>
        )}
        </>
      </DashboardShell>
    </RequireAuth>
  );
}

function MyBookingsSearchParamsClient() {
  const searchParams = useSearchParams();
  const payment = searchParams.get("payment");
  const bookingId = searchParams.get("bookingId");
  const focusBookingId = searchParams.get("focus");

  return (
    <MyBookingsPageContent
      payment={payment}
      bookingId={bookingId}
      focusBookingId={focusBookingId}
    />
  );
}

export default function MyBookingsPage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-sm text-gray-600">Loading...</div>}>
      <MyBookingsSearchParamsClient />
    </Suspense>
  );
}