"use client";

import { useMemo, useState } from "react";
import AvailabilityBlockDialog from "@/app/components/AvailabilityBlockDialog";
import {
  describeAvailabilityRule,
  expandAvailabilityRule,
  type AvailabilityRule,
} from "@/lib/availability-rules";
import { johannesburgLocalToUtc, parseCivilDate } from "@/lib/booking-periods";

const CLASSROOM: AvailabilityRule = {
  id: "11111111-1111-4111-8111-111111111111",
  spaceId: "9f9f8700-0fa2-4086-87d7-7a58e1b2ff18",
  reason: "School day",
  weekdays: [1, 2, 3, 4, 5],
  wholeDay: false,
  localStart: "08:00",
  localEnd: "15:00",
  startsOn: "2027-01-01",
  endsOn: null,
};

function monthCells(rule: AvailabilityRule, monthStart: string) {
  const start = parseCivilDate(monthStart);
  if (!start) return [];
  const windowStart = johannesburgLocalToUtc(start, 0, 0);
  const next = start.month === 12
    ? johannesburgLocalToUtc({ year: start.year + 1, month: 1, day: 1 }, 0, 0)
    : johannesburgLocalToUtc({ year: start.year, month: start.month + 1, day: 1 }, 0, 0);
  const hits = new Set(
    expandAvailabilityRule(rule, windowStart, next).map((item) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Johannesburg",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(item.start)
    )
  );
  const days = new Date(Date.UTC(start.year, start.month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const key = `${monthStart.slice(0, 7)}-${day}`;
    return { day: index + 1, blocked: hits.has(key) };
  });
}

export default function AvailabilityRulesPreviewPage() {
  const [open, setOpen] = useState(true);
  const [reason, setReason] = useState("School day");
  const january2027 = useMemo(() => monthCells(CLASSROOM, "2027-01-01"), []);
  const january2030 = useMemo(() => monthCells(CLASSROOM, "2030-01-01"), []);

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-8 text-[#192a3a]">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Organisation admin · Calendar
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Block availability</h1>
          <p className="mt-2 text-sm text-gray-600">
            This is the dialog opened from the host calendar. It does not save to a database.
          </p>
          <div className="mt-4 max-w-lg">
            <AvailabilityBlockDialog
              embedded
              open={open}
              spaceTitle="School classroom"
              saving={false}
              error=""
              onceStart="2027-01-04"
              onceEnd="2027-01-04"
              onceInputType="date"
              reason={reason}
              onReasonChange={setReason}
              onOnceStartChange={() => undefined}
              onOnceEndChange={() => undefined}
              onClose={() => setOpen(false)}
              onSaveOnce={() => undefined}
              onSaveRecurring={() => undefined}
              editingRule={CLASSROOM}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Calendar</p>
          <h2 className="mt-1 text-xl font-semibold">January 2027</h2>
          <p className="mt-2 text-sm text-gray-600">{describeAvailabilityRule(CLASSROOM)}</p>
          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-sm">
            {january2027.map((cell) => (
              <div
                key={cell.day}
                className={
                  cell.blocked
                    ? "rounded-md bg-[repeating-linear-gradient(135deg,#b45309_0px,#b45309_8px,#78350f_8px,#78350f_16px)] px-2 py-3 text-white"
                    : "rounded-md border border-gray-200 px-2 py-3"
                }
              >
                {cell.day}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Indefinite rule</p>
          <h2 className="mt-1 text-xl font-semibold">January 2030</h2>
          <p className="mt-2 text-sm text-gray-600">
            {january2030.filter((cell) => cell.blocked).length} weekdays remain blocked. The rule is still one record.
          </p>
          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-sm">
            {january2030.map((cell) => (
              <div
                key={cell.day}
                className={
                  cell.blocked
                    ? "rounded-md bg-[repeating-linear-gradient(135deg,#b45309_0px,#b45309_8px,#78350f_8px,#78350f_16px)] px-2 py-3 text-white"
                    : "rounded-md border border-gray-200 px-2 py-3"
                }
              >
                {cell.day}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 lg:col-span-2">
          <h2 className="text-lg font-semibold">Booking conflict</h2>
          <p className="mt-2">
            This restriction overlaps a confirmed booking from 2027-02-02 09:00 to 2027-02-02 11:00 SAST.
          </p>
          <p className="mt-2">
            A renter requesting 10:00–11:00 on Monday 4 January 2027 sees: These dates or times are not available. {describeAvailabilityRule(CLASSROOM)}
          </p>
        </section>
      </div>
    </main>
  );
}
