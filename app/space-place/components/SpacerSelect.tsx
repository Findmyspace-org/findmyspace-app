"use client";

import type { CrmProfile } from "@/lib/space-place/types";
import {
  dedupeActiveSpacers,
  formatSpacerOptionLabel,
} from "@/lib/space-place/spacers";

type SpacerSelectProps = {
  value: string;
  onChange: (value: string) => void;
  spacers: CrmProfile[];
  className?: string;
  id?: string;
  /** When false, only active Spacers (e.g. task owner). Default true for assignment. */
  includeUnassigned?: boolean;
};

export function SpacerSelect({
  value,
  onChange,
  spacers,
  className = "",
  id,
  includeUnassigned = true,
}: SpacerSelectProps) {
  const roster = dedupeActiveSpacers(spacers);

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ||
        "mt-1 w-full rounded-xl border border-neutral-200 p-3 text-base"
      }
    >
      {includeUnassigned ? <option value="">Unassigned</option> : null}
      {roster.map((spacer) => (
        <option key={spacer.id} value={spacer.id}>
          {formatSpacerOptionLabel(spacer, roster)}
        </option>
      ))}
    </select>
  );
}
