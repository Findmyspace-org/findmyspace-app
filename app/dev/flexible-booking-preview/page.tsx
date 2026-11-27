"use client";

import { useState } from "react";
import FlexibleBookingRatesEditor, {
  emptyFlexibleRateDraft,
  flexibleDraftFromRates,
  ratesFromFlexibleDraft,
} from "@/app/components/FlexibleBookingRatesEditor";
import BookingRequestForm from "@/app/components/BookingRequestForm";
import type { EnabledFlexibleRate } from "@/lib/flexible-booking";

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

  const saved = ratesFromFlexibleDraft(draft);
  const rates = useFlexibleRates && saved.ok ? saved.rates : SAMPLE;

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
            Renter booking form
          </p>
          <h2 className="mt-1 text-2xl font-semibold">All six periods</h2>
          <div className="mt-4">
            <BookingRequestForm
              spaceId="00000000-0000-4000-8000-000000000001"
              ownerId={null}
              bookingUnit="day"
              priceAmount={1500}
              priceUnit="day"
              pricePerHour={250}
              pricePerDay={1500}
              pricePerMonth={8000}
              flexibleRates={rates}
              spaceLocation="Paarl, Western Cape"
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Renter booking form
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Quarter only</h2>
          <div className="mt-4">
            <BookingRequestForm
              spaceId="00000000-0000-4000-8000-000000000002"
              ownerId={null}
              bookingUnit="day"
              priceAmount={20000}
              priceUnit="day"
              pricePerHour={null}
              pricePerDay={null}
              pricePerMonth={null}
              flexibleRates={[{ period: "quarter", amount: 20000 }]}
              spaceLocation="Paarl, Western Cape"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
