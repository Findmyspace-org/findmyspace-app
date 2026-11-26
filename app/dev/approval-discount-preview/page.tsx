"use client";

import { useState } from "react";
import AvailabilityBlockDialog from "@/app/components/AvailabilityBlockDialog";
import DayAvailabilityCalendar from "@/app/components/DayAvailabilityCalendar";
import HourAvailabilitySelector from "@/app/components/HourAvailabilitySelector";
import BookingDiscountSummary from "@/app/components/BookingDiscountSummary";
import RestrictionExceptionPanel from "@/app/dashboard/_components/calendar/RestrictionExceptionPanel";
import { ApprovalDiscountFields } from "@/app/dashboard/_components/ApprovalDiscountFields";
import type { AvailabilityRule } from "@/lib/availability-rules";

const mondaySession = {
  id: "sample-monday",
  booking_unit: "recurring_hour",
  start_at: "2027-01-04T12:00:00.000Z",
  end_at: "2027-01-04T14:00:00.000Z",
  status: "confirmed",
};

const tuesdayOpen = {
  id: "sample-block",
  space_id: "sample-space",
  start_at: "2027-01-05T07:00:00.000Z",
  end_at: "2027-01-05T09:00:00.000Z",
  reason: null,
};

const saturdayRule: AvailabilityRule = {
  id: "sample-rule",
  spaceId: "sample-space",
  reason: null,
  weekdays: [6],
  wholeDay: false,
  localStart: "09:00",
  localEnd: "12:00",
  startsOn: "2027-01-02",
  endsOn: null,
};

export default function ApprovalDiscountPreviewPage() {
  const [dayStart, setDayStart] = useState("2027-01-06");
  const [dayEnd, setDayEnd] = useState("2027-01-08");
  const [hourStart, setHourStart] = useState("");
  const [hourEnd, setHourEnd] = useState("");

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        Sample data only. This page does not sign anyone in, write a booking, take a payment, or read production records.
      </p>

      <section id="guest-day" className="rounded-xl border border-gray-200 bg-white p-4">
        <h1 className="mb-2 text-lg font-semibold text-[#192a3a]">Guest date selection</h1>
        <p className="mb-3 text-sm text-gray-600">The existing day calendar. Monday 14:00–16:00 is occupied. Tuesday morning is blocked. Other days stay selectable.</p>
        <DayAvailabilityCalendar
          existingBookings={[mondaySession]}
          blockedDates={[tuesdayOpen]}
          dayStart={dayStart}
          dayEnd={dayEnd}
          onChange={(start, end) => {
            setDayStart(start);
            setDayEnd(end);
          }}
        />
        <p className="mt-3 text-sm">Selected range: {dayStart || "none"} to {dayEnd || "none"}</p>
      </section>

      <section id="guest-hour" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Guest hourly slot</h2>
        <HourAvailabilitySelector
          selectedDate="2027-01-04"
          existingBookings={[mondaySession]}
          blockedDates={[]}
          onChange={(start, end) => {
            setHourStart(start);
            setHourEnd(end);
          }}
        />
        <p className="mt-3 text-sm">Selected slot: {hourStart || "none"} to {hourEnd || "none"}</p>
      </section>

      <section id="guest-request" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">From the calendar to a request</h2>
        <p className="text-sm text-[#192a3a]">Date: 6 January 2027 to 8 January 2027</p>
        <p className="text-sm text-[#192a3a]">Time: {hourStart || "09:00"} to {hourEnd || "11:00"}</p>
        <p className="text-sm text-[#192a3a]">Price shown to the guest: R1,500.00</p>
        <button type="button" className="mt-3 rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white">Continue to booking request</button>
      </section>

      <section id="host-once" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Host blocks a selected time</h2>
        <AvailabilityBlockDialog
          open
          embedded
          spaceTitle="Sample classroom"
          saving={false}
          error=""
          onceStart="2027-01-06T09:00"
          onceEnd="2027-01-06T11:00"
          onceInputType="datetime-local"
          reason=""
          onReasonChange={() => undefined}
          onOnceStartChange={() => undefined}
          onOnceEndChange={() => undefined}
          onClose={() => undefined}
          onSaveOnce={() => undefined}
          onSaveRecurring={() => undefined}
        />
      </section>

      <section id="host-recurring" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Host recurring block</h2>
        <AvailabilityBlockDialog
          open
          embedded
          editingRule={saturdayRule}
          spaceTitle="Sample classroom"
          saving={false}
          error=""
          onceStart="2027-01-09T09:00"
          onceEnd="2027-01-09T12:00"
          onceInputType="datetime-local"
          reason=""
          onReasonChange={() => undefined}
          onOnceStartChange={() => undefined}
          onOnceEndChange={() => undefined}
          onClose={() => undefined}
          onSaveOnce={() => undefined}
          onSaveRecurring={() => undefined}
        />
      </section>

      <section id="guest-restricted" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Guest calendar after the host block</h2>
        <p className="mb-3 text-sm text-gray-600">The blocked interval is shown without the host&apos;s private reason.</p>
        <DayAvailabilityCalendar
          existingBookings={[]}
          blockedDates={[tuesdayOpen]}
          dayStart=""
          dayEnd=""
          onChange={() => undefined}
        />
      </section>

      <section id="host-exception" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Open one occurrence</h2>
        <RestrictionExceptionPanel
          preview
          spaceId="sample-space"
          rule={saturdayRule}
          occurrenceStart="2027-01-09T07:00:00.000Z"
        />
      </section>

      <section id="approve-plain" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Approve without a discount</h2>
        <p className="mb-3 text-sm">Original booking amount: R6,000.00. Leave the discount off.</p>
        <ApprovalDiscountFields originalAmount={6000} platformFee={900} onChange={() => undefined} />
        <button type="button" className="mt-3 rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white">Approve &amp; request payment</button>
      </section>

      <section id="approve-percent" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Percentage discount</h2>
        <ApprovalDiscountFields originalAmount={6000} platformFee={900} onChange={() => undefined} />
      </section>

      <section id="approve-fixed" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Fixed discount</h2>
        <p className="text-sm">Original booking amount: R2,000.00</p>
        <p className="text-sm">Host discount: R500.00</p>
        <p className="text-sm">Approved rental amount: R1,500.00</p>
        <p className="text-sm">FindMySpace fee: R225.00</p>
        <p className="text-sm">Expected host payout: R1,275.00</p>
        <p className="text-sm font-medium">Amount payable by the renter: R1,500.00</p>
      </section>

      <section id="renter-amount" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Renter payment request</h2>
        <BookingDiscountSummary
          bookingId="sample"
          preview={{ originalAmount: 6000, discountAmount: 1200, payableAmount: 4800 }}
        />
      </section>

      <section id="payment-protection" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">When a discount cannot be applied</h2>
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          The amount payable must be at least R5.00. A free booking cannot be sent to PayFast in this release. A discount also cannot change a booking after checkout has started or after it has been paid.
        </p>
      </section>

      <section id="discount-audit" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-[#192a3a]">Discount audit</h2>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="rounded-md border border-gray-200 p-3">
            <p className="font-medium text-[#192a3a]">26 November 2026, 14:10 SAST · sample administrator</p>
            <p>Percentage 20. Discount R1,200.00. Original rental R6,000.00. Approved rental R4,800.00.</p>
            <p>Reason: School term. Fee R720.00. Host payout R4,080.00.</p>
          </li>
        </ul>
      </section>
    </main>
  );
}
