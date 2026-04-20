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

type MonthAvailabilityCalendarProps = {
  existingBookings: ExistingBooking[];
  blockedDates: BlockedDate[];
  monthStart: string;
  monthEnd: string;
  onChange: (start: string, end: string) => void;
};

function toMonthValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabel(date: Date) {
  const month = date.toLocaleDateString([], { month: "short", timeZone: "UTC" });
  const shortYear = String(date.getUTCFullYear()).slice(2);
  return `${month} '${shortYear}`;
}

function formatRangeLabel(start: Date, months: Date[]) {
  const end = months[months.length - 1] || start;

  const startLabel = start.toLocaleDateString([], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const endLabel = end.toLocaleDateString([], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

function monthStartDate(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function addMonths(date: Date, count: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1, 0, 0, 0, 0));
}

function nextMonthStart(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

function parseUtcDate(value: string) {
  const date = new Date(value);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value || "0");
  const month = Number(parts.find((part) => part.type === "month")?.value || "1");
  const day = Number(parts.find((part) => part.type === "day")?.value || "1");

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function normalizeBlockedRangeForMonthCalendar(startAt: string, endAt: string) {
  const start = parseUtcDate(startAt);
  const end = parseUtcDate(endAt);

  return {
    start,
    end,
    startMonthValue: toMonthValue(
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0, 0))
    ),
    endMonthValueExclusive: toMonthValue(
      new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 0, 0, 0, 0))
    ),
  };
}


function bookingRangeForMonthCalendar(booking: ExistingBooking) {
  const start = parseUtcDate(booking.start_at);
  let end = parseUtcDate(booking.end_at);

  if ((booking.booking_unit || "").toLowerCase() === "month") {
    end = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 0, 0, 0, 0));
  }

  return { start, end };
}

