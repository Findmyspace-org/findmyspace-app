"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FOCUS_HIGHLIGHT_CLASS,
  useFocusHighlight,
} from "@/lib/use-focus-highlight";
import {
  CheckCircle2,
  ClipboardList,
  CircleDot,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Send,
  Wallet,
  XCircle,
} from "lucide-react";
import { isSpaceBookable } from "@/lib/listing-lifecycle";
import { supabase } from "@/lib/supabase";
import { fetchHostManagedSpaces } from "@/lib/host-managed-spaces";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { HOST_NAV } from "@/lib/dashboard-nav";
import DecisionSuggestion from "@/app/components/DecisionSuggestion";
import { getDisplayName } from "@/lib/utils";
import { isCommunicationAllowed } from "@/lib/booking-communication";
import { OWNER_BOOKING_STAGE_LABELS } from "@/lib/booking-ui-labels";
import { shouldShowBookingRequestNotes } from "@/lib/booking-notes-visibility";
import { broadcastInboxRefresh } from "@/lib/inbox-refresh";


import OwnerCalendarLegend from "@/app/dashboard/_components/calendar/OwnerCalendarLegend";
import OwnerBookingRequestTimeline, {
  shouldShowCurrentBookingAsExisting,
} from "@/app/dashboard/_components/calendar/OwnerBookingRequestTimeline";
import BookingRequestDetailsPanel from "@/app/components/BookingRequestDetailsPanel";
import { BookingRequirementResponsesLoader } from "@/app/components/BookingRequirementResponsesLoader";

/** Shown to the renter as owner_response_message when declining from the requests UI. */
const DECLINE_REASON_OPTIONS: { value: string; label: string }[] = [
  {
    value: "Apologies — this space is not available during the time you requested.",
    label: "Not available during this time",
  },
  {
    value:
      "Thank you for your interest. We’re fully booked for the dates you selected — please try other dates.",
    label: "Fully booked for these dates",
  },
  {
    value:
      "We’re unable to accept this booking right now. Please consider another listing or try again later.",
    label: "Unable to accept this request now",
  },
  {
    value:
      "This space isn’t a good fit for what you need for this booking. Thank you for understanding.",
    label: "Not a good fit for this booking",
  },
  {
    value: "Thank you for your request. We’re unable to proceed with this booking.",
    label: "Decline (short, neutral)",
  },
];

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
  terms_accepted?: boolean | null;
  terms_accepted_at?: string | null;
  accepted_terms_updated_at?: string | null;
  accepted_terms_title?: string | null;
  accepted_terms_label?: string | null;
};

type Space = {
  id: string;
  title: string;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  booking_unit?: string | null;
  status?: string | null;
  cover_image_url?: string | null;
};

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type BlockingBooking = {
  id: string;
  space_id: string;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  payment_status: string | null;
};

type EnrichedBooking = Booking & {
  space?: Space;
  renter?: Profile;
  /** From booking_request_details.data; RLS allows owner + renter only */
  requestDetails?: Record<string, unknown> | null;
};

type BookingStage =
  | "booking_request"
  | "booking_approved"
  | "awaiting_payment"
  | "payment_received"
  | "confirmed"
  | "declined"
  | "expired";

type BookingMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string | null;
};

type RequestBlockedDate = {
  id: string;
  space_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
};

type BookingRowProps = {
  booking: EnrichedBooking;
  stage: BookingStage;
  messageCount: number;
  /** When false, hide the message-count badge (no post-payment messaging yet). */
  showMessageBadge: boolean;
  isExpanded: boolean;
  hasBlockingConflict: boolean;
  pendingOverlapCount: number;
  highestCompetingValue: number;
  onToggle: () => void;
};

type ExpandedBookingPanelProps = {
  booking: EnrichedBooking;
  blockingBookings: BlockingBooking[];
  pendingTimelineBookings: BlockingBooking[];
  blockedTimelineDates: RequestBlockedDate[];
  hasBlockingConflict: boolean;
  hasPendingConflict: boolean;
  hasAnyConflict: boolean;
  overlappingBlockingRequests: EnrichedBooking[];
  overlappingPendingRequests: EnrichedBooking[];
  onToggleCommunication: (booking: EnrichedBooking) => void | Promise<void>;
  competingPendingRequests: EnrichedBooking[];
  onApprove: () => void | Promise<void>;
  onDecline: (reason: string) => void | Promise<void>;
  /** When set, all decision controls are disabled; spinner on matching `booking.id`. */
  busyBookingId: string | null;
  requestDetailData: Record<string, unknown> | null;
};

type StatusFilterItem = {
  key: string;
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
};

type StatusFilterButtonsProps = {
  items: StatusFilterItem[];
  activeKey: string;
  onChange: (key: string) => void;
};

function normalizeBookingRange(
  bookingUnit: string | null,
  startAt: string,
  endAt: string
) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (bookingUnit === "day") {
    const normalizedStart = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );

    const normalizedEnd = new Date(end);

    const isLegacyInclusiveEnd =
      end.getUTCHours() === 23 &&
      end.getUTCMinutes() === 59 &&
      end.getUTCSeconds() >= 59;

    if (isLegacyInclusiveEnd) {
      normalizedEnd.setUTCDate(normalizedEnd.getUTCDate() + 1);
      normalizedEnd.setUTCHours(0, 0, 0, 0);
    }

    return {
      start: normalizedStart,
      end: normalizedEnd,
    };
  }

  if (bookingUnit === "month") {
    const normalizedStart = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        1,
        0,
        0,
        0,
        0
      )
    );

    const normalizedEnd = new Date(
      Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth(),
        1,
        0,
        0,
        0,
        0
      )
    );

    return {
      start: normalizedStart,
      end: normalizedEnd,
    };
  }

  return { start, end };
}

function rangesOverlap(
  aUnit: string | null,
  aStart: string,
  aEnd: string,
  bUnit: string | null,
  bStart: string,
  bEnd: string
) {
  const a = normalizeBookingRange(aUnit, aStart, aEnd);
  const b = normalizeBookingRange(bUnit, bStart, bEnd);

  return a.start < b.end && a.end > b.start;
}

function isBlockingRequestStatus(status?: string | null) {
  return [
    "approved",
    "accepted_awaiting_payment",
    "awaiting_payment",
    "paid_confirmed",
    "confirmed",
    "completed",
  ].includes(status || "");
}

function isPendingRequestStatus(status?: string | null) {
  return ["pending", "pending_owner"].includes(status || "");
}

