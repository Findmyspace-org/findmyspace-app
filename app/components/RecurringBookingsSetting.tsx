"use client";

export default function RecurringBookingsSetting({
  enabled,
  maxOccurrences,
  hourlyRate,
  unavailableReason,
  disabled = false,
  onEnabledChange,
  onMaxOccurrencesChange,
}: {
  enabled: boolean;
  maxOccurrences: string;
  hourlyRate: number | null;
  unavailableReason: string | null;
  disabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onMaxOccurrencesChange: (value: string) => void;
}) {
  const canEnable = hourlyRate != null && hourlyRate > 0 && !unavailableReason;

  return (
    <fieldset className="mt-4 rounded-lg border border-gray-200 bg-white p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-gray-900">Allow recurring bookings</legend>
      <p className="mt-2 text-sm text-gray-700">
        A renter can request the same hours on a daily, weekly, or fortnightly schedule. Each request is still one approval and one payment. Existing recurring bookings stay in place if you turn this off later.
      </p>
      <div className="mt-3 flex gap-4 text-sm text-gray-800">
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="allow-recurring-bookings"
            checked={!enabled}
            onChange={() => onEnabledChange(false)}
          />
          No
        </label>
        <label className={`inline-flex items-center gap-2 ${canEnable ? "" : "text-gray-400"}`}>
          <input
            type="radio"
            name="allow-recurring-bookings"
            checked={enabled}
            disabled={!canEnable}
            onChange={() => {
              if (canEnable) onEnabledChange(true);
            }}
          />
          Yes
        </label>
      </div>
      {canEnable && hourlyRate ? (
        <p className="mt-2 text-sm text-gray-700">
          Recurring sessions use the hourly price of R{hourlyRate.toFixed(2)}. Quarterly and annual prices are not applied.
        </p>
      ) : (
        <p className="mt-2 text-sm text-amber-900" role="status">
          {unavailableReason ||
            "Recurring sessions need an hourly price. Add one without changing the listing's current booking period."}
        </p>
      )}
      <label className="mt-3 block text-sm text-gray-800">
        Maximum sessions in one request
        <input
          type="number"
          min={1}
          max={750}
          value={maxOccurrences}
          placeholder="No extra limit"
          onChange={(event) => onMaxOccurrencesChange(event.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2"
        />
      </label>
      <p className="mt-1 text-xs text-gray-500">
        Leave this blank to use the platform limit. A renter still needs an end date within 24 months.
      </p>
    </fieldset>
  );
}
