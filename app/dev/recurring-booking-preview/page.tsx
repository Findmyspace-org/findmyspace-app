"use client";

import { useMemo, useState } from "react";
import RecurringBookingRequest from "@/app/components/RecurringBookingRequest";
import RecurringBookingsSetting from "@/app/components/RecurringBookingsSetting";
import RecurringSeriesSummary from "@/app/components/RecurringSeriesSummary";
import BookingRequestForm from "@/app/components/BookingRequestForm";
import {
  generateRecurringSessions,
  quoteRecurringBooking,
  type RecurringPattern,
} from "@/lib/recurring-bookings";

const HOUR_RATE = 250;
const PATTERN: RecurringPattern = {
  frequency: "weekly",
  weekdays: [1],
  localStart: "14:00",
  localEnd: "16:00",
  startsOn: "2027-01-04",
  endsOn: "2027-03-22",
  excludedDates: ["2027-01-18"],
};
const WEEKDAY_PATTERN: RecurringPattern = {
  frequency: "weekly",
  weekdays: [2, 4],
  localStart: "15:00",
  localEnd: "17:00",
  startsOn: "2027-01-05",
  endsOn: "2027-02-04",
  excludedDates: [],
};

function monthGrid(year: number, month: number, marked: Map<string, string>) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ label: string; tone: string }> = [];
  for (let i = 0; i < startOffset; i += 1) cells.push({ label: "", tone: "" });
  for (let day = 1; day <= days; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ label: String(day), tone: marked.get(iso) || "bg-white" });
  }
  return cells;
}

export default function RecurringBookingPreviewPage() {
  const [enabled, setEnabled] = useState(true);
  const [maxOccurrences, setMaxOccurrences] = useState("");
  const quote = quoteRecurringBooking({ pattern: PATTERN, hourlyRate: HOUR_RATE });
  const sessions = useMemo(() => generateRecurringSessions(PATTERN), []);
  const marked = new Map<string, string>();
  for (const session of sessions) {
    marked.set(session.date, session.excluded ? "bg-gray-200" : "bg-indigo-700 text-white");
  }
  marked.set("2027-01-05", "bg-green-600 text-white");
  marked.set("2027-01-12", "bg-gray-400 text-white");
  const cells = monthGrid(2027, 1, marked);
  const summarySessions =
    quote.ok
      ? quote.quote.sessions.map((session) => ({
          date: session.date,
          startLabel: "14:00",
          endLabel: "16:00",
          excluded: session.excluded,
        }))
      : [];

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-8 text-[#192a3a]">
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Create a space</p>
          <h1 className="mt-1 text-2xl font-semibold">Recurring bookings stay off</h1>
          <RecurringBookingsSetting
            enabled={false}
            maxOccurrences=""
            hourlyRate={null}
            unavailableReason="Recurring sessions need an hourly price. Add one without changing the listing's current booking period."
            onEnabledChange={() => undefined}
            onMaxOccurrencesChange={() => undefined}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Edit an existing space</p>
          <h1 className="mt-1 text-2xl font-semibold">Allow recurring bookings</h1>
          <RecurringBookingsSetting
            enabled={enabled}
            maxOccurrences={maxOccurrences}
            hourlyRate={HOUR_RATE}
            unavailableReason={null}
            onEnabledChange={setEnabled}
            onMaxOccurrencesChange={setMaxOccurrences}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Renter</p>
          <h1 className="mt-1 text-2xl font-semibold">Monday afternoons</h1>
          <BookingRequestForm
            spaceId="preview-recurring"
            bookingUnit="hour"
            pricePerHour={HOUR_RATE}
            pricePerDay={null}
            pricePerMonth={null}
            flexibleRates={[{ period: "hour", amount: HOUR_RATE }]}
            recurringBookingsEnabled
            demonstration
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Several weekdays</p>
          <h1 className="mt-1 text-2xl font-semibold">Tuesday and Thursday</h1>
          <RecurringBookingRequest
            hourlyRate={HOUR_RATE}
            feePercent={15}
            idPrefix="weekdays"
            initialPattern={WEEKDAY_PATTERN}
            unavailableDates={["2027-01-14"]}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Host approval</p>
          <h1 className="mb-3 mt-1 text-2xl font-semibold">One request for the series</h1>
          <RecurringSeriesSummary
            renterName="Example renter"
            pattern="Every Monday, 14:00–16:00, from 4 January 2027 until 22 March 2027."
            firstSession="2027-01-04 14:00"
            lastSession="2027-03-22 16:00"
            sessionCount={quote.ok ? quote.quote.includedCount : 0}
            hoursPerSession={2}
            hourlyRate={HOUR_RATE}
            rentalSubtotal={quote.ok ? quote.quote.rentalSubtotal : 0}
            feeAmount={quote.ok ? Number((quote.quote.rentalSubtotal * 0.15).toFixed(2)) : null}
            hostPayout={quote.ok ? Number((quote.quote.rentalSubtotal * 0.85).toFixed(2)) : null}
            sessions={summarySessions}
          />
          <div className="mt-4 flex gap-2">
            <button type="button" className="rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white">
              Approve &amp; request payment
            </button>
            <button type="button" className="rounded-md border border-gray-300 px-4 py-2 text-sm">
              Decline
            </button>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Host calendar</p>
          <h1 className="mt-1 text-2xl font-semibold">January 2027</h1>
          <p className="mt-2 text-sm text-gray-700">
            Indigo days are Monday sessions from 14:00 to 16:00. Green is a separate Tuesday booking. Grey is a once-off block. The other days stay open.
          </p>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="py-1 font-medium text-gray-500">{day}</div>
            ))}
            {cells.map((cell, index) => (
              <div key={`${cell.label}-${index}`} className={`min-h-10 rounded border border-gray-200 py-2 ${cell.tone}`}>
                {cell.label}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
