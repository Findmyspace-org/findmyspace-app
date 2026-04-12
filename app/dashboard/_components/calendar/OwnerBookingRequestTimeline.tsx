"use client";

import OwnerTimelineBar from "@/app/dashboard/_components/calendar/OwnerTimelineBar";
import OwnerTimelineHeader, {
  type OwnerTimelineColumn,
} from "@/app/dashboard/_components/calendar/OwnerTimelineHeader";
import OwnerTimelineRow from "@/app/dashboard/_components/calendar/OwnerTimelineRow";

export type SharedBlockingBooking = {
  id: string;
  space_id: string;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  payment_status: string | null;
};

export type SharedBlockedDate = {
  id: string;
  space_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
};

function normalizeBookingUnit(value?: string | null) {
  const normalized = (value || "").trim().toLowerCase();

  if (["hour", "hours", "hourly"].includes(normalized)) return "hour";
  if (["day", "days", "daily"].includes(normalized)) return "day";
  if (["month", "months", "monthly"].includes(normalized)) return "month";

  return null;
}

function inferBookingUnitFromRange(startAt?: string | null, endAt?: string | null) {
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
  startAt?: string | null,
  endAt?: string | null
) {
  return normalizeBookingUnit(bookingUnit) || inferBookingUnitFromRange(startAt, endAt);
}

