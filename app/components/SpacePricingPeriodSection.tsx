"use client";

import { SpaceMinBookingFields } from "@/app/components/SpaceMinBookingFields";
import { SpacePricingFields } from "@/app/components/SpacePricingFields";
import {
  SPACE_PRICING_PERIOD_HELPER_TEXT,
  bookingUnitToRentalPeriod,
  minBookingUnitPluralToSingular,
  minBookingUnitSingularToPlural,
  priceUnitToPricingType,
  rentalPeriodToBookingUnit,
  syncSpacePricingPeriod,
  type RentalPeriod,
} from "@/lib/space-pricing-period-sync";
import type { MinBookingDurationUnit } from "@/lib/space-min-booking";

const RENTAL_PERIOD_OPTIONS: { value: RentalPeriod; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
];

type SpacePricingPeriodSectionProps = {
  bookingUnit: string;
  priceAmount: string;
  priceUnit: string;
  depositRequired: boolean;
  depositAmount: string;
  minBookingDuration: string;
  minBookingUnit: MinBookingDurationUnit | "";
  disabled?: boolean;
  onBookingUnitChange: (value: string) => void;
  onPriceAmountChange: (value: string) => void;
  onPriceUnitChange: (value: string) => void;
  onDepositRequiredChange: (value: boolean) => void;
  onDepositAmountChange: (value: string) => void;
  onMinBookingDurationChange: (value: string) => void;
  onMinBookingUnitChange: (value: MinBookingDurationUnit | "") => void;
  inputClassName?: string;
  labelClassName?: string;
  helpClassName?: string;
};

export function SpacePricingPeriodSection({
  bookingUnit,
  priceAmount,
  priceUnit,
  depositRequired,
  depositAmount,
  minBookingDuration,
  minBookingUnit,
  disabled = false,
  onBookingUnitChange,
  onPriceAmountChange,
  onPriceUnitChange,
  onDepositRequiredChange,
  onDepositAmountChange,
  onMinBookingDurationChange,
  onMinBookingUnitChange,
  inputClassName,
  labelClassName,
  helpClassName,
}: SpacePricingPeriodSectionProps) {
  const rentalPeriod = bookingUnitToRentalPeriod(bookingUnit);

  function applySync(
    sourceField: "rental_period" | "pricing_type" | "min_booking_unit",
    value: string
  ) {
    const synced = syncSpacePricingPeriod(sourceField, value, {
      rentalPeriod,
      pricingType: priceUnitToPricingType(priceUnit),
      minBookingUnit: minBookingUnitSingularToPlural(minBookingUnit),
      priceAmount,
      minBookingDuration,
    });

    if (synced.rentalPeriod) {
      onBookingUnitChange(rentalPeriodToBookingUnit(synced.rentalPeriod));
    }

    const nextPriceUnit =
      synced.pricingType === "per_event"
        ? "event"
        : synced.pricingType === "on_request"
          ? "on_request"
          : synced.pricingType === "per_hour"
            ? "hour"
            : synced.pricingType === "per_day"
              ? "day"
              : synced.pricingType === "per_month"
                ? "month"
                : priceUnit;

    if (nextPriceUnit !== priceUnit) {
      onPriceUnitChange(nextPriceUnit);
      if (nextPriceUnit === "on_request") {
        onPriceAmountChange("");
      }
    }

    if (synced.minBookingUnit) {
      onMinBookingUnitChange(
        minBookingUnitPluralToSingular(synced.minBookingUnit)
      );
    }
  }

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-950">
        {SPACE_PRICING_PERIOD_HELPER_TEXT}
      </p>

      <label className="block max-w-md">
        <span className={labelClassName ?? "mb-1 block text-sm font-medium text-gray-700"}>
          Rental period
        </span>
        <select
          value={rentalPeriod}
          disabled={disabled}
          onChange={(e) => applySync("rental_period", e.target.value)}
          className={
            inputClassName ??
            "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]"
          }
        >
          <option value="">Select rental period</option>
          {RENTAL_PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <SpacePricingFields
        priceAmount={priceAmount}
        priceUnit={priceUnit}
        depositRequired={depositRequired}
        depositAmount={depositAmount}
        disabled={disabled}
        onPriceAmountChange={onPriceAmountChange}
        onPriceUnitChange={(value) => {
          const pricingType = priceUnitToPricingType(value);
          if (pricingType) {
            applySync("pricing_type", pricingType);
          } else {
            onPriceUnitChange(value);
          }
        }}
        onDepositRequiredChange={onDepositRequiredChange}
        onDepositAmountChange={onDepositAmountChange}
        inputClassName={inputClassName}
        labelClassName={labelClassName}
        helpClassName={helpClassName}
      />

      <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Minimum booking duration
        </h3>
        <div className="mt-3">
          <SpaceMinBookingFields
            duration={minBookingDuration}
            unit={minBookingUnit}
            disabled={disabled}
            onDurationChange={onMinBookingDurationChange}
            onUnitChange={(value) => {
              if (!value) {
                onMinBookingUnitChange("");
                return;
              }
              const plural = minBookingUnitSingularToPlural(value);
              if (plural) applySync("min_booking_unit", plural);
            }}
            inputClassName={inputClassName}
            labelClassName={labelClassName}
            helpClassName={helpClassName}
          />
        </div>
      </div>
    </div>
  );
}

export { validateSpacePricingPeriodFormFields } from "@/lib/space-pricing-period-sync";
