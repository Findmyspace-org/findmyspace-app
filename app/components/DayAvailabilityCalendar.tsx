"use client";

import { useMemo, useState } from "react";

type ExistingBooking = {
  id: string;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
};

type BlockedDate = {
  id: string;
  space_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
};

type Props = {
  existingBookings: ExistingBooking[];
  blockedDates: BlockedDate[];
  dayStart: string;
  dayEnd: string;
  onChange: (start: string, end: string) => void;
};

function getBusinessDateParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes, fallback: string) =>
    Number(parts.find((part) => part.type === type)?.value || fallback);

  return {
    year: get("year", "0"),
    month: get("month", "1"),
    day: get("day", "1"),
  };
}

function toBusinessLocalDate(value: string | Date) {
  const parts = getBusinessDateParts(value);
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}

function toDateString(date: Date) {
  const parts = getBusinessDateParts(date);
  const year = String(parts.year);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRangeLabel(start: Date, days: Date[]) {
  const end = days[days.length - 1] || start;

  const startLocal = toBusinessLocalDate(start);
  const endLocal = toBusinessLocalDate(end);

  const startLabel = startLocal.toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  const endLabel = endLocal.toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

function addDays(date: Date, count: number) {
  const local = toBusinessLocalDate(date);
  return new Date(local.getFullYear(), local.getMonth(), local.getDate() + count, 0, 0, 0, 0);
}

function startOfDay(date: Date) {
  const local = toBusinessLocalDate(date);
  return new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0);
}

function startOfNextDay(date: Date) {
  const local = toBusinessLocalDate(date);
  return new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1, 0, 0, 0, 0);
}

function normalizeBookingRange(
  bookingUnit: string | null,
  startAt: string,
  endAt: string
) {
  const start = toBusinessLocalDate(startAt);
  const end = toBusinessLocalDate(endAt);

  if (bookingUnit === "day") {
    const normalizedStart = startOfDay(start);
    const normalizedEnd = startOfDay(end);
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

export default function DayAvailabilityCalendar({
  existingBookings,
  blockedDates,
  dayStart,
  dayEnd,
  onChange,
}: Props) {
  const [offset, setOffset] = useState(0);

  const today = useMemo(() => {
    return startOfDay(new Date());
  }, []);

  const visibleStart = useMemo(() => {
    return addDays(today, offset);
  }, [today, offset]);

  const days = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => addDays(visibleStart, i));
  }, [visibleStart]);

  const blockingStatuses = [
    "approved",
    "accepted_awaiting_payment",
    "awaiting_payment",
    "paid_confirmed",
    "confirmed",
    "completed",
  ];

  const pendingStatuses = ["pending", "pending_owner"];

  const rangeLabel = useMemo(() => {
    return formatRangeLabel(visibleStart, days);
  }, [visibleStart, days]);

  function handleClick(dayStr: string, unavailable: boolean) {
    if (unavailable) return;

    if (!dayStart) {
      onChange(dayStr, "");
      return;
    }

    if (dayStart && !dayEnd) {
      if (dayStr < dayStart) {
        onChange(dayStr, dayStart);
      } else {
        onChange(dayStart, dayStr);
      }

      const index = days.findIndex((d) => toDateString(d) === dayStr);
      if (index >= 10) {
        setOffset((current) => current + 7);
      }

      return;
    }

    onChange(dayStr, "");
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#192a3a]">Select dates</h3>
          <p className="text-xs text-gray-500">
            Click a start date, then an end date
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => offset > 0 && setOffset((current) => current - 7)}
            disabled={offset === 0}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] disabled:opacity-40"
          >
            ←
          </button>

          <div className="min-w-[150px] text-center text-sm font-medium text-[#192a3a]">
            {rangeLabel}
          </div>

          <button
            type="button"
            onClick={() => setOffset((current) => current + 7)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a]"
          >
            →
          </button>

          <button
            type="button"
            onClick={() => setOffset(0)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-[#192a3a]"
          >
            Today
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayStr = toDateString(day);

            const slotStart = startOfDay(day);
            const slotEnd = startOfNextDay(day);

            const isBooked = existingBookings.some(
              (booking) =>
                blockingStatuses.includes(booking.status || "") &&
                rangesOverlap(
                  "day",
                  slotStart.toISOString(),
                  slotEnd.toISOString(),
                  booking.booking_unit,
                  booking.start_at,
                  booking.end_at
                )
            );

            const isPending = existingBookings.some(
              (booking) =>
                pendingStatuses.includes(booking.status || "") &&
                rangesOverlap(
                  "day",
                  slotStart.toISOString(),
                  slotEnd.toISOString(),
                  booking.booking_unit,
                  booking.start_at,
                  booking.end_at
                )
            );

            const isBlockedByOwner = blockedDates.some((blocked) =>
              rangesOverlap(
                "day",
                slotStart.toISOString(),
                slotEnd.toISOString(),
                "day",
                blocked.start_at,
                blocked.end_at
              )
            );

            const isUnavailable = isBooked || isBlockedByOwner || isPending;

            const isSelected =
              !!dayStart &&
              dayStr >= dayStart &&
              dayStr <= (dayEnd || dayStart);

            let className =
              "flex h-[84px] w-full flex-col items-center justify-center border-r border-b border-gray-200 px-2 text-xs last:border-r-0";

            if (isSelected) {
              className += " bg-green-500 text-white";
            } else if (isUnavailable) {
              className +=
                " cursor-not-allowed bg-[repeating-linear-gradient(135deg,rgba(229,231,235,1)_0px,rgba(229,231,235,1)_10px,rgba(209,213,219,1)_10px,rgba(209,213,219,1)_20px)] text-gray-700";
            } else {
              className += " bg-white text-[#192a3a] hover:bg-gray-50";
            }

            return (
              <button
                key={dayStr}
                type="button"
                className={className}
                onClick={() => handleClick(dayStr, isUnavailable)}
                disabled={isUnavailable}
              >
                <div className="font-medium">
                  {toBusinessLocalDate(day).toLocaleDateString([], { weekday: "short" })}
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {toBusinessLocalDate(day).getDate()}
                </div>
                <div className="mt-1 text-[11px]">
                  {toBusinessLocalDate(day).toLocaleDateString([], { month: "short" })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {(dayStart || dayEnd) && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="text-gray-500">Start</div>
            <div className="font-medium text-[#192a3a]">{dayStart || "-"}</div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="text-gray-500">End</div>
            <div className="font-medium text-[#192a3a]">{dayEnd || "-"}</div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-gray-600">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-gray-300 bg-white" />
          Available
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-green-500" />
          Selected
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-[repeating-linear-gradient(135deg,rgba(229,231,235,1)_0px,rgba(229,231,235,1)_10px,rgba(209,213,219,1)_10px,rgba(209,213,219,1)_20px)]" />
          Unavailable
        </div>
      </div>
    </div>
  );
}