function getBookingStage(status?: string | null, paymentStatus?: string | null): BookingStage {
  if (status === "declined") return "declined";
  if (status === "expired") return "expired";
  if (status === "paid_confirmed" || status === "confirmed" || status === "completed") {
    return "confirmed";
  }
  if (paymentStatus === "paid") return "payment_received";
  if (status === "accepted_awaiting_payment" || paymentStatus === "awaiting_payment") {
    return "awaiting_payment";
  }
  if (status === "approved") return "booking_approved";
  return "booking_request";
}

function getStageLabel(stage: BookingStage) {
  return OWNER_BOOKING_STAGE_LABELS[stage];
}

function getStageBadgeClass(stage: BookingStage) {
  if (stage === "confirmed") return "bg-green-100 text-green-800";
  if (stage === "payment_received") return "bg-emerald-100 text-emerald-800";
  if (stage === "awaiting_payment") return "bg-blue-100 text-blue-800";
  if (stage === "booking_approved") return "bg-sky-100 text-sky-800";
  if (stage === "declined") return "bg-red-100 text-red-800";
  if (stage === "expired") return "bg-amber-100 text-amber-900";
  return "bg-yellow-100 text-yellow-800";
}

function getStageSteps(stage: BookingStage) {
  const allSteps = [
    "booking_request",
    "booking_approved",
    "awaiting_payment",
    "payment_received",
    "confirmed",
  ] as const;

  if (stage === "declined" || stage === "expired") return [];

  const currentIndex = allSteps.indexOf(stage as (typeof allSteps)[number]);

  return allSteps.map((step, index) => ({
    step,
    state:
      index < currentIndex
        ? ("complete" as const)
        : index === currentIndex
          ? ("current" as const)
          : ("inactive" as const),
  }));
}

function getStageStepClass(state: "complete" | "current" | "inactive") {
  if (state === "complete") return "bg-green-600";
  if (state === "current") return "bg-[#192a3a]";
  return "bg-gray-300";
}



function formatBookingRange(booking: Booking) {
  if (!booking.start_at || !booking.end_at) return "Dates not set";

  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);

  if (normalizeBookingUnitValue(booking.booking_unit) === "hour") {
    return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })} - ${end.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  if (normalizeBookingUnitValue(booking.booking_unit) === "month") {
    const displayEnd = new Date(end);
    displayEnd.setUTCMonth(displayEnd.getUTCMonth() - 1);

    return `${start.toLocaleDateString([], {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    })} - ${displayEnd.toLocaleDateString([], {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    })}`;
  }

  const displayEnd = new Date(end);
  displayEnd.setUTCDate(displayEnd.getUTCDate() - 1);

  return `${start.toLocaleDateString([], {
    timeZone: "UTC",
  })} - ${displayEnd.toLocaleDateString([], {
    timeZone: "UTC",
  })}`;
}

function normalizeBookingUnitValue(value?: string | null) {
  const normalized = (value || "").trim().toLowerCase();

  if (["hour", "hours", "hourly"].includes(normalized)) return "hour";
  if (["day", "days", "daily"].includes(normalized)) return "day";
  if (["month", "months", "monthly"].includes(normalized)) return "month";

  return null;
}

function inferBookingUnitFromDates(startAt?: string | null, endAt?: string | null) {
  if (!startAt || !endAt) return "day";

  const start = new Date(startAt);
  const end = new Date(endAt);

  const hasExplicitTime =
    start.getUTCHours() !== 0 ||
    start.getUTCMinutes() !== 0 ||
    end.getUTCHours() !== 0 ||
    end.getUTCMinutes() !== 0;

  if (hasExplicitTime) return "hour";

  const startIsMonthBoundary =
    start.getUTCDate() === 1 &&
    start.getUTCHours() === 0 &&
    start.getUTCMinutes() === 0;

  const endIsMonthBoundary =
    end.getUTCDate() === 1 &&
    end.getUTCHours() === 0 &&
    end.getUTCMinutes() === 0;

  if (startIsMonthBoundary && endIsMonthBoundary) {
    const monthsApart =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth());

    if (monthsApart >= 1) return "month";
  }

  return "day";
}

function resolveBookingUnit(
  bookingUnit?: string | null,
  spaceBookingUnit?: string | null,
  startAt?: string | null,
  endAt?: string | null
) {
  return (
    normalizeBookingUnitValue(bookingUnit) ||
    normalizeBookingUnitValue(spaceBookingUnit) ||
    inferBookingUnitFromDates(startAt, endAt)
  );
}

function StatusFilterButtons({
  items,
  activeKey,
  onChange,
}: StatusFilterButtonsProps) {
  return (
    <div
      className="-mx-0.5 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 pt-0.5 [scrollbar-width:thin]"
      role="toolbar"
      aria-label="Filter by status"
    >
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:text-sm ${activeKey === item.key
              ? "border-[#192a3a] bg-[#192a3a] text-white"
              : "border-gray-300 bg-white text-[#192a3a]"
              }`}
          >
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{item.label}</span>
            <span
              className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none sm:text-xs ${activeKey === item.key
                ? "bg-white text-[#192a3a]"
                : "bg-gray-200 text-gray-700"
                }`}
            >
              {item.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}


type RequestsPageHeaderProps = {
  sessionEmail: string | null;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  counts: {
    all: number;
    pending: number;
    awaiting_payment: number;
    confirmed: number;
    declined: number;
    expired: number;
  };
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
};

function RequestsPageHeader({
  sessionEmail: _sessionEmail,
  searchText,
  onSearchTextChange,
  counts,
  statusFilter,
  onStatusFilterChange,
}: RequestsPageHeaderProps) {
  // Page title + intro now live in DashboardShell. This header keeps only the
  // search input and status filters, rendered as a slim card.
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="relative w-full shrink-0 lg:max-w-[min(100%,260px)]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            placeholder="Search by listing, renter, or area"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-[#192a3a]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <StatusFilterButtons
            items={[
              { key: "all", label: "All", count: counts.all, icon: ClipboardList },
              { key: "pending", label: "Pending", count: counts.pending, icon: CircleDot },
              {
                key: "awaiting_payment",
                label: "Awaiting payment",
                count: counts.awaiting_payment,
                icon: Wallet,
              },
              { key: "confirmed", label: "Confirmed", count: counts.confirmed, icon: CheckCircle2 },
              { key: "expired", label: "Expired", count: counts.expired, icon: Clock },
              { key: "declined", label: "Declined", count: counts.declined, icon: XCircle },
            ]}
            activeKey={statusFilter}
            onChange={onStatusFilterChange}
          />
        </div>
      </div>
    </div>
  );
}



