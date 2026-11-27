"use client";

import OwnerCalendarLegend from "@/app/dashboard/_components/calendar/OwnerCalendarLegend";
import RestrictionExceptionPanel from "@/app/dashboard/_components/calendar/RestrictionExceptionPanel";
import SeriesManagementPanel from "@/app/dashboard/_components/calendar/SeriesManagementPanel";
import RecurringBookingRequest from "@/app/components/RecurringBookingRequest";
import type { AvailabilityRule } from "@/lib/availability-rules";

const sessions = [
  { id: "session-1", date: "2027-01-04", startAt: "2027-01-04T14:00:00.000Z", endAt: "2027-01-04T16:00:00.000Z", excluded: false },
  { id: "session-2", date: "2027-01-11", startAt: "2027-01-11T14:00:00.000Z", endAt: "2027-01-11T16:00:00.000Z", excluded: false },
  { id: "session-3", date: "2027-02-01", startAt: "2027-02-01T14:00:00.000Z", endAt: "2027-02-01T16:00:00.000Z", excluded: true },
];

const audit = [
  {
    id: "event-1",
    actor_role: "manager",
    change_scope: "occurrence",
    action: "reschedule",
    reason: "Same length, later the same day",
    financial_effect: "Paid total unchanged",
    agreement_status: "Waiting for the renter",
    notice_text: "No customer email was sent.",
    created_at: "2026-11-26T08:40:00.000Z",
  },
  {
    id: "event-2",
    actor_role: "renter",
    change_scope: "occurrence",
    action: "accept",
    reason: "Accepted the proposed time",
    financial_effect: "Paid total unchanged",
    agreement_status: "Accepted",
    notice_text: "No customer email was sent.",
    created_at: "2026-11-26T08:44:00.000Z",
  },
];

const saturdayRule: AvailabilityRule = {
  id: "rule-saturday",
  spaceId: "space-hall",
  reason: "School hall",
  weekdays: [6],
  wholeDay: false,
  localStart: "08:00",
  localEnd: "12:00",
  startsOn: "2027-01-02",
  endsOn: null,
};

export default function SeriesManagementPreviewPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 bg-[#f6f7f8] p-6 text-[#192a3a]">
      <p className="text-xs uppercase tracking-[0.14em] text-gray-500">
        Sample data only. This page does not read or write bookings, payments, or restrictions.
      </p>
      <h1 className="text-2xl font-semibold">Recurring series management</h1>

      <section id="calendar-mix" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Calendar across booking periods</h2>
        <OwnerCalendarLegend />
        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs">
          {["Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8", "Sat 9", "Sun 10"].map((label) => (
            <div key={label} className="font-medium text-gray-500">{label}</div>
          ))}
          <div className="rounded bg-indigo-700 p-2 text-white">Recurring session 14:00</div>
          <div className="rounded bg-emerald-500 p-2 text-white">Hourly booking</div>
          <div className="rounded bg-emerald-700 p-2 text-white">Daily booking</div>
          <div className="rounded bg-emerald-700 p-2 text-white">Weekly booking</div>
          <div className="rounded bg-emerald-700 p-2 text-white">Quarter</div>
          <div className="rounded border border-emerald-700 bg-white p-2 text-emerald-900">Opened Saturday</div>
          <div className="rounded bg-amber-700 p-2 text-white">Sunday block</div>
        </div>
      </section>

      <section id="occurrence" className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <h2 className="mb-2 text-lg font-semibold">One recurring session</h2>
        <p>Monday 4 January 2027, 14:00–16:00. Parent booking stays the payment record. The days between Mondays stay available.</p>
      </section>

      <section id="dialog">
        <SeriesManagementPanel
          bookingId="preview-booking"
          occurrenceId="session-1"
          occurrenceStart="2027-01-04T14:00:00.000Z"
          occurrenceEnd="2027-01-04T16:00:00.000Z"
          preview={{ sessions, events: [], notice: null, conflict: null, paidProtection: null }}
        />
      </section>

      <section id="available">
        <SeriesManagementPanel
          bookingId="preview-available"
          occurrenceId="session-1"
          occurrenceStart="2027-01-04T16:00:00.000Z"
          occurrenceEnd="2027-01-04T18:00:00.000Z"
          preview={{
            sessions,
            events: [],
            notice: "16:00–18:00 is free. A paid booking asks the renter to accept before the calendar changes.",
            conflict: null,
            paidProtection: null,
          }}
        />
      </section>

      <section id="conflict">
        <SeriesManagementPanel
          bookingId="preview-conflict"
          occurrenceId="session-1"
          occurrenceStart="2027-02-01T14:00:00.000Z"
          occurrenceEnd="2027-02-01T16:00:00.000Z"
          preview={{
            sessions,
            events: [],
            notice: null,
            conflict: "That time overlaps another booking. The original session was kept.",
            paidProtection: null,
          }}
        />
      </section>

      <section id="paid">
        <SeriesManagementPanel
          bookingId="preview-paid"
          occurrenceId="session-2"
          occurrenceStart="2027-01-11T14:00:00.000Z"
          occurrenceEnd="2027-01-11T16:00:00.000Z"
          preview={{
            sessions,
            events: [],
            notice: null,
            conflict: null,
            paidProtection: "Cancelling this paid session would change the amount already paid. FindMySpace cannot refund or credit that amount in this release, so the session stays in place.",
          }}
        />
      </section>

      <section id="exception" className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h2 className="mb-2 text-lg font-semibold">Saturday restriction</h2>
        <p className="mb-3 text-sm">Every Saturday, 08:00–12:00, with no end date. 9 January 2027 can be opened without deleting the rule. 16 January stays blocked.</p>
        <RestrictionExceptionPanel
          spaceId="space-hall"
          rule={saturdayRule}
          occurrenceStart="2027-01-09T06:00:00.000Z"
          preview
        />
      </section>

      <section id="opened-calendar" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">One opened date inside the restriction</h2>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded bg-amber-700 p-3 text-white">Sat 2 Jan blocked</div>
          <div className="rounded border border-emerald-700 bg-white p-3 text-emerald-900">Sat 9 Jan open</div>
          <div className="rounded bg-amber-700 p-3 text-white">Sat 16 Jan blocked</div>
        </div>
      </section>

      <section id="audit">
        <SeriesManagementPanel
          bookingId="preview-audit"
          occurrenceId="session-2"
          occurrenceStart="2027-01-11T14:00:00.000Z"
          occurrenceEnd="2027-01-11T16:00:00.000Z"
          preview={{ sessions, events: audit, notice: null, conflict: null, paidProtection: null }}
        />
      </section>

      <section id="quote" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Server-checked quote</h2>
        <RecurringBookingRequest
          hourlyRate={250}
          serverState="ready"
          serverQuote={{
            summary: "Every Monday, 14:00–16:00",
            includedCount: 12,
            hoursPerSession: 2,
            totalHours: 24,
            hourlyRate: 250,
            sessionPrice: 500,
            rentalSubtotal: 6000,
            conflicts: ["2027-02-01"],
          }}
          unavailableDates={["2027-02-01"]}
        />
      </section>
    </main>
  );
}
