"use client";

import {
  SPACE_PRICE_UNIT_OPTIONS,
  type SpacePriceUnit,
} from "@/lib/space-pricing";

type SpacePricingFieldsProps = {
  priceAmount: string;
  priceUnit: string;
  depositRequired: boolean;
  depositAmount: string;
  onPriceAmountChange: (value: string) => void;
  onPriceUnitChange: (value: string) => void;
  onDepositRequiredChange: (value: boolean) => void;
  onDepositAmountChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  helpClassName?: string;
};

export function SpacePricingFields({
  priceAmount,
  priceUnit,
  depositRequired,
  depositAmount,
  onPriceAmountChange,
  onPriceUnitChange,
  onDepositRequiredChange,
  onDepositAmountChange,
  disabled = false,
  className = "space-y-4",
  inputClassName = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]",
  labelClassName = "mb-1 block text-sm font-medium text-gray-700",
  helpClassName = "mt-1 text-xs text-gray-500",
}: SpacePricingFieldsProps) {
  const isPriceOnRequest = priceUnit === "on_request";
  const isPerEvent = priceUnit === "event";

  return (
    <div className={className}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>Pricing type</span>
          <select
            value={priceUnit}
            disabled={disabled}
            onChange={(e) => onPriceUnitChange(e.target.value)}
            className={inputClassName}
          >
            {SPACE_PRICE_UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {isPerEvent ? (
            <p className={helpClassName}>
              Use this when the price is for the whole booking or event, rather than per hour or
              per day. Renters will still select a date and time.
            </p>
          ) : null}
        </label>

        <label className="block">
          <span className={labelClassName}>Price</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
              R
            </span>
            <input
              type="number"
              min={0}
              step="any"
              value={priceAmount}
              disabled={disabled || isPriceOnRequest}
              onChange={(e) => onPriceAmountChange(e.target.value)}
              className={`${inputClassName} pl-8`}
              placeholder={isPriceOnRequest ? "Not required" : "e.g. 1500"}
            />
          </div>
          {isPriceOnRequest ? (
            <p className={helpClassName}>Leave price empty when using price on request.</p>
          ) : (
            <p className={helpClassName}>Amount in South African Rand (ZAR).</p>
          )}
        </label>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={depositRequired}
            disabled={disabled}
            onChange={(e) => {
              onDepositRequiredChange(e.target.checked);
              if (!e.target.checked) {
                onDepositAmountChange("");
              }
            }}
            className="h-4 w-4 rounded border-gray-300 text-[#0f2740] focus:ring-[#0f2740]"
          />
          <span className="text-sm font-medium text-gray-700">Deposit required?</span>
        </label>

        {depositRequired ? (
          <label className="block max-w-xs">
            <span className={labelClassName}>Deposit amount</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                R
              </span>
              <input
                type="number"
                min={0}
                step="any"
                value={depositAmount}
                disabled={disabled}
                onChange={(e) => onDepositAmountChange(e.target.value)}
                className={`${inputClassName} pl-8`}
                placeholder="e.g. 500"
              />
            </div>
          </label>
        ) : null}
      </div>
    </div>
  );
}

export {
  validateSpacePricingFormValues,
  spacePricingPayloadFromForm,
  spacePricingFormFromRow,
} from "@/lib/space-pricing";

export type { SpacePriceUnit };
