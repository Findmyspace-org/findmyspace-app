"use client";

import {
  isGroupSizeApplicable,
  parseGroupSizeInput,
  validateGroupSizePair,
} from "@/lib/group-size";

type GroupSizeFieldsProps = {
  spaceType: string;
  minGroupSize: string;
  maxGroupSize: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onValidationError?: (message: string | null) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  helpClassName?: string;
};

export function GroupSizeFields({
  spaceType,
  minGroupSize,
  maxGroupSize,
  onMinChange,
  onMaxChange,
  onValidationError,
  disabled = false,
  className = "grid gap-3 sm:grid-cols-2",
  inputClassName = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]",
  labelClassName = "mb-1 block text-sm font-medium text-gray-700",
  helpClassName = "mt-1 text-xs text-gray-500",
}: GroupSizeFieldsProps) {
  if (!isGroupSizeApplicable(spaceType)) return null;

  function handleBlur() {
    const min = parseGroupSizeInput(minGroupSize);
    const max = parseGroupSizeInput(maxGroupSize);
    onValidationError?.(validateGroupSizePair(min, max));
  }

  return (
    <div className={className}>
      <label className="block">
        <span className={labelClassName}>Minimum Group Size</span>
        <input
          type="number"
          min={1}
          value={minGroupSize}
          disabled={disabled}
          onChange={(e) => onMinChange(e.target.value)}
          onBlur={handleBlur}
          className={inputClassName}
          placeholder="e.g. 10"
        />
      </label>
      <label className="block">
        <span className={labelClassName}>Maximum Group Size</span>
        <input
          type="number"
          min={1}
          value={maxGroupSize}
          disabled={disabled}
          onChange={(e) => onMaxChange(e.target.value)}
          onBlur={handleBlur}
          className={inputClassName}
          placeholder="e.g. 80"
        />
        <p className={helpClassName}>Example: 10 to 80 people</p>
      </label>
    </div>
  );
}

export function validateGroupSizeFormValues(
  spaceType: string,
  minGroupSize: string,
  maxGroupSize: string
): string | null {
  if (!isGroupSizeApplicable(spaceType)) return null;
  const min = parseGroupSizeInput(minGroupSize);
  const max = parseGroupSizeInput(maxGroupSize);
  if (minGroupSize.trim() && min == null) {
    return "Enter a valid minimum group size.";
  }
  if (maxGroupSize.trim() && max == null) {
    return "Enter a valid maximum group size.";
  }
  return validateGroupSizePair(min, max);
}

export function groupSizePayloadFromForm(
  spaceType: string,
  minGroupSize: string,
  maxGroupSize: string
): { min_group_size: number | null; max_group_size: number | null } {
  if (!isGroupSizeApplicable(spaceType)) {
    return { min_group_size: null, max_group_size: null };
  }
  return {
    min_group_size: parseGroupSizeInput(minGroupSize),
    max_group_size: parseGroupSizeInput(maxGroupSize),
  };
}
