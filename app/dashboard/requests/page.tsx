"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  CircleDot,
  Clock,
  MessageSquare,
  Search,
  Send,
  Wallet,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import { getDisplayName } from "@/lib/utils";


import OwnerCalendarLegend from "@/app/dashboard/_components/calendar/OwnerCalendarLegend";
import OwnerTopNav from "@/app/dashboard/_components/calendar/OwnerTopNav";
import OwnerBookingRequestTimeline from "@/app/dashboard/_components/calendar/OwnerBookingRequestTimeline";

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
  booking_unit?: string | null;
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
  isExpanded: boolean;
  hasBlockingConflict: boolean;
  pendingOverlapCount: number;
  highestCompetingValue: number;
  onToggle: () => void;
};

type ExpandedBookingPanelProps = {
  booking: EnrichedBooking;
  sessionUserId: string | null;
  busyBookingId: string | null;
  sendingMessageBookingId: string | null;
  ownerReplies: Record<string, string>;
  setOwnerReplies: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  messagesByBooking: Record<string, BookingMessage[]>;
  messageDrafts: Record<string, string>;
  setMessageDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  blockingBookings: BlockingBooking[];
  pendingTimelineBookings: BlockingBooking[];
  blockedTimelineDates: RequestBlockedDate[];
  hasBlockingConflict: boolean;
  hasPendingConflict: boolean;
  hasAnyConflict: boolean;
  overlappingBlockingRequests: EnrichedBooking[];
  overlappingPendingRequests: EnrichedBooking[];
  isPendingRequest: boolean;
  updateBookingStatus: (bookingId: string, nextStatus: "approved" | "declined" | "pending") => Promise<void>;
  sendBookingMessage: (booking: EnrichedBooking) => Promise<void>;
  canUseMessaging: (booking: Booking) => boolean;
  competingPendingRequests: EnrichedBooking[];
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
  switch (stage) {
    case "booking_request":
      return "Booking request";
    case "booking_approved":
      return "Booking approved";
    case "awaiting_payment":
      return "Awaiting payment";
    case "payment_received":
      return "Payment received";
    case "confirmed":
      return "Confirmed";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    default:
      return "Booking request";
  }
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
    <div className="flex flex-wrap gap-3">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${activeKey === item.key
              ? "bg-[#192a3a] text-white"
              : "bg-white text-[#192a3a]"
              }`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${activeKey === item.key
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
  sessionEmail,
  searchText,
  onSearchTextChange,
  counts,
  statusFilter,
  onStatusFilterChange,
}: RequestsPageHeaderProps) {
  return (
    <div className="mb-6 rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="mb-1 text-3xl font-semibold">Bookings and Requests</h1>
          <p className="text-sm text-gray-600">
            Review incoming requests and track each booking through the payment and confirmation journey.
          </p>
          {sessionEmail && (
            <p className="mt-2 text-sm text-gray-500">
              Logged in as {sessionEmail}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative min-w-[240px] flex-1 xl:max-w-[340px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            placeholder="Search by listing, renter, or area"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-[#192a3a]"
          />
        </div>

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
  canUseMessaging: (booking: Booking) => boolean;
};

function BookingConversationPanel({
  booking,
  sessionUserId,
  messagesByBooking,
  messageDrafts,
  setMessageDrafts,
  sendingMessageBookingId,
  sendBookingMessage,
  canUseMessaging,
}: BookingConversationPanelProps) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#192a3a]">
        <MessageSquare className="h-4 w-4" />
        Messages
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
          Previous messages
        </p>
        <div className="mr-auto max-w-[88%] rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-[#192a3a]">
          <p className="font-medium text-gray-700">Initial request</p>
          <p className="mt-1 whitespace-pre-wrap">{booking.notes || "No message added."}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            {booking.created_at ? new Date(booking.created_at).toLocaleString() : ""}
          </p>
        </div>

        {booking.owner_response_message && (
          <div className="ml-auto max-w-[88%] rounded-md bg-[#192a3a] px-3 py-2 text-xs text-white">
            <p className="font-medium text-gray-200">Owner reply</p>
            <p className="mt-1 whitespace-pre-wrap">{booking.owner_response_message}</p>
          </div>
        )}

        {(messagesByBooking[booking.id] || []).map((item) => {
          const isMine = item.sender_id === sessionUserId;

          return (
            <div
              key={item.id}
              className={`max-w-[88%] rounded-md px-3 py-2 text-xs ${isMine
                ? "ml-auto bg-[#192a3a] text-white"
                : "mr-auto border border-gray-200 bg-white text-[#192a3a]"
                }`}
            >
              <p className="whitespace-pre-wrap">{item.message}</p>
              <p className={`mt-1 text-[11px] ${isMine ? "text-gray-200" : "text-gray-500"}`}>
                {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
              </p>
            </div>
          );
        })}

        {!booking.owner_response_message && (messagesByBooking[booking.id] || []).length === 0 && (
          <p className="text-xs text-gray-500">No conversation yet.</p>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
          New message
        </p>
        <textarea
          value={messageDrafts[booking.id] || ""}
          onChange={(e) =>
            setMessageDrafts((current) => ({
              ...current,
              [booking.id]: e.target.value,
            }))
          }
          rows={3}
          placeholder="Add a new comment"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] outline-none focus:border-[#192a3a]"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void sendBookingMessage(booking)}
            disabled={sendingMessageBookingId === booking.id || !canUseMessaging(booking)}
            className="flex items-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {sendingMessageBookingId === booking.id ? "Sending..." : "Send comment"}
          </button>
        </div>
        {!canUseMessaging(booking) && (
          <p className="text-xs text-gray-500">
            Messaging becomes available after payment is confirmed.
          </p>
        )}
      </div>
    </div>
  );
}


function BookingRow({
  booking,
  stage,
  messageCount,
  isExpanded,
  hasBlockingConflict,
  pendingOverlapCount,
  highestCompetingValue,
  onToggle,
}: BookingRowProps) {
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
        <div className="flex flex-wrap items-center gap-2">
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

        {stage !== "declined" && (
          <div className="mt-2 flex flex-wrap gap-2">
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

      <div className="flex items-center justify-end gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700">
          <MessageSquare className="h-4 w-4" />
          <span>{messageCount}</span>
        </div>
        <span className="text-sm text-gray-400">{isExpanded ? "−" : "+"}</span>
      </div>
    </div>
  );
}

function ExpandedBookingPanel({
  booking,
  sessionUserId,
  busyBookingId,
  sendingMessageBookingId,
  ownerReplies,
  setOwnerReplies,
  messagesByBooking,
  messageDrafts,
  setMessageDrafts,
  blockingBookings,
  pendingTimelineBookings,
  blockedTimelineDates,
  hasBlockingConflict,
  hasPendingConflict,
  hasAnyConflict,
  overlappingBlockingRequests,
  overlappingPendingRequests,
  isPendingRequest,
  updateBookingStatus,
  sendBookingMessage,
  canUseMessaging,
  competingPendingRequests,
}: ExpandedBookingPanelProps) {
  return (
    <div className="border-t border-gray-200 bg-[#fbfcfd] p-4">
      <div className="space-y-4">
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <div>
              <span className="font-medium text-[#192a3a]">Requester:</span> {getDisplayName(booking.renter)}
            </div>
            <div>
              <span className="font-medium text-[#192a3a]">Email:</span> {booking.renter?.email || "No email"}
            </div>
            <div>
              <span className="font-medium text-[#192a3a]">Total:</span> R{Number(booking.total_price || 0).toFixed(2)}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-[#fbfcfd] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Calendar
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-pink-500" />
                  Requested
                </span>
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
          <div className="space-y-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Decision summary</div>
              {!hasAnyConflict ? (
                <div className="mt-1 text-amber-800">No overlapping conflicts detected for this request.</div>
              ) : (
                <>
                  {hasBlockingConflict && (
                    <div className="mt-1">
                      This booking overlaps with {overlappingBlockingRequests.length} confirmed or payment-in-progress booking{overlappingBlockingRequests.length === 1 ? "" : "s"}.
                    </div>
                  )}
                  {hasPendingConflict && (
                    <div className="mt-1">
                      This booking also overlaps with {overlappingPendingRequests.length} pending request{overlappingPendingRequests.length === 1 ? "" : "s"}.
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="rounded-md border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm font-medium text-[#192a3a]">Actions</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/spaces/${booking.space_id}`}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  View listing
                </Link>

                {isPendingRequest && (
                  <>
                    <button
                      type="button"
                      onClick={() => updateBookingStatus(booking.id, "approved")}
                      disabled={busyBookingId === booking.id || hasBlockingConflict}
                      title={
                        hasBlockingConflict
                          ? "This request overlaps with an already confirmed or payment-in-progress booking"
                          : "Approve booking"
                      }
                      className={`rounded-md px-3 py-2 text-sm text-white ${hasBlockingConflict ? "bg-gray-400 cursor-not-allowed" : "bg-[#192a3a] hover:opacity-90"} disabled:opacity-60`}
                    >
                      {busyBookingId === booking.id
                        ? "Processing..."
                        : hasBlockingConflict
                          ? "Cannot approve - date conflict"
                          : "Approve & request payment"}
                    </button>

                    <button
                      type="button"
                      onClick={() => updateBookingStatus(booking.id, "pending")}
                      disabled={busyBookingId === booking.id}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-gray-50 disabled:opacity-60"
                    >
                      Keep pending
                    </button>

                    <button
                      type="button"
                      onClick={() => updateBookingStatus(booking.id, "declined")}
                      disabled={busyBookingId === booking.id}
                      className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </>
                )}
              </div>

              {hasBlockingConflict && (
                <div className="mt-3 text-xs text-red-600">
                  Approval blocked because these dates overlap with an existing confirmed or payment-in-progress booking.
                </div>
              )}
            </div>

            <div className="rounded-md border border-gray-200 bg-white p-4">
              <p className="mb-2 text-sm font-medium text-[#192a3a]">Reply to renter</p>
              <textarea
                value={ownerReplies[booking.id] || ""}
                onChange={(e) =>
                  setOwnerReplies((current) => ({
                    ...current,
                    [booking.id]: e.target.value,
                  }))
                }
                placeholder="Add a note for the renter before approving, keeping pending, or declining"
                className="min-h-[110px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] outline-none focus:border-[#192a3a]"
              />
            </div>
          </div>

          <div className="space-y-4">
            <BookingConversationPanel
              booking={booking}
              sessionUserId={sessionUserId}
              messagesByBooking={messagesByBooking}
              messageDrafts={messageDrafts}
              setMessageDrafts={setMessageDrafts}
              sendingMessageBookingId={sendingMessageBookingId}
              sendBookingMessage={sendBookingMessage}
              canUseMessaging={canUseMessaging}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OwnerBookingRequestsPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [ownerReplies, setOwnerReplies] = useState<Record<string, string>>({});

  const [messagesByBooking, setMessagesByBooking] = useState<Record<string, BookingMessage[]>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [sendingMessageBookingId, setSendingMessageBookingId] = useState<string | null>(null);

  const [blockingBySpace, setBlockingBySpace] = useState<
    Record<string, BlockingBooking[]>
  >({});

  const [blockedBySpace, setBlockedBySpace] = useState<Record<string, RequestBlockedDate[]>>({});
  const [searchText, setSearchText] = useState("");
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

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

      if (!profile?.is_host) {
        window.location.href = "/dashboard/become-host";
        return;
      }

      const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select(
          "id, space_id, renter_id, owner_id, booking_unit, start_at, end_at, notes, owner_response_message, status, payment_status, total_price, created_at"
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (bookingsError) {
        setMessage(bookingsError.message);
        setLoading(false);
        return;
      }

      const rawBookings = (bookingsData || []) as Booking[];

      const spaceIds = Array.from(new Set(rawBookings.map((b) => b.space_id)));
      const renterIds = Array.from(new Set(rawBookings.map((b) => b.renter_id)));

      let spacesMap = new Map<string, Space>();
      let rentersMap = new Map<string, Profile>();

      if (spaceIds.length > 0) {
        const { data: spacesData, error: spacesError } = await supabase
          .from("spaces")
          .select("id, title, city, suburb, address_line_1, booking_unit")
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
        };
      });

      setBookings(enriched);
      await loadMessagesForBookings(enriched);

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

  function canUseMessaging(booking: Booking) {
    return (
      booking.payment_status === "paid" ||
      booking.payment_status === "paid_confirmed" ||
      booking.status === "paid_confirmed" ||
      booking.status === "confirmed"
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
      recipient_id: booking.renter_id,
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
          recipientId: booking.renter_id,
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

  async function updateBookingStatus(
    bookingId: string,
    nextStatus: "approved" | "declined" | "pending"
  ) {
    setMessage("");
    setBusyBookingId(bookingId);

    const bookingToUpdate = bookings.find((booking) => booking.id === bookingId);

    if (!bookingToUpdate) {
      setMessage("Booking not found.");
      setBusyBookingId(null);
      return;
    }
    const ownerResponseMessage = (ownerReplies[bookingId] || "").trim();

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
      <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
        <div className="mx-auto max-w-6xl">
          <OwnerTopNav active="requests" requestsLabel="Bookings and Requests" />
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

                const messageCount = (messagesByBooking[booking.id] || []).length;
                const stage = getBookingStage(booking.status, booking.payment_status);
                const isExpanded = expandedBookingId === booking.id;

                return (
                  <div
                    id={`booking-card-${booking.id}`}
                    key={booking.id}
                    className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
                  >
                    <BookingRow
                      booking={booking}
                      stage={stage}
                      messageCount={messageCount}
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
                        sessionUserId={sessionUserId}
                        busyBookingId={busyBookingId}
                        sendingMessageBookingId={sendingMessageBookingId}
                        ownerReplies={ownerReplies}
                        setOwnerReplies={setOwnerReplies}
                        messagesByBooking={messagesByBooking}
                        messageDrafts={messageDrafts}
                        setMessageDrafts={setMessageDrafts}
                        blockingBookings={blockingBookings}
                        pendingTimelineBookings={pendingTimelineBookings}
                        blockedTimelineDates={blockedTimelineDates}
                        hasBlockingConflict={hasBlockingConflict}
                        hasPendingConflict={hasPendingConflict}
                        hasAnyConflict={hasAnyConflict}
                        overlappingBlockingRequests={overlappingBlockingRequests}
                        overlappingPendingRequests={overlappingPendingRequests}
                        isPendingRequest={isPendingRequest}
                        updateBookingStatus={updateBookingStatus}
                        sendBookingMessage={sendBookingMessage}
                        canUseMessaging={canUseMessaging}
                        competingPendingRequests={overlappingPendingRequests}
                      />
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