function normalizeBookingMonthValues(booking: ExistingBooking) {
  const range = bookingRangeForMonthCalendar(booking);

  return {
    startMonthValue: toMonthValue(
      new Date(
        Date.UTC(
          range.start.getUTCFullYear(),
          range.start.getUTCMonth(),
          1,
          0,
          0,
          0,
          0
        )
      )
    ),
    endMonthValueExclusive: toMonthValue(
      new Date(
        Date.UTC(
          range.end.getUTCFullYear(),
          range.end.getUTCMonth(),
          1,
          0,
          0,
          0,
          0
        )
      )
    ),
  };
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function isMonthInSelectedRange(
  monthValue: string,
  selectedStart: string,
  selectedEnd: string
) {
  if (!selectedStart) return false;

  const monthDate = monthStartDate(monthValue);
  const startDate = monthStartDate(selectedStart);
  const endDate = monthStartDate(selectedEnd || selectedStart);

  return monthDate >= startDate && monthDate <= endDate;
}

export default function MonthAvailabilityCalendar({
  existingBookings,
  blockedDates,
  monthStart,
  monthEnd,
  onChange,
}: MonthAvailabilityCalendarProps) {
  const [monthOffset, setMonthOffset] = useState(0);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }, []);

  const firstVisibleMonth = useMemo(
    () => addMonths(today, monthOffset),
    [today, monthOffset]
  );

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) =>
      addMonths(firstVisibleMonth, index)
    );
  }, [firstVisibleMonth]);

  const rangeLabel = useMemo(() => {
    return formatRangeLabel(firstVisibleMonth, months);
  }, [firstVisibleMonth, months]);

  const blockingStatuses = [
    "approved",
    "accepted_awaiting_payment",
    "awaiting_payment",
    "paid_confirmed",
    "confirmed",
    "completed",
  ];

  const pendingStatuses = ["pending", "pending_owner"];

  function handleMonthClick(monthValue: string, isUnavailable: boolean) {
    if (isUnavailable) return;

    if (!monthStart) {
      onChange(monthValue, "");
      return;
    }

    if (monthStart && !monthEnd) {
      if (monthValue < monthStart) {
        onChange(monthValue, monthStart);
      } else if (monthValue === monthStart) {
        onChange(monthValue, monthValue);
      } else {
        onChange(monthStart, monthValue);
      }

      const selectedIndex = months.findIndex(
        (month) => toMonthValue(month) === monthValue
      );

      if (selectedIndex >= 10) {
        setMonthOffset((current) => current + 1);
      }

      return;
    }

    onChange(monthValue, "");

    const selectedIndex = months.findIndex(
      (month) => toMonthValue(month) === monthValue
    );

    if (selectedIndex >= 10) {
      setMonthOffset((current) => current + 1);
    }
  }

  const canGoBack = monthOffset > 0;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#192a3a]">Select months</h3>
          <p className="text-xs text-gray-500">
            Click a start month, then click an end month
          </p>
        </div>

        <div className="flex w-full min-w-0 max-w-full flex-col gap-2 sm:items-end">
          <div className="flex min-w-0 items-center justify-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => canGoBack && setMonthOffset((current) => current - 1)}
              disabled={!canGoBack}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] disabled:opacity-40"
              aria-label="Previous months"
            >
              ←
            </button>

            <div className="min-w-0 max-w-[min(100%,11rem)] flex-1 text-center text-[11px] font-medium leading-snug text-[#192a3a] sm:max-w-none sm:min-w-[170px] sm:flex-none sm:text-sm">
              {rangeLabel}
            </div>

            <button
              type="button"
              onClick={() => setMonthOffset((current) => current + 1)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a]"
              aria-label="Next months"
            >
              →
            </button>
          </div>

          <div className="flex w-full justify-center sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => setMonthOffset(0)}
              className="w-full max-w-[12rem] rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-[#192a3a] sm:w-auto sm:max-w-none"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
          {months.map((month) => {
            const monthValue = toMonthValue(month);
            const thisMonthStart = monthStartDate(monthValue);
            const thisMonthEnd = nextMonthStart(monthValue);

            const isBooked = existingBookings.some((booking) => {
              if (!blockingStatuses.includes(booking.status || "")) return false;

              const normalizedBookingMonths = normalizeBookingMonthValues(booking);

              return (
                monthValue >= normalizedBookingMonths.startMonthValue &&
                monthValue < normalizedBookingMonths.endMonthValueExclusive
              );
            });

            const isPending = existingBookings.some((booking) => {
              if (!pendingStatuses.includes(booking.status || "")) return false;

              const normalizedBookingMonths = normalizeBookingMonthValues(booking);

              return (
                monthValue >= normalizedBookingMonths.startMonthValue &&
                monthValue < normalizedBookingMonths.endMonthValueExclusive
              );
            });

            const isBlockedByOwner = blockedDates.some((blocked) => {
              const normalizedBlockedRange = normalizeBlockedRangeForMonthCalendar(
                blocked.start_at,
                blocked.end_at
              );

              return (
                monthValue >= normalizedBlockedRange.startMonthValue &&
                monthValue < normalizedBlockedRange.endMonthValueExclusive
              );
            });

            const isUnavailable = isBooked || isPending || isBlockedByOwner;
            const isSelected = isMonthInSelectedRange(
              monthValue,
              monthStart,
              monthEnd
            );

            let className =
              "flex h-[96px] w-full flex-col items-center justify-center border-r border-b border-gray-200 px-2 text-xs last:border-r-0";

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
                key={monthValue}
                type="button"
                onClick={() => handleMonthClick(monthValue, isUnavailable)}
                disabled={isUnavailable}
                className={className}
                title={isUnavailable ? "Unavailable" : `Select ${monthLabel(month)}`}
                aria-label={`Select ${monthLabel(month)}`}
              >
                <div className="font-medium">
                  {month.toLocaleDateString([], { month: "short", timeZone: "UTC" })}
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {month.getUTCFullYear()}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {(monthStart || monthEnd) && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="text-gray-500">Start month</div>
            <div className="font-medium text-[#192a3a]">{monthStart || "-"}</div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="text-gray-500">End month</div>
            <div className="font-medium text-[#192a3a]">{monthEnd || "-"}</div>
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