type BookingConversationPanelProps = {
  booking: EnrichedBooking;
  sessionUserId: string | null;
  messagesByBooking: Record<string, BookingMessage[]>;
  messageDrafts: Record<string, string>;
  setMessageDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  sendingMessageBookingId: string | null;
  sendBookingMessage: (booking: EnrichedBooking) => Promise<void>;
  communicationOpenBookingId: string | null;
  onToggleCommunication: (booking: EnrichedBooking) => void | Promise<void>;
  messagesLoadingBookingId: string | null;
  counterpartyContactByBooking: Record<
    string,
    { email: string | null; phone: string | null }
  >;
};

function BookingConversationPanel({
  booking,
  sessionUserId,
  messagesByBooking,
  messageDrafts,
  setMessageDrafts,
  sendingMessageBookingId,
  sendBookingMessage,
  communicationOpenBookingId,
  onToggleCommunication,
  messagesLoadingBookingId,
  counterpartyContactByBooking,
}: BookingConversationPanelProps) {
  const isOpen = communicationOpenBookingId === booking.id;
  const contact = counterpartyContactByBooking[booking.id];

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
          Request thread
        </p>
        <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border border-gray-100 bg-gray-50 p-3">
          {shouldShowBookingRequestNotes(booking.status, booking.payment_status) &&
            (booking.notes || "").trim() !== "" && (
              <div className="mr-auto max-w-[88%] rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-[#192a3a]">
                <p className="font-medium text-gray-700">Initial request</p>
                <p className="mt-1 whitespace-pre-wrap">{booking.notes}</p>
                <p className="mt-1 text-[11px] text-gray-500">
                  {booking.created_at ? new Date(booking.created_at).toLocaleString() : ""}
                </p>
              </div>
            )}

          {booking.owner_response_message && (
            <div className="ml-auto max-w-[88%] rounded-md bg-[#192a3a] px-3 py-2 text-xs text-white">
              <p className="font-medium text-gray-200">Your reply (at decision)</p>
              <p className="mt-1 whitespace-pre-wrap">{booking.owner_response_message}</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            Renter communication
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onToggleCommunication(booking);
            }}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-[#192a3a] shadow-sm hover:bg-gray-50"
          >
            <MessageSquare className="h-4 w-4" />
            Message renter
            {isOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {isOpen && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="space-y-4">
              {isCommunicationAllowed(booking) && (
                <p className="text-right text-xs text-gray-600">
                  <Link
                    href={`/dashboard/messages/${booking.id}`}
                    className="font-medium text-[#192a3a] underline hover:no-underline"
                  >
                    Open full conversation page
                  </Link>
                </p>
              )}
              {messagesLoadingBookingId === booking.id ? (
                <p className="text-sm text-gray-500">Loading messages…</p>
              ) : (
                <>
                  <div className="grid gap-3 rounded-md border border-gray-100 bg-gray-50/80 p-3 sm:grid-cols-2">
                    <div className="flex items-start gap-2 text-sm">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium text-gray-500">Email</p>
                        <p className="break-all text-[#192a3a]">
                          {contact?.email || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium text-gray-500">Contact number</p>
                        <p className="text-[#192a3a]">
                          {contact?.phone ? contact.phone : "Contact number not available"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-gray-500">Conversation</p>
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3">
                      {(messagesByBooking[booking.id] || []).length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No messages yet. Say hello to coordinate with the renter.
                        </p>
                      ) : (
                        (messagesByBooking[booking.id] || []).map((item) => {
                          const isMine = item.sender_id === sessionUserId;
                          return (
                            <div
                              key={item.id}
                              className={`max-w-[88%] rounded-md px-3 py-2 text-sm ${isMine
                                ? "ml-auto bg-[#192a3a] text-white"
                                : "mr-auto border border-gray-200 bg-white text-[#192a3a]"
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
                      placeholder="Write a message to the renter"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] outline-none focus:border-[#192a3a]"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void sendBookingMessage(booking);
                        }}
                        disabled={sendingMessageBookingId === booking.id}
                        className="flex items-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        {sendingMessageBookingId === booking.id ? "Sending..." : "Send message"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function BookingRow({
  booking,
  stage,
  messageCount,
  showMessageBadge,
  isExpanded,
  hasBlockingConflict,
  pendingOverlapCount,
  highestCompetingValue,
  onToggle,
}: BookingRowProps) {
  const hasPendingConflict = pendingOverlapCount > 0;
  const decisionSuggestion = !hasBlockingConflict && !hasPendingConflict
    ? "No conflicts detected"
    : hasBlockingConflict
      ? `Conflict with ${highestCompetingValue} confirmed/payment-in-progress booking${highestCompetingValue === 1 ? "" : "s"}`
      : `${pendingOverlapCount} competing pending request${pendingOverlapCount === 1 ? "" : "s"}`;
  const decisionVariant = hasBlockingConflict ? "danger" : hasPendingConflict ? "warning" : "success";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className="grid items-center gap-3 p-3 outline-none transition hover:bg-[#fbfcfd] focus:ring-2 focus:ring-[#192a3a]/20 md:grid-cols-[92px_1.2fr_1fr_auto]"
    >
      <div className="relative h-[72px] w-full overflow-hidden rounded-md bg-gray-100 md:w-[92px]">
        {booking.space?.cover_image_url ? (
          <Image
            src={booking.space.cover_image_url}
            alt={booking.space?.title || "Listing image"}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-100 text-xs text-gray-500">
            No image
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-[#192a3a]">
          {booking.space?.title || "Untitled space"}
        </h2>
        <p className="mt-1 truncate text-sm text-gray-600">
          Renter: {getDisplayName(booking.renter)}
        </p>
        <p className="mt-1 truncate text-xs text-gray-500">
          {formatBookingRange(booking)}
        </p>
      </div>

      <div className="min-w-0">
        {stage !== "declined" && (
          <div className="flex flex-wrap gap-2">
            {getStageSteps(stage).map((item) => (
              <div key={item.step} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${getStageStepClass(item.state)}`} />
                <span className="text-[11px] text-gray-600">
                  {getStageLabel(item.step as BookingStage)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStageBadgeClass(stage)}`}>
            {getStageLabel(stage)}
          </span>
          {hasBlockingConflict && (
            <span className="inline-flex rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
              Conflict
            </span>
          )}
          {pendingOverlapCount > 0 && (
            <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              {pendingOverlapCount} competing
            </span>
          )}
        </div>

        <DecisionSuggestion
          variant={decisionVariant}
          text={decisionSuggestion}
          size="sm"
          className="max-w-[280px]"
        />

        <div className="flex items-center justify-end gap-3">
          {showMessageBadge && (
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700">
              <MessageSquare className="h-4 w-4" />
              <span>{messageCount}</span>
            </div>
          )}
          <span className="text-sm text-gray-400">{isExpanded ? "−" : "+"}</span>
        </div>
      </div>
    </div>
  );
}

function ExpandedBookingPanel({
  booking,
  blockingBookings,
  pendingTimelineBookings,
  blockedTimelineDates,
  hasBlockingConflict,
  hasPendingConflict,
  hasAnyConflict,
  overlappingBlockingRequests,
  overlappingPendingRequests,
  onToggleCommunication,
  competingPendingRequests,
  onApprove,
  onDecline,
  busyBookingId,
  requestDetailData,
}: ExpandedBookingPanelProps) {
  const showRenterContact =
    isCommunicationAllowed(booking) && booking.renter?.email;
  const canMessageRenter = isCommunicationAllowed(booking);
  const canDecide = isPendingRequestStatus(booking.status);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const decisionInFlight = busyBookingId !== null;
  const thisBookingBusy = busyBookingId === booking.id;

  return (
    <div className="border-t border-gray-200 bg-[#fbfcfd] p-4">
      <div className="space-y-4">
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-700">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div>
                <span className="font-medium text-[#192a3a]">Requester:</span> {getDisplayName(booking.renter)}
              </div>
              <div>
                <span className="font-medium text-[#192a3a]">Email:</span>{" "}
                {showRenterContact ? booking.renter?.email || "No email" : (
                  <span className="text-gray-500">Hidden until payment is confirmed</span>
                )}
              </div>
              <div>
                <span className="font-medium text-[#192a3a]">Total:</span> R{Number(booking.total_price || 0).toFixed(2)}
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Link
                href={`/spaces/${booking.space_id}`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-[#192a3a] transition hover:bg-gray-50 active:scale-[0.99]"
              >
                View listing
              </Link>
              {canMessageRenter && (
                <Link
                  href={`/dashboard/messages/${booking.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-[#192a3a] shadow-sm transition hover:bg-gray-50 active:scale-[0.99]"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  Open messages
                </Link>
              )}
            </div>
          </div>

          {shouldShowBookingRequestNotes(booking.status, booking.payment_status) &&
            (booking.notes || "").trim() !== "" && (
              <div className="mb-3 rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Notes with this request
                </p>
                <p className="whitespace-pre-wrap text-[#192a3a]">{booking.notes}</p>
              </div>
            )}

          <div className="mb-4">
            <BookingRequestDetailsPanel data={requestDetailData} />
          </div>

          <div className="mb-4">
            <BookingRequirementResponsesLoader bookingId={booking.id} />
          </div>

          {canDecide && (
            <div className="mb-4 rounded-md border border-amber-200/80 bg-amber-50/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                Your decision
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => void onApprove()}
                  disabled={decisionInFlight || hasBlockingConflict}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {thisBookingBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Approve &amp; request payment
                </button>

                {!declineOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeclineOpen(true);
                      setDeclineReason("");
                    }}
                    disabled={decisionInFlight}
                    className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Decline
                  </button>
                ) : (
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-1 sm:flex-row sm:items-center">
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-gray-600">
                      Reason for declining
                      <select
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        disabled={decisionInFlight}
                        className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-[#192a3a] disabled:opacity-60"
                      >
                        <option value="">Choose a reason…</option>
                        {DECLINE_REASON_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void onDecline(declineReason);
                          setDeclineOpen(false);
                          setDeclineReason("");
                        }}
                        disabled={!declineReason.trim() || decisionInFlight}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {thisBookingBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : null}
                        Confirm decline
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeclineOpen(false);
                          setDeclineReason("");
                        }}
                        disabled={decisionInFlight}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {hasBlockingConflict && (
                <p className="mt-2 text-xs text-red-700">
                  You can&apos;t approve this request: it overlaps with a confirmed or active booking.
                </p>
              )}
            </div>
          )}

          <div className="rounded-md border border-gray-200 bg-[#fbfcfd] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Calendar
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                {!shouldShowCurrentBookingAsExisting(booking.status, booking.payment_status) && (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-pink-500" />
                    Requested
                  </span>
                )}
                <OwnerCalendarLegend />
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <OwnerBookingRequestTimeline
                  bookingUnit={booking.booking_unit}
                  requestedStart={booking.start_at}
                  requestedEnd={booking.end_at}
                  requestedStatus={booking.status}
                  requestedPaymentStatus={booking.payment_status}
                  existingBookings={blockingBookings}
                  pendingBookings={pendingTimelineBookings}
                  blockedDates={blockedTimelineDates}
                />
              </div>
            </div>
          </div>
        </div>

        {competingPendingRequests.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-semibold text-amber-900">
              Competing requests for this period
            </p>

            <div className="space-y-2 text-sm">
              {competingPendingRequests.map((req) => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => {
                    const element = document.getElementById(`booking-card-${req.id}`);
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-amber-200 bg-white px-3 py-2 text-left hover:bg-amber-50"
                >
                  <div>
                    <p className="font-medium text-[#192a3a]">
                      {getDisplayName(req.renter)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatBookingRange(req)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-gray-500">Status</p>
                    <p className="text-xs font-medium text-[#192a3a]">
                      {req.status || "pending"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      R{Number(req.total_price || 0).toFixed(0)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-4" />

          <div className="space-y-4">
            {hasAnyConflict && (
              <div className="space-y-2">
                {hasBlockingConflict && (
                  <DecisionSuggestion
                    variant="warning"
                    size="sm"
                    multiline
                    text={`Overlap with ${overlappingBlockingRequests.length} confirmed/payment-in-progress booking${overlappingBlockingRequests.length === 1 ? "" : "s"}.`}
                    className="max-w-full"
                  />
                )}
                {hasPendingConflict && (
                  <DecisionSuggestion
                    variant="warning"
                    size="sm"
                    multiline
                    text={`Also overlaps with ${overlappingPendingRequests.length} pending request${overlappingPendingRequests.length === 1 ? "" : "s"}.`}
                    className="max-w-full"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerBookingRequestsPageContent({
  focusBookingId,
}: {
  focusBookingId: string | null;
}) {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const { highlightedId } = useFocusHighlight({
    focusId: focusBookingId,
    ready: !loading,
    prefix: "booking-card",
  });
  const [message, setMessage] = useState("");
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [ownerReplies, setOwnerReplies] = useState<Record<string, string>>({});

  const [messagesByBooking, setMessagesByBooking] = useState<Record<string, BookingMessage[]>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [sendingMessageBookingId, setSendingMessageBookingId] = useState<string | null>(null);
  const [communicationOpenBookingId, setCommunicationOpenBookingId] = useState<
    string | null
  >(null);
  const [messagesLoadingBookingId, setMessagesLoadingBookingId] = useState<
    string | null
  >(null);
  const [counterpartyContactByBooking, setCounterpartyContactByBooking] =
    useState<Record<string, { email: string | null; phone: string | null }>>({});
  const messagesLoadedRef = useRef<Set<string>>(new Set());

  const [blockingBySpace, setBlockingBySpace] = useState<
    Record<string, BlockingBooking[]>
  >({});

  const [blockedBySpace, setBlockedBySpace] = useState<Record<string, RequestBlockedDate[]>>({});
  const [searchText, setSearchText] = useState("");
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  // When arriving via `?focus=`, expand the matching booking once data loaded.
  useEffect(() => {
    if (!focusBookingId || loading) return;
    if (bookings.some((b) => b.id === focusBookingId)) {
      setExpandedBookingId(focusBookingId);
    }
  }, [focusBookingId, loading, bookings]);

  // Mark related host-side notifications for this booking as read.
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
              "booking_request",
              "booking_paid",
              "payment_received",
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
    setCommunicationOpenBookingId(null);
  }, [expandedBookingId]);

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

  async function loadRequests() {
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

      const { data: rawProfile, error: profileError } = await (supabase
        .from("profiles") as any)
        .select("is_host")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      const profile = rawProfile as { is_host: boolean | null } | null;

      const managed = await fetchHostManagedSpaces(supabase, user.id);
      if (!profile?.is_host && managed.allIds.length === 0) {
        window.location.href = "/dashboard/become-host";
        return;
      }

      let bookingsData = null;
      let bookingsError = null;
      if (managed.allIds.length > 0) {
        const result = await supabase
          .from("bookings")
          .select(
            "id, space_id, renter_id, owner_id, booking_unit, start_at, end_at, notes, owner_response_message, status, payment_status, total_price, created_at, terms_accepted, terms_accepted_at, accepted_terms_updated_at, accepted_terms_title, accepted_terms_label"
          )
          .in("space_id", managed.allIds)
          .order("created_at", { ascending: false });
        bookingsData = result.data;
        bookingsError = result.error;
      }

      if (bookingsError) {
        setMessage(bookingsError.message);
        setLoading(false);
        return;
      }

      const rawBookings = (bookingsData || []) as Booking[];

      const detailByBookingId = new Map<string, Record<string, unknown>>();
      if (rawBookings.length > 0) {
        const allBookingIds = rawBookings.map((b) => b.id);
        const { data: detailRows, error: detailsError } = await (
          supabase.from("booking_request_details" as never) as any
        )
          .select("booking_id, data")
          .in("booking_id", allBookingIds);

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
      const renterIds = Array.from(new Set(rawBookings.map((b) => b.renter_id)));

      let spacesMap = new Map<string, Space>();
      let rentersMap = new Map<string, Profile>();

      if (spaceIds.length > 0) {
        const { data: spacesData, error: spacesError } = await supabase
          .from("spaces")
          .select("id, title, city, suburb, address_line_1, booking_unit, status")
          .in("id", spaceIds);

        if (spacesError) {
          setMessage(spacesError.message);
          setLoading(false);
          return;
        }

        spacesMap = new Map(
          ((spacesData || []) as Space[]).map((space) => [space.id, space])
        );

        const { data: imagesData, error: imagesError } = await supabase
          .from("space_images")
          .select("space_id, image_url, sort_order")
          .in("space_id", spaceIds)
          .order("sort_order", { ascending: true });

        if (imagesError) {
          setMessage(imagesError.message);
          setLoading(false);
          return;
        }

        const imageMap = new Map<string, string>();

        for (const image of (imagesData || []) as Array<{
          space_id: string;
          image_url: string;
          sort_order: number | null;
        }>) {
          if (!imageMap.has(image.space_id)) {
            imageMap.set(image.space_id, image.image_url);
          }
        }

        spacesMap = new Map(
          Array.from(spacesMap.entries()).map(([id, space]) => [
            id,
            {
              ...space,
              cover_image_url: imageMap.get(id) || null,
            },
          ])
        );
      }

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
          ((rentersData || []) as Profile[]).map((profile) => [profile.id, profile])
        );
      }

      const enriched: EnrichedBooking[] = rawBookings.map((booking) => {
        const relatedSpace = spacesMap.get(booking.space_id);

        return {
          ...booking,
          booking_unit: resolveBookingUnit(
            booking.booking_unit,
            relatedSpace?.booking_unit,
            booking.start_at,
            booking.end_at
          ),
          space: relatedSpace,
          renter: rentersMap.get(booking.renter_id),
          requestDetails: detailByBookingId.get(booking.id) ?? null,
        };
      });

      setBookings(enriched);

      const initialReplies: Record<string, string> = {};
      enriched.forEach((booking) => {
        initialReplies[booking.id] = booking.owner_response_message || "";
      });
      setOwnerReplies(initialReplies);

      if (spaceIds.length > 0) {
        const { data: blockingData, error: blockingError } = await supabase
          .from("bookings")
          .select(
            "id, space_id, booking_unit, start_at, end_at, status, payment_status"
          )
          .in("space_id", spaceIds)
          .in("status", [
            "approved",
            "accepted_awaiting_payment",
            "awaiting_payment",
            "paid_confirmed",
            "confirmed",
            "completed",
          ]);

        if (blockingError) {
          setMessage(blockingError.message);
          setLoading(false);
          return;
        }

        const grouped: Record<string, BlockingBooking[]> = {};

        (blockingData || []).forEach((item: any) => {
          if (!grouped[item.space_id]) {
            grouped[item.space_id] = [];
          }

          grouped[item.space_id].push({
            id: item.id,
            space_id: item.space_id,
            booking_unit: resolveBookingUnit(
              item.booking_unit,
              spacesMap.get(item.space_id)?.booking_unit,
              item.start_at,
              item.end_at
            ),
            start_at: item.start_at,
            end_at: item.end_at,
            status: item.status || null,
            payment_status: item.payment_status || null,
          });
        });

        setBlockingBySpace(grouped);

        const { data: blockedDatesData, error: blockedDatesError } = await supabase
          .from("blocked_dates")
          .select("id, space_id, start_at, end_at, reason")
          .in("space_id", spaceIds);

        if (blockedDatesError) {
          setMessage(blockedDatesError.message);
          setLoading(false);
          return;
        }

        const groupedBlocked: Record<string, RequestBlockedDate[]> = {};

        for (const item of (blockedDatesData || []) as RequestBlockedDate[]) {
          if (!groupedBlocked[item.space_id]) {
            groupedBlocked[item.space_id] = [];
          }
          groupedBlocked[item.space_id].push(item);
        }

        setBlockedBySpace(groupedBlocked);
      } else {
        setBlockingBySpace({});
        setBlockedBySpace({});
      }

      setLoading(false);
    } catch (error) {
      console.error("Failed to load booking requests:", error);
      setMessage("Something went wrong while loading booking requests.");
      setLoading(false);
    }
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
        ({ email: null, phone: null } as {
          email: string | null;
          phone: string | null;
        });

      setMessagesByBooking((current) => ({
        ...current,
        [bookingId]: json.messages || [],
      }));
      setCounterpartyContactByBooking((current) => ({
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

  async function toggleCommunicationPanel(booking: EnrichedBooking) {
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

  async function updateBookingStatus(
    bookingId: string,
    nextStatus: "approved" | "declined" | "pending",
    ownerMessageOverride?: string
  ) {
    setMessage("");
    setBusyBookingId(bookingId);

    const bookingToUpdate = bookings.find((booking) => booking.id === bookingId);

    if (!bookingToUpdate) {
      setMessage("Booking not found.");
      setBusyBookingId(null);
      return;
    }
    const ownerResponseMessage = (
      ownerMessageOverride !== undefined
        ? ownerMessageOverride
        : ownerReplies[bookingId] || ""
    ).trim();

    let competingPendingBookings: Array<{
      id: string;
      renter_id: string;
      booking_unit: string | null;
      start_at: string;
      end_at: string;
      space_id: string;
      status: string | null;
    }> = [];

    if (nextStatus === "approved") {
      if (
        !isSpaceBookable({
          status: bookingToUpdate.space?.status,
          public_listing_mode: (
            bookingToUpdate.space as { public_listing_mode?: string | null } | undefined
          )?.public_listing_mode,
        })
      ) {
        setMessage(
          "This listing is not active. Approve the listing before accepting bookings."
        );
        setBusyBookingId(null);
        return;
      }

      const { data: rawBlockingBookings, error: blockingError } = await supabase
        .from("bookings")
        .select("id, booking_unit, start_at, end_at")
        .eq("space_id", bookingToUpdate.space_id)
        .in("status", [
          "approved",
          "accepted_awaiting_payment",
          "awaiting_payment",
          "paid_confirmed",
          "confirmed",
          "completed",
        ])
        .neq("id", bookingId);

      const blockingBookings = (rawBlockingBookings || []) as BlockingBooking[];

      if (blockingError) {
        setMessage(blockingError.message);
        setBusyBookingId(null);
        return;
      }

      const hasConflict = blockingBookings.some((existing) =>
        rangesOverlap(
          resolveBookingUnit(
            bookingToUpdate.booking_unit,
            bookingToUpdate.space?.booking_unit,
            bookingToUpdate.start_at,
            bookingToUpdate.end_at
          ),
          bookingToUpdate.start_at,
          bookingToUpdate.end_at,
          resolveBookingUnit(
            existing.booking_unit,
            null,
            existing.start_at,
            existing.end_at
          ),
          existing.start_at,
          existing.end_at
        )
      );

      if (hasConflict) {
        setMessage(
          "This booking overlaps with another accepted booking and cannot be approved."
        );
        setBusyBookingId(null);
        return;
      }

      // --- BEGIN: Find and store competing overlapping pending bookings for this space ---
      const { data: rawCompetingPendingBookings, error: competingPendingError } = await supabase
        .from("bookings")
        .select("id, renter_id, booking_unit, start_at, end_at, space_id, status")
        .eq("space_id", bookingToUpdate.space_id)
        .in("status", ["pending", "pending_owner"])
        .neq("id", bookingId);

      if (competingPendingError) {
        setMessage(competingPendingError.message);
        setBusyBookingId(null);
        return;
      }

      competingPendingBookings = ((rawCompetingPendingBookings || []) as Array<{
        id: string;
        renter_id: string;
        booking_unit: string | null;
        start_at: string;
        end_at: string;
        space_id: string;
        status: string | null;
      }>).filter((existing) =>
        rangesOverlap(
          resolveBookingUnit(
            bookingToUpdate.booking_unit,
            bookingToUpdate.space?.booking_unit,
            bookingToUpdate.start_at,
            bookingToUpdate.end_at
          ),
          bookingToUpdate.start_at,
          bookingToUpdate.end_at,
          resolveBookingUnit(existing.booking_unit, null, existing.start_at, existing.end_at),
          existing.start_at,
          existing.end_at
        )
      );
      // --- END: Find and store competing overlapping pending bookings for this space ---
    }

    const updatePayload =
      nextStatus === "approved"
        ? {
          status: "accepted_awaiting_payment",
          payment_status: "awaiting_payment",
          owner_response_at: new Date().toISOString(),
          owner_response_message: ownerResponseMessage || null,
        }
        : nextStatus === "declined"
          ? {
            status: "declined",
            payment_status: "unpaid",
            owner_response_at: new Date().toISOString(),
            owner_response_message: ownerResponseMessage || null,
          }
          : {
            status: "pending_owner",
            payment_status: bookingToUpdate.payment_status || "unpaid",
            owner_response_at: new Date().toISOString(),
            owner_response_message: ownerResponseMessage || null,
          };

    const { error } = await (supabase.from("bookings") as any)
      .update(updatePayload)
      .eq("id", bookingId);

    if (error) {
      setMessage(error.message);
      setBusyBookingId(null);
      return;
    }

    if (nextStatus === "approved") {
      try {
        await fetch("/api/notifications/booking-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookingId,
            eventType: "booking_approved_payment_needed",
          }),
        });
      } catch (error) {
        console.error("Could not send approval email:", error);
      }
    }
    if (nextStatus === "declined") {
      try {
        await fetch("/api/notifications/booking-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookingId,
            eventType: "booking_declined",
          }),
        });
      } catch (error) {
        console.error("Could not send decline email:", error);
      }
    }

    // --- BEGIN: Auto-decline competing overlapping pending bookings if approved ---
    if (nextStatus === "approved") {
      const competingIds = competingPendingBookings.map((item) => item.id);

      if (competingIds.length > 0) {
        const autoDeclineMessage =
          "Your booking request was declined because another overlapping booking was approved for this space. Thank you for your interest. Please try another date.";
        const competingRecipientIds = new Map(competingPendingBookings.map((item) => [item.id, item.renter_id]));

        const { error: competingDeclineError } = await (supabase.from("bookings") as any)
          .update({
            status: "declined",
            payment_status: "unpaid",
            owner_response_at: new Date().toISOString(),
            owner_response_message: autoDeclineMessage,
          })
          .in("id", competingIds);

        if (competingDeclineError) {
          setMessage(competingDeclineError.message);
          setBusyBookingId(null);
          return;
        }

        await Promise.all(
          competingIds.map(async (competingId) => {
            try {
              await fetch("/api/notifications/booking-event", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  bookingId: competingId,
                  eventType: "booking_declined",
                }),
              });
            } catch (notificationError) {
              console.error(
                `Could not send auto-decline email for booking ${competingId}:`,
                notificationError
              );
            }
          })
        );

        if (sessionUserId) {
          const autoDeclineMessages = competingIds
            .map((competingId) => {
              const recipientId = competingRecipientIds.get(competingId);
              if (!recipientId) return null;

              return {
                booking_id: competingId,
                sender_id: sessionUserId,
                recipient_id: recipientId,
                message: autoDeclineMessage,
              };
            })
            .filter(Boolean);

          if (autoDeclineMessages.length > 0) {
            const { data: insertedMessages, error: autoDeclineMessageError } = await (supabase
              .from("booking_messages") as any)
              .insert(autoDeclineMessages)
              .select("id, booking_id, sender_id, recipient_id, message, created_at");

            if (autoDeclineMessageError) {
              console.error("Could not save auto-decline booking messages:", autoDeclineMessageError);
            } else if (insertedMessages) {
              const typedInsertedMessages = insertedMessages as BookingMessage[];

              setMessagesByBooking((current) => {
                const updated = { ...current };

                for (const item of typedInsertedMessages) {
                  updated[item.booking_id] = [...(updated[item.booking_id] || []), item];
                }

                return updated;
              });
            }
          }
        }
      }
    }
    // --- END: Auto-decline block ---

    setBookings((current) => {
      const competingIds = nextStatus === "approved" && typeof competingPendingBookings !== "undefined"
        ? new Set(competingPendingBookings.map((item) => item.id))
        : new Set<string>();

      return current.map((booking) => {
        if (booking.id === bookingId) {
          return {
            ...booking,
            status:
              nextStatus === "approved"
                ? "accepted_awaiting_payment"
                : nextStatus === "declined"
                  ? "declined"
                  : "pending_owner",
            payment_status:
              nextStatus === "approved"
                ? "awaiting_payment"
                : nextStatus === "declined"
                  ? "unpaid"
                  : booking.payment_status,
            owner_response_message: ownerResponseMessage || null,
          };
        }

        if (nextStatus === "approved" && competingIds.has(booking.id)) {
          return {
            ...booking,
            status: "declined",
            payment_status: "unpaid",
            owner_response_message:
              "Your booking request was declined because another overlapping booking was approved for this space. Thank you for your interest. Please try another date.",
          };
        }

        return booking;
      });
    });

    setMessage(
      nextStatus === "approved"
        ? "Booking approved. Overlapping pending requests were automatically declined."
        : nextStatus === "declined"
          ? "Booking declined."
          : "Reply saved. Booking kept pending."
    );

    setBusyBookingId(null);
  }



  const counts = useMemo(() => {
    return {
      all: bookings.length,
      pending: bookings.filter(
        (booking) =>
          booking.status === "pending" || booking.status === "pending_owner"
      ).length,
      awaiting_payment: bookings.filter(
        (booking) => booking.status === "accepted_awaiting_payment"
      ).length,
      confirmed: bookings.filter(
        (booking) =>
          booking.status === "paid_confirmed" ||
          booking.status === "confirmed" ||
          booking.status === "completed"
      ).length,
      declined: bookings.filter(
        (booking) => booking.status === "declined"
      ).length,
      expired: bookings.filter((booking) => booking.status === "expired").length,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "pending"
            ? booking.status === "pending" || booking.status === "pending_owner"
            : statusFilter === "awaiting_payment"
              ? booking.status === "accepted_awaiting_payment"
              : statusFilter === "confirmed"
                ? booking.status === "paid_confirmed" ||
                  booking.status === "confirmed" ||
                  booking.status === "completed"
                : statusFilter === "expired"
                  ? booking.status === "expired"
                  : (booking.status || "pending") === statusFilter;

      if (!matchesStatus) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        booking.space?.title,
        booking.space?.address_line_1,
        booking.space?.suburb,
        booking.space?.city,
        booking.renter ? getDisplayName(booking.renter) : "",
        booking.renter?.email,
        booking.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [bookings, statusFilter, searchText]);

  return (
    <RequireAuth>
      <DashboardShell
        workspaceLabel="Hosting"
        pageTitle="Booking requests"
        pageSubtitle="Review incoming requests and track each booking through the payment and confirmation journey."
        navItems={HOST_NAV}
        activeHref="/dashboard/requests"
      >
        <>
          <RequestsPageHeader
            sessionEmail={sessionEmail}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            counts={counts}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />

          {message && (
            <div className="mb-6 rounded-md bg-gray-100 p-3 text-sm text-gray-800">
              {message}
            </div>
          )}

          {loading ? (
            <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
              Loading booking requests...
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
              No booking requests found.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBookings.map((booking) => {
                const resolvedBookingUnit = resolveBookingUnit(
                  booking.booking_unit,
                  booking.space?.booking_unit,
                  booking.start_at,
                  booking.end_at
                );
                // 1. Show all blocking bookings for this space except this request (no overlap filter)
                const blockingBookings = (blockingBySpace[booking.space_id] || []).filter(
                  (b) => b.id !== booking.id
                );

                const isPendingRequest =
                  booking.status === "pending" ||
                  booking.status === "pending_owner";

                // Overlap warning logic: fixed to require same space_id
                const overlappingBlockingRequests = bookings.filter((other) => {
                  if (other.id === booking.id) return false;
                  if (other.space_id !== booking.space_id) return false;
                  if (!isBlockingRequestStatus(other.status)) return false;

                  return rangesOverlap(
                    resolvedBookingUnit,
                    booking.start_at,
                    booking.end_at,
                    resolveBookingUnit(
                      other.booking_unit,
                      other.space?.booking_unit,
                      other.start_at,
                      other.end_at
                    ),
                    other.start_at,
                    other.end_at
                  );
                });

                // 2. Pending items for timeline: must be for same space and pending status
                const overlappingPendingRequests = bookings.filter((other) => {
                  if (other.id === booking.id) return false;
                  if (other.space_id !== booking.space_id) return false;
                  if (!isPendingRequestStatus(other.status)) return false;

                  return rangesOverlap(
                    resolvedBookingUnit,
                    booking.start_at,
                    booking.end_at,
                    resolveBookingUnit(
                      other.booking_unit,
                      other.space?.booking_unit,
                      other.start_at,
                      other.end_at
                    ),
                    other.start_at,
                    other.end_at
                  );
                });

                const pendingOverlapCount = overlappingPendingRequests.length;
                const highestCompetingValue = Math.max(
                  0,
                  ...overlappingPendingRequests.map((b) => b.total_price || 0)
                );

                const hasBlockingConflict = overlappingBlockingRequests.length > 0;
                const hasPendingConflict = overlappingPendingRequests.length > 0;
                const hasAnyConflict = hasBlockingConflict || hasPendingConflict;

                // 3. Timeline pending: show all pending for this space (not just overlapping)
                const pendingTimelineBookings: BlockingBooking[] = bookings
                  .filter(
                    (item) =>
                      item.id !== booking.id &&
                      item.space_id === booking.space_id &&
                      isPendingRequestStatus(item.status)
                  )
                  .map((item) => ({
                    id: item.id,
                    space_id: item.space_id,
                    booking_unit: resolveBookingUnit(
                      item.booking_unit,
                      item.space?.booking_unit,
                      item.start_at,
                      item.end_at
                    ),
                    start_at: item.start_at,
                    end_at: item.end_at,
                    status: item.status || null,
                    payment_status: item.payment_status || null,
                  }));

                // 4. Timeline blocked dates: show all for this space, not just overlapping
                const blockedTimelineDates = blockedBySpace[booking.space_id] || [];

                const commAllowed = isCommunicationAllowed(booking);
                const messageCount = (messagesByBooking[booking.id] || []).length;
                const stage = getBookingStage(booking.status, booking.payment_status);
                const isExpanded = expandedBookingId === booking.id;

                return (
                  <div
                    id={`booking-card-${booking.id}`}
                    key={booking.id}
                    className={`overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm ${
                      highlightedId === booking.id ? FOCUS_HIGHLIGHT_CLASS : ""
                    }`}
                  >
                    <BookingRow
                      booking={booking}
                      stage={stage}
                      messageCount={messageCount}
                      showMessageBadge={commAllowed}
                      isExpanded={isExpanded}
                      hasBlockingConflict={hasBlockingConflict}
                      pendingOverlapCount={pendingOverlapCount}
                      highestCompetingValue={highestCompetingValue}
                      onToggle={() =>
                        setExpandedBookingId((current) =>
                          current === booking.id ? null : booking.id
                        )
                      }
                    />

                    {isExpanded && (
                      <ExpandedBookingPanel
                        booking={{
                          ...booking,
                          booking_unit: resolvedBookingUnit,
                          space: booking.space
                            ? {
                              ...booking.space,
                              booking_unit: resolvedBookingUnit,
                            }
                            : undefined,
                        }}
                        blockingBookings={blockingBookings}
                        pendingTimelineBookings={pendingTimelineBookings}
                        blockedTimelineDates={blockedTimelineDates}
                        hasBlockingConflict={hasBlockingConflict}
                        hasPendingConflict={hasPendingConflict}
                        hasAnyConflict={hasAnyConflict}
                        overlappingBlockingRequests={overlappingBlockingRequests}
                        overlappingPendingRequests={overlappingPendingRequests}
                        onToggleCommunication={toggleCommunicationPanel}
                        competingPendingRequests={overlappingPendingRequests}
                        onApprove={() => void updateBookingStatus(booking.id, "approved")}
                        onDecline={(reason) =>
                          void updateBookingStatus(booking.id, "declined", reason)
                        }
                        busyBookingId={busyBookingId}
                        requestDetailData={booking.requestDetails ?? null}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

        {communicationOpenBookingId && (() => {
          const booking = bookings.find((b) => b.id === communicationOpenBookingId);
          if (!booking || !isCommunicationAllowed(booking)) return null;
          const thread = messagesByBooking[booking.id] || [];
          const contact = counterpartyContactByBooking[booking.id];
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
                  </div>
                  <button
                    type="button"
                    onClick={() => setCommunicationOpenBookingId(null)}
                    className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50"
                    aria-label="Close messaging modal"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-3 grid gap-3 rounded-md border border-gray-100 bg-gray-50/80 p-3 sm:grid-cols-2">
                  <div className="flex items-start gap-2 text-sm">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs font-medium text-gray-500">Renter email</p>
                      <p className="break-all text-[#192a3a]">{contact?.email || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-xs font-medium text-gray-500">Renter phone</p>
                      <p className="text-[#192a3a]">
                        {contact?.phone ? contact.phone : "Contact number not available"}
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
                              <span className="font-medium">{isMine ? "Owner" : "Renter"}</span> •{" "}
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
                    placeholder="Write a message to the renter"
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
        </>
      </DashboardShell>
    </RequireAuth>
  );
}

function OwnerBookingRequestsSearchParamsClient() {
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("focus");
  return <OwnerBookingRequestsPageContent focusBookingId={focusBookingId} />;
}

export default function OwnerBookingRequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-10 text-sm text-gray-600">Loading…</div>
      }
    >
      <OwnerBookingRequestsSearchParamsClient />
    </Suspense>
  );
}