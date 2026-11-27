"use client";

import {
  FLEXIBLE_PERIOD_LABELS,
  FLEXIBLE_PERIODS,
  type FlexiblePeriod,
} from "@/lib/booking-periods";
import {
  parseFlexibleRateDraft,
  type EnabledFlexibleRate,
} from "@/lib/flexible-booking";

export type FlexibleRateDraft = Record<FlexiblePeriod, { enabled: boolean; amount: string }>;

export function emptyFlexibleRateDraft(): FlexibleRateDraft {
  return {
    hour: { enabled: false, amount: "" },
    day: { enabled: false, amount: "" },
    week: { enabled: false, amount: "" },
    month: { enabled: false, amount: "" },
    quarter: { enabled: false, amount: "" },
    year: { enabled: false, amount: "" },
  };
}

export function flexibleDraftFromRates(rates: EnabledFlexibleRate[]): FlexibleRateDraft {
  const draft = emptyFlexibleRateDraft();
  for (const rate of rates) {
    draft[rate.period] = { enabled: true, amount: String(rate.amount) };
  }
  return draft;
}

export function ratesFromFlexibleDraft(
  draft: FlexibleRateDraft
): { ok: true; rates: EnabledFlexibleRate[] } | { ok: false; error: string } {
  const rows = FLEXIBLE_PERIODS.filter((period) => draft[period].enabled).map((period) => ({
    period,
    amount: draft[period].amount,
  }));
  return parseFlexibleRateDraft(rows);
}

export default function FlexibleBookingRatesEditor({
  useFlexibleRates,
  draft,
  disabled = false,
  onUseFlexibleRatesChange,
  onDraftChange,
}: {
  useFlexibleRates: boolean;
  draft: FlexibleRateDraft;
  disabled?: boolean;
  onUseFlexibleRatesChange: (value: boolean) => void;
  onDraftChange: (draft: FlexibleRateDraft) => void;
}) {
  function patch(period: FlexiblePeriod, patchValue: Partial<FlexibleRateDraft[FlexiblePeriod]>) {
    onDraftChange({
      ...draft,
      [period]: { ...draft[period], ...patchValue },
    });
  }

  return (
    <fieldset className="mt-4 rounded-lg border border-gray-200 bg-white p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-gray-900">
        Booking options &amp; pricing
      </legend>
      <label className="mt-2 flex items-start gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          className="mt-1"
          checked={useFlexibleRates}
          onChange={(event) => onUseFlexibleRatesChange(event.target.checked)}
        />
        <span>
          Set a separate price for each booking period. Leave this off to keep the current
          hourly, daily, event, monthly, or on-request price.
        </span>
      </label>
      {useFlexibleRates ? (
        <div className="mt-4 space-y-3">
          {FLEXIBLE_PERIODS.map((period) => {
            const row = draft[period];
            return (
              <div key={period} className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(event) => patch(period, { enabled: event.target.checked })}
                  />
                  {FLEXIBLE_PERIOD_LABELS[period]}
                </label>
                {row.enabled ? (
                  <label className="text-sm text-gray-700">
                    <span className="sr-only">{FLEXIBLE_PERIOD_LABELS[period]} price in rand</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={row.amount}
                      placeholder="Price in rand"
                      onChange={(event) => patch(period, { amount: event.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
          <p className="text-xs leading-relaxed text-gray-600">
            A month, quarter, or year runs from the start date and is paid in full when the
            booking is confirmed. This is separate from an existing monthly rental that still
            charges the first month plus a deposit.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
