"use client";

import { useMemo, useState } from "react";
import FlexibleBookingRatesEditor, {
  emptyFlexibleRateDraft,
  flexibleDraftFromRates,
  ratesFromFlexibleDraft,
} from "@/app/components/FlexibleBookingRatesEditor";
import { FLEXIBLE_PERIOD_LABELS, type FlexiblePeriod } from "@/lib/booking-periods";
import { resolveFlexibleBooking, type EnabledFlexibleRate } from "@/lib/flexible-booking";

const SAMPLE: EnabledFlexibleRate[] = [
  { period: "hour", amount: 250 },
  { period: "day", amount: 1500 },
  { period: "week", amount: 6000 },
  { period: "month", amount: 8000 },
  { period: "quarter", amount: 20000 },
  { period: "year", amount: 65000 },
];

export default function FlexibleBookingPreviewPage() {
  const [useFlexibleRates, setUseFlexibleRates] = useState(true);
  const [draft, setDraft] = useState(flexibleDraftFromRates(SAMPLE));
  const [createDraft, setCreateDraft] = useState(emptyFlexibleRateDraft());
  const [createEnabled, setCreateEnabled] = useState(false);
  const [period, setPeriod] = useState<FlexiblePeriod>("month");
  const [startDate, setStartDate] = useState("2026-01-31");
  const [quantity, setQuantity] = useState(1);
  const [hourStart, setHourStart] = useState("08:00");
  const [hourEnd, setHourEnd] = useState("10:00");

  const saved = ratesFromFlexibleDraft(draft);
  const rates = useFlexibleRates && saved.ok ? saved.rates : [];
  const active = rates.find((rate) => rate.period === period) ?? rates[0] ?? null;

  const quote = useMemo(() => {
    if (!active) return null;
    if (active.period === "hour") {
      const start = new Date(`2026-06-01T${hourStart}:00+02:00`);
      const end = new Date(`2026-06-01T${hourEnd}:00+02:00`);
      return resolveFlexibleBooking({
        rates,
        ratePeriod: "hour",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });
    }
    return resolveFlexibleBooking({
      rates,
      ratePeriod: active.period,
      startDate,
      quantity,
    });
  }, [active, hourEnd, hourStart, quantity, rates, startDate]);

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-8 text-[#192a3a]">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Edit an existing space
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Booking options &amp; pricing</h1>
          <FlexibleBookingRatesEditor
            useFlexibleRates={useFlexibleRates}
            draft={draft}
            onUseFlexibleRatesChange={setUseFlexibleRates}
            onDraftChange={setDraft}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Create a space
          </p>
          <h2 className="mt-1 text-2xl font-semibold">New listing</h2>
          <p className="mt-2 text-sm text-gray-600">
            The extra prices stay hidden until booking options are turned on.
          </p>
          <FlexibleBookingRatesEditor
            useFlexibleRates={createEnabled}
            draft={createDraft}
            onUseFlexibleRatesChange={setCreateEnabled}
            onDraftChange={setCreateDraft}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Renter booking
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Request this space</h2>
          {rates.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">
              This listing is using its existing price. Turn booking options on to preview a flexible request.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {rates.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {rates.map((rate) => (
                    <button
                      key={rate.period}
                      type="button"
                      onClick={() => setPeriod(rate.period)}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        active?.period === rate.period
                          ? "border-[#192a3a] bg-[#192a3a] text-white"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      {FLEXIBLE_PERIOD_LABELS[rate.period]} · R{rate.amount.toFixed(2)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm">
                  {FLEXIBLE_PERIOD_LABELS[rates[0].period]} · R{rates[0].amount.toFixed(2)}
                </p>
              )}
              {active?.period === "hour" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Start time
                    <input
                      type="time"
                      value={hourStart}
                      onChange={(event) => setHourStart(event.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    End time
                    <input
                      type="time"
                      value={hourEnd}
                      onChange={(event) => setHourEnd(event.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Start date
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    Number of periods
                    <input
                      type="number"
                      min={1}
                      max={36}
                      value={quantity}
                      onChange={(event) => setQuantity(Number(event.target.value))}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                    />
                  </label>
                </div>
              )}
              {quote?.ok ? (
                <div className="rounded-md border bg-[#f8fafb] p-4 text-sm">
                  <p>Booking period: {quote.quote.periodLabel}</p>
                  <p>Starts: {quote.quote.startLabel}</p>
                  <p>Ends: {quote.quote.endLabel}</p>
                  <p>Number of periods: {quote.quote.quantityLabel}</p>
                  <p>Price per period: R{quote.quote.unitPrice.toFixed(2)}</p>
                  <p className="mt-2 text-base font-semibold">
                    Total: R{quote.quote.totalPrice.toFixed(2)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-red-700">{quote && !quote.ok ? quote.error : "Choose a period."}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
