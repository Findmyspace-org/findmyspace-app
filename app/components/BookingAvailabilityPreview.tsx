"use client";

type BlockingBooking = {
  id: string;
  start_at: string;
  end_at: string;
};

type Props = {
  bookingUnit: string | null;
  requestedStart: string;
  requestedEnd: string;
  existingBookings: BlockingBooking[];
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("T")[0].split("-").map(Number);
  return { year, month, day };
}

function startOfDayFromString(value: string) {
  const { year, month, day } = parseDateOnly(value);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function startOfNextDayFromString(value: string) {
  const { year, month, day } = parseDateOnly(value);
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfNextMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function monthIndexFromString(value: string) {
  const { year, month } = parseDateOnly(value);
  return year * 12 + (month - 1);
}

function monthIndexFromDate(d: Date) {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function formatMonth(d: Date) {
  return d.toLocaleDateString([], {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDay(d: Date) {
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function getBlock(state: "available" | "booked" | "requested") {
  const base =
    "flex h-[52px] items-center justify-center rounded-md border px-1 text-[10px] text-center leading-tight";

  if (state === "booked") {
    return `${base} border-red-300 bg-red-100 text-red-700`;
  }

  if (state === "requested") {
    return `${base} border-[#192a3a] bg-[#192a3a] text-white`;
  }

  return `${base} border-gray-200 bg-gray-100 text-gray-700`;
}

export default function BookingAvailabilityPreview({
  bookingUnit,
  requestedStart,
  requestedEnd,
  existingBookings,
}: Props) {
  const start = new Date(requestedStart);
  const end = new Date(requestedEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const legend = (
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-600">
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm border border-red-300 bg-red-100" />
        Booked
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm bg-[#192a3a]" />
        Requested
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm border border-gray-200 bg-gray-100" />
        Available
      </span>
    </div>
  );

  if (bookingUnit === "hour") {
    const baseDay = new Date(start);

    const slots = Array.from({ length: 48 }, (_, i) => {
      const hour = Math.floor(i / 2);
      const minute = i % 2 === 0 ? 0 : 30;

      const label = `${String(hour).padStart(2, "0")}:${minute === 0 ? "00" : "30"}`;

      const s = new Date(
        Date.UTC(
          baseDay.getUTCFullYear(),
          baseDay.getUTCMonth(),
          baseDay.getUTCDate(),
          hour,
          minute,
          0,
          0
        )
      );

      const e = new Date(s);
      e.setMinutes(e.getMinutes() + 30);

      const isBooked = existingBookings.some((b) =>
        overlaps(s, e, new Date(b.start_at), new Date(b.end_at))
      );

      const isRequested = overlaps(s, e, start, end);

      let state: "available" | "booked" | "requested" = "available";
      let text = "Available";

      if (isBooked) {
        state = "booked";
        text = "Booked";
      }

      if (isRequested) {
        state = "requested";
        text = "Requested";
      }

      return {
        key: i,
        label,
        text,
        className: getBlock(state),
      };
    });

    const row1 = slots.slice(0, 24);
    const row2 = slots.slice(24);

    return (
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium">Requested time</p>
        {legend}

        <div className="space-y-1">
          {[row1, row2].map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-6 gap-1 md:grid-cols-8 xl:grid-cols-12 2xl:grid-cols-24"
            >
              {row.map((slot) => (
                <div key={slot.key} className={slot.className}>
                  <div>
                    <div className="font-medium">{slot.label}</div>
                    <div className="text-[9px] opacity-70">{slot.text}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (bookingUnit === "month") {
    const requestedStartMonthIndex = monthIndexFromString(requestedStart);
    const requestedEndExclusiveMonthIndex = monthIndexFromString(requestedEnd);

    const startMonth = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0, 0)
    );

    const months = Array.from({ length: 12 }, (_, i) => {
      return new Date(
        Date.UTC(
          startMonth.getUTCFullYear(),
          startMonth.getUTCMonth() + i,
          1,
          0,
          0,
          0,
          0
        )
      );
    });

    return (
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium">Requested months</p>
        {legend}

        <div className="grid grid-cols-12 gap-1">
          {months.map((m, i) => {
            const monthIndex = monthIndexFromDate(m);
            const mStart = startOfMonth(m);
            const mEnd = startOfNextMonth(m);

            const isBooked = existingBookings.some((b) =>
              overlaps(mStart, mEnd, new Date(b.start_at), new Date(b.end_at))
            );

            const isRequested =
              monthIndex >= requestedStartMonthIndex &&
              monthIndex < requestedEndExclusiveMonthIndex;

            let state: "available" | "booked" | "requested" = "available";
            let text = "Available";

            if (isBooked) {
              state = "booked";
              text = "Booked";
            }

            if (isRequested) {
              state = "requested";
              text = "Requested";
            }

            return (
              <div key={i} className={getBlock(state)}>
                <div>
                  <div className="font-medium">{formatMonth(m)}</div>
                  <div className="text-[9px] opacity-70">{text}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const days = Array.from({ length: 21 }, (_, i) => {
    return new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() - 3 + i,
        0,
        0,
        0,
        0
      )
    );
  });

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium">Requested dates</p>
      {legend}

      <div className="grid grid-cols-6 gap-1 md:grid-cols-8 xl:grid-cols-12">
        {days.map((d, i) => {
          const yyyy = d.getUTCFullYear();
          const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(d.getUTCDate()).padStart(2, "0");
          const dayKey = `${yyyy}-${mm}-${dd}`;

          const dStart = startOfDayFromString(dayKey);
          const dEnd = startOfNextDayFromString(dayKey);

          const isBooked = existingBookings.some((b) =>
            overlaps(dStart, dEnd, new Date(b.start_at), new Date(b.end_at))
          );

          const isRequested = overlaps(dStart, dEnd, start, end);

          let state: "available" | "booked" | "requested" = "available";
          let text = "Available";

          if (isBooked) {
            state = "booked";
            text = "Booked";
          }

          if (isRequested) {
            state = "requested";
            text = "Requested";
          }

          return (
            <div key={i} className={getBlock(state)}>
              <div>
                <div className="font-medium">{formatDay(d)}</div>
                <div className="text-[9px] opacity-70">{text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}