function normalizeBookingRange(
  bookingUnit: string | null,
  startAt: string,
  endAt: string
) {
  const resolvedUnit = resolveBookingUnit(bookingUnit, startAt, endAt);
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (resolvedUnit === "day") {
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

  if (resolvedUnit === "month") {
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

function getOwnerPreviewBarClass(status?: string | null, requested = false) {
  if (requested) return "bg-pink-500 text-white";

  if (status === "expired") {
    return "bg-amber-600 text-white";
  }

  if (
    status === "approved" ||
    status === "accepted_awaiting_payment" ||
    status === "awaiting_payment"
  ) {
    return "bg-blue-500 text-white";
  }

  if (
    status === "paid_confirmed" ||
    status === "confirmed" ||
    status === "completed"
  ) {
    return "bg-green-500 text-white";
  }

  return "bg-gray-400 text-white";
}

/** When true, this booking is treated as calendar inventory — show green on "Existing", not pink on "Requested". */
export function shouldShowCurrentBookingAsExisting(
  status?: string | null,
  paymentStatus?: string | null
): boolean {
  if (!status) return false;
  if (status === "declined" || status === "expired") return false;
  if (status === "pending" || status === "pending_owner") return false;
  if (status === "paid_confirmed" || status === "confirmed" || status === "completed") {
    return true;
  }
  if (paymentStatus === "paid" || paymentStatus === "paid_confirmed") {
    return true;
  }
  return false;
}

function getExistingRowBarLabel(item: SharedBlockingBooking): string {
  if (item.status === "pending" || item.status === "pending_owner") return "Pending";

  const paid =
    item.payment_status === "paid" || item.payment_status === "paid_confirmed";

  if (
    paid &&
    item.status !== "paid_confirmed" &&
    item.status !== "confirmed" &&
    item.status !== "completed"
  ) {
    return "Payment received";
  }

  if (
    item.status === "approved" ||
    item.status === "accepted_awaiting_payment" ||
    item.status === "awaiting_payment"
  ) {
    return "Awaiting payment";
  }

  return "Confirmed";
}

function getExistingRowBarClass(item: SharedBlockingBooking): string {
  if (item.status === "pending" || item.status === "pending_owner") {
    return "bg-yellow-500 text-white";
  }

  const paid =
    item.payment_status === "paid" || item.payment_status === "paid_confirmed";

  if (
    paid ||
    item.status === "paid_confirmed" ||
    item.status === "confirmed" ||
    item.status === "completed"
  ) {
    return "bg-green-500 text-white";
  }

  if (item.status === "expired") {
    return "bg-amber-600 text-white";
  }

  if (
    item.status === "approved" ||
    item.status === "accepted_awaiting_payment" ||
    item.status === "awaiting_payment"
  ) {
    return "bg-blue-500 text-white";
  }

  return getOwnerPreviewBarClass(item.status);
}

type Props = {
  bookingUnit: string | null;
  requestedStart: string;
  requestedEnd: string;
  requestedStatus?: string | null;
  /** Used with requestedStatus so paid / confirmed bookings render on the Existing row. */
  requestedPaymentStatus?: string | null;
  existingBookings: SharedBlockingBooking[];
  pendingBookings: SharedBlockingBooking[];
  blockedDates: SharedBlockedDate[];
};

export default function OwnerBookingRequestTimeline({
  bookingUnit,
  requestedStart,
  requestedEnd,
  requestedStatus,
  requestedPaymentStatus,
  existingBookings,
  pendingBookings,
  blockedDates,
}: Props) {
  const resolvedBookingUnit = resolveBookingUnit(
    bookingUnit,
    requestedStart,
    requestedEnd
  );

  const requested = normalizeBookingRange(
    resolvedBookingUnit,
    requestedStart,
    requestedEnd
  );

  const columns: OwnerTimelineColumn[] = (() => {
    if (resolvedBookingUnit === "month") {
      const start = new Date(
        Date.UTC(
          requested.start.getUTCFullYear(),
          requested.start.getUTCMonth() - 2,
          1
        )
      );

      return Array.from({ length: 8 }).map((_, index) => {
        const date = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1)
        );

        return {
          key: `${date.getUTCFullYear()}-${date.getUTCMonth()}`,
          label: date.toLocaleDateString("en-ZA", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }),
          start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
          end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)),
        };
      });
    }

    if (resolvedBookingUnit === "hour") {
      const start = new Date(requested.start);
      start.setUTCMinutes(0, 0, 0);
      start.setUTCHours(start.getUTCHours() - 2);

      return Array.from({ length: 12 }).map((_, index) => {
        const slotStart = new Date(start);
        slotStart.setUTCHours(start.getUTCHours() + index);

        const slotEnd = new Date(slotStart);
        slotEnd.setUTCHours(slotStart.getUTCHours() + 1);

        return {
          key: slotStart.toISOString(),
          label: slotStart.toLocaleTimeString("en-ZA", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC",
          }),
          start: slotStart,
          end: slotEnd,
        };
      });
    }

    const start = new Date(
      Date.UTC(
        requested.start.getUTCFullYear(),
        requested.start.getUTCMonth(),
        requested.start.getUTCDate() - 2
      )
    );

    return Array.from({ length: 12 }).map((_, index) => {
      const date = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate() + index
        )
      );

      return {
        key: date.toISOString(),
        label: date.toLocaleDateString("en-ZA", {
          weekday: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        start: new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
        ),
        end: new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
        ),
      };
    });
  })();

  function getSegment(rangeStart: Date, rangeEnd: Date) {
    let first = -1;
    let last = -1;

    columns.forEach((col, index) => {
      const overlaps = rangeStart < col.end && rangeEnd > col.start;
      if (overlaps && first === -1) first = index;
      if (overlaps) last = index;
    });

    if (first === -1 || last === -1) return null;

    return {
      left: `${(first / columns.length) * 100}%`,
      width: `${((last - first + 1) / columns.length) * 100}%`,
    };
  }

  const requestedSegment = getSegment(requested.start, requested.end);

  const showCurrentAsExisting = shouldShowCurrentBookingAsExisting(
    requestedStatus,
    requestedPaymentStatus
  );

  const currentBookingAsExisting: SharedBlockingBooking | null = showCurrentAsExisting
    ? {
        id: "__current_booking__",
        space_id: "",
        booking_unit: bookingUnit,
        start_at: requestedStart,
        end_at: requestedEnd,
        status: requestedStatus ?? null,
        payment_status: requestedPaymentStatus ?? null,
      }
    : null;

  function renderExistingRow(
    items: SharedBlockingBooking[],
    options?: { withTopBorder?: boolean }
  ) {
    return (
      <OwnerTimelineRow
        label="Existing"
        columns={columns}
        bookingUnit={resolvedBookingUnit}
        withTopBorder={options?.withTopBorder ?? true}
      >
        {items.map((item) => {
          const itemBookingUnit = resolveBookingUnit(
            item.booking_unit,
            item.start_at,
            item.end_at
          );
          const normalized = normalizeBookingRange(
            itemBookingUnit,
            item.start_at,
            item.end_at
          );
          const segment = getSegment(normalized.start, normalized.end);
          if (!segment) return null;

          const labelText = getExistingRowBarLabel(item);
          const barClass = getExistingRowBarClass(item);

          return (
            <OwnerTimelineBar
              key={item.id}
              label={labelText}
              className={barClass}
              style={{
                left: `calc(${segment.left} + 4px)`,
                width: `calc(${segment.width} - 8px)`,
              }}
              kind="booking"
            />
          );
        })}

        {blockedDates.map((item) => {
          const normalized = normalizeBookingRange(
            resolvedBookingUnit === "month" ? "month" : "day",
            item.start_at,
            item.end_at
          );
          const segment = getSegment(normalized.start, normalized.end);
          if (!segment) return null;

          return (
            <OwnerTimelineBar
              key={item.id}
              label="Blocked"
              className="text-white"
              style={{
                left: `calc(${segment.left} + 4px)`,
                width: `calc(${segment.width} - 8px)`,
              }}
              kind="blocked"
            />
          );
        })}
      </OwnerTimelineRow>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[720px] overflow-hidden rounded-md border border-gray-200 bg-white">
        <OwnerTimelineHeader columns={columns} bookingUnit={resolvedBookingUnit} />
        {!showCurrentAsExisting && (
          <OwnerTimelineRow
            label="Requested"
            columns={columns}
            bookingUnit={resolvedBookingUnit}
            withTopBorder={false}
          >
            {requestedSegment && (
              <OwnerTimelineBar
                label={requestedStatus === "declined" ? "Declined" : "Requested"}
                className={getOwnerPreviewBarClass(requestedStatus, true)}
                style={{
                  left: `calc(${requestedSegment.left} + 4px)`,
                  width: `calc(${requestedSegment.width} - 8px)`,
                }}
                kind="booking"
              />
            )}
          </OwnerTimelineRow>
        )}

        {renderExistingRow(
          [
            ...(currentBookingAsExisting ? [currentBookingAsExisting] : []),
            ...existingBookings,
            ...pendingBookings,
          ],
          { withTopBorder: !showCurrentAsExisting }
        )}
      </div>
    </div>
  );
}