"use client";

import {
  MIN_BOOKING_DURATION_UNITS,
  type MinBookingDurationUnit,
} from "@/lib/space-min-booking";

const UNIT_OPTIONS: { value: MinBookingDurationUnit; label: string }[] = [
  { value: "hour", label: "Hours" },
  { value: "day", label: "Days" },
  { value: "month", label: "Months" },
];

type SpaceMinBookingFieldsProps = {
  duration: string;
  unit: MinBookingDurationUnit | "";
  onDurationChange: (value: string) => void;
  onUnitChange: (value: MinBookingDurationUnit | "") => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  helpClassName?: string;
};

export function SpaceMinBookingFields({
  duration,
  unit,
  onDurationChange,
  onUnitChange,
  disabled = false,
  className = "space-y-4",
  inputClassName = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]",
  labelClassName = "mb-1 block text-sm font-medium text-gray-700",
  helpClassName = "mt-1 text-xs text-gray-500",
}: SpaceMinBookingFieldsProps) {
  return (
    <div className={className}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>Minimum booking duration</span>
          <input
            type="number"
            min={1}
            step={1}
            value={duration}
            disabled={disabled}
            onChange={(e) => onDurationChange(e.target.value)}
            className={inputClassName}
            placeholder="e.g. 2"
          />
        </label>

        <label className="block">
          <span className={labelClassName}>Duration unit</span>
          <select
            value={unit}
            disabled={disabled}
            onChange={(e) =>
              onUnitChange(
                MIN_BOOKING_DURATION_UNITS.includes(
                  e.target.value as MinBookingDurationUnit
                )
                  ? (e.target.value as MinBookingDurationUnit)
                  : ""
              )
            }
            className={inputClassName}
          >
            <option value="">Select unit</option>
            {UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={helpClassName}>
        Optional. Leave blank if there is no minimum booking duration.
      </p>
    </div>
  );
}

export { UNIT_OPTIONS as MIN_BOOKING_UNIT_OPTIONS };
