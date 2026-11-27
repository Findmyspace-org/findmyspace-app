"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateBookingCommercials } from "@/lib/commercial-calculator";
import {
  quoteRecurringBooking,
  type RecurringFrequency,
  type RecurringPattern,
  type RecurringQuote,
} from "@/lib/recurring-bookings";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export const SAMPLE_RECURRING_PATTERN: RecurringPattern = {
  frequency: "weekly",
  weekdays: [1],
  localStart: "14:00",
  localEnd: "16:00",
  startsOn: "2027-01-04",
  endsOn: "2027-03-22",
  excludedDates: [],
};

function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort((a, b) => a - b);
}

export default function RecurringBookingRequest({
  hourlyRate,
  minHours = 1,
  maxOccurrences = null,
  unavailableDates = [],
  feePercent = null,
  idPrefix = "recurring",
  initialPattern = SAMPLE_RECURRING_PATTERN,
  onChange,
  serverState = "idle",
  serverQuote = null,
}: {
  hourlyRate: number;
  minHours?: number | null;
  maxOccurrences?: number | null;
  unavailableDates?: string[];
  feePercent?: number | null;
  idPrefix?: string;
  initialPattern?: RecurringPattern;
  onChange?: (pattern: RecurringPattern, quote: RecurringQuote | null) => void;
  serverState?: "idle" | "checking" | "ready" | "error";
  serverQuote?: {
    summary: string;
    includedCount: number;
    hoursPerSession: number;
    totalHours: number;
    hourlyRate: number;
    sessionPrice: number;
    rentalSubtotal: number;
    conflicts: string[];
  } | null;
}) {
  const [pattern, setPattern] = useState<RecurringPattern>(initialPattern);
  const [showSessions, setShowSessions] = useState(true);

  const quoted = useMemo(
    () => quoteRecurringBooking({ pattern, hourlyRate, minHours, maxOccurrences }),
    [pattern, hourlyRate, minHours, maxOccurrences]
  );
  const quote = quoted.ok ? quoted.quote : null;
  const unavailable = new Set([
    ...unavailableDates,
    ...(serverState === "ready" ? serverQuote?.conflicts ?? [] : []),
  ]);
  const shownQuote = serverState === "ready" && serverQuote
    ? {
        summary: serverQuote.summary,
        includedCount: serverQuote.includedCount,
        hoursPerSession: serverQuote.hoursPerSession,
        totalHours: serverQuote.totalHours,
        hourlyRate: serverQuote.hourlyRate,
        sessionPrice: serverQuote.sessionPrice,
        rentalSubtotal: serverQuote.rentalSubtotal,
      }
    : quote
      ? {
          summary: quote.summary,
          includedCount: quote.includedCount,
          hoursPerSession: quote.hoursPerSession,
          totalHours: quote.totalHours,
          hourlyRate: quote.hourlyRate,
          sessionPrice: quote.sessionPrice,
          rentalSubtotal: quote.rentalSubtotal,
        }
      : null;
  const feeBase = shownQuote?.rentalSubtotal ?? quote?.rentalSubtotal;
  const blocking = quote
    ? quote.sessions.filter((session) => !session.excluded && unavailable.has(session.date))
    : [];

  useEffect(() => {
    onChange?.(pattern, quote);
    // The parent only needs the latest quote. Pattern identity is already in state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  function update(next: RecurringPattern) {
    setPattern(next);
    const result = quoteRecurringBooking({ pattern: next, hourlyRate, minHours, maxOccurrences });
    onChange?.(next, result.ok ? result.quote : null);
  }

  function excludeDate(date: string) {
    if (pattern.excludedDates.includes(date)) return;
    update({ ...pattern, excludedDates: [...pattern.excludedDates, date].sort() });
  }

  const commercials =
    feeBase != null && feePercent != null
      ? calculateBookingCommercials(feeBase, {
          model: "commission",
          commissionPercent: feePercent,
          transactionFeePercent: 0,
          accountingMode: "legacy_combined",
        })
      : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-[#192a3a]">How often</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["daily", "Daily"],
              ["weekly", "Weekly"],
              ["fortnightly", "Fortnightly"],
            ] as Array<[RecurringFrequency, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => update({ ...pattern, frequency: value })}
              className={`rounded-md border px-3 py-2 text-sm ${
                pattern.frequency === value
                  ? "border-[#192a3a] bg-[#192a3a] text-white"
                  : "border-gray-300 bg-white text-[#192a3a]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Fortnightly sessions stay in the same weeks as the start date. Tuesday and Thursday in one fortnight are the Tuesday and Thursday of that week, not separate two-week cycles.
        </p>
      </div>

      {pattern.frequency !== "daily" ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-[#192a3a]">Days</p>
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className="rounded-md border border-gray-300 px-2 py-1 text-xs" onClick={() => update({ ...pattern, weekdays: [1, 2, 3, 4, 5] })}>
              Weekdays
            </button>
            <button type="button" className="rounded-md border border-gray-300 px-2 py-1 text-xs" onClick={() => update({ ...pattern, weekdays: [6, 7] })}>
              Weekends
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const selected = pattern.weekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update({ ...pattern, weekdays: toggleDay(pattern.weekdays, day.value) })}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    selected ? "border-[#192a3a] bg-[#192a3a] text-white" : "border-gray-300 bg-white"
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[#192a3a]" htmlFor={`${idPrefix}-start`}>
          Start date
          <input id={`${idPrefix}-start`} type="date" value={pattern.startsOn} onChange={(event) => update({ ...pattern, startsOn: event.target.value })} className="mt-1 w-full rounded-md border-2 border-gray-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-semibold text-[#192a3a]" htmlFor={`${idPrefix}-end`}>
          End date
          <input id={`${idPrefix}-end`} type="date" value={pattern.endsOn} onChange={(event) => update({ ...pattern, endsOn: event.target.value })} className="mt-1 w-full rounded-md border-2 border-gray-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-semibold text-[#192a3a]" htmlFor={`${idPrefix}-from`}>
          Start time
          <input id={`${idPrefix}-from`} type="time" step={1800} value={pattern.localStart} onChange={(event) => update({ ...pattern, localStart: event.target.value })} className="mt-1 w-full rounded-md border-2 border-gray-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-semibold text-[#192a3a]" htmlFor={`${idPrefix}-to`}>
          End time
          <input id={`${idPrefix}-to`} type="time" step={1800} value={pattern.localEnd} onChange={(event) => update({ ...pattern, localEnd: event.target.value })} className="mt-1 w-full rounded-md border-2 border-gray-300 px-3 py-2 font-normal" />
        </label>
      </div>
      <p className="text-xs text-gray-600">Times use Africa/Johannesburg. The end date is required and can be at most 24 months after the start.</p>

      {!quoted.ok ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{quoted.error}</p> : null}

      {serverState === "checking" ? (
        <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">Checking these sessions with the server…</p>
      ) : null}
      {serverState === "error" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">The server could not confirm this schedule. Change it and check again before sending.</p>
      ) : null}
      {shownQuote && quote ? (
        <div className="rounded-md border border-gray-200 bg-[#f8fafb] p-4 text-sm text-gray-800">
          <p><b>Pattern:</b> {shownQuote.summary}</p>
          <p><b>First session:</b> {quote.sessions.find((session) => !session.excluded)?.date} {quote.pattern.localStart}–{quote.pattern.localEnd}</p>
          <p><b>Last session:</b> {[...quote.sessions].reverse().find((session) => !session.excluded)?.date} {quote.pattern.localStart}–{quote.pattern.localEnd}</p>
          <p><b>Sessions:</b> {shownQuote.includedCount}</p>
          <p><b>Hours per session:</b> {shownQuote.hoursPerSession}</p>
          <p><b>Total reserved hours:</b> {shownQuote.totalHours}</p>
          <p><b>Hourly rate:</b> R{shownQuote.hourlyRate.toFixed(2)}</p>
          <p><b>Price per session:</b> R{shownQuote.sessionPrice.toFixed(2)}</p>
          <p><b>Rental subtotal:</b> R{shownQuote.rentalSubtotal.toFixed(2)}</p>
          {serverState === "ready" ? <p className="text-xs text-gray-600">These figures were checked on the server. Sending the request checks them again.</p> : null}
          <p>
            <b>Applicable fee:</b>{" "}
            {commercials
              ? `R${commercials.totalFindmyspaceFee.toFixed(2)} is deducted from the host payout`
              : "FindMySpace fees are deducted from the host payout and are not added to this total."}
          </p>
          {commercials ? <p><b>Host payout:</b> R{commercials.hostEarnings.toFixed(2)}</p> : null}
          <p className="mt-2 text-base font-semibold text-[#192a3a]">Final total: R{quote.rentalSubtotal.toFixed(2)}</p>
        </div>
      ) : null}

      {blocking.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          <p className="font-medium">These sessions are not available. Exclude one to continue, or change the days or dates. Nothing is removed automatically.</p>
          <ul className="mt-2 space-y-2">
            {blocking.map((session) => (
              <li key={session.date} className="flex items-center justify-between gap-3">
                <span>{session.date} {pattern.localStart}–{pattern.localEnd}</span>
                <button type="button" className="rounded-md border border-red-700 px-2 py-1 text-xs" onClick={() => excludeDate(session.date)}>
                  Exclude this session
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {quote ? (
        <div>
          <button type="button" className="text-sm font-medium text-[#192a3a] underline" onClick={() => setShowSessions((open) => !open)}>
            {showSessions ? "Hide" : "Show"} {quote.sessions.length} sessions
          </button>
          {showSessions ? (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm text-gray-800">
              {quote.sessions.map((session) => (
                <li key={session.date}>
                  {session.date} {pattern.localStart}–{pattern.localEnd}
                  {session.excluded ? " · excluded" : unavailable.has(session.date) ? " · not available" : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
