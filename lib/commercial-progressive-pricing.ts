/**
 * Authoritative progressive subscription arithmetic for space or property units.
 * Used by Admin preview, the commercial resolver, and period snapshots.
 */

import { roundMoney } from "@/lib/commercial-calculator";

export type ProgressiveUnitType = "space" | "property";

export type ProgressiveBand = {
  minCount: number;
  maxCount: number | null;
  incrementalAmount: number;
  label: string | null;
};

export type ProgressiveBreakdownLine = {
  kind: "base" | "band";
  label: string;
  unitCount: number;
  rate: number;
  subtotal: number;
  minCount: number | null;
  maxCount: number | null;
};

export type ProgressiveCalculation = {
  billableCount: number;
  includedUnits: number;
  baseAmount: number;
  monthlyAmount: number;
  covered: boolean;
  uncoveredCount: number;
  unresolvedReason: string | null;
  unitType: ProgressiveUnitType;
  breakdown: ProgressiveBreakdownLine[];
  calculationText: string;
};

export function progressiveUnitNoun(
  unitType: ProgressiveUnitType,
  count = 1
): string {
  if (unitType === "property") return count === 1 ? "property" : "properties";
  return count === 1 ? "space" : "spaces";
}

export function formatProgressiveRand(value: number): string {
  const amount = roundMoney(Number(value) || 0);
  return Number.isInteger(amount) ? `R${amount}` : `R${amount.toFixed(2)}`;
}

function bandCovers(unitNumber: number, band: ProgressiveBand): boolean {
  if (unitNumber < band.minCount) return false;
  if (band.maxCount == null) return true;
  return unitNumber <= band.maxCount;
}

function matchingProgressiveBands(
  unitNumber: number,
  bands: ProgressiveBand[]
): ProgressiveBand[] {
  return bands.filter((band) => bandCovers(unitNumber, band));
}

export function validateProgressiveBands(
  bands: ProgressiveBand[],
  unitType: ProgressiveUnitType = "space"
): { ok: true } | { ok: false; error: string } {
  const noun = progressiveUnitNoun(unitType, 1);
  const sorted = [...bands].sort((a, b) => a.minCount - b.minCount);
  const mins = new Set<number>();

  for (let i = 0; i < sorted.length; i += 1) {
    const band = sorted[i];
    if (!Number.isInteger(band.minCount) || band.minCount < 1) {
      return {
        ok: false,
        error: `Each pricing band must start at a whole ${noun} number of 1 or more.`,
      };
    }
    if (mins.has(band.minCount)) {
      return {
        ok: false,
        error: `Pricing bands cannot share the same starting ${noun}.`,
      };
    }
    mins.add(band.minCount);
    if (
      band.maxCount != null &&
      (!Number.isInteger(band.maxCount) || band.maxCount < band.minCount)
    ) {
      return {
        ok: false,
        error: `Band maximum must be empty or at least the starting ${noun}.`,
      };
    }
    if (!Number.isFinite(band.incrementalAmount) || band.incrementalAmount < 0) {
      return {
        ok: false,
        error: `Additional fee per ${noun} must be 0 or greater.`,
      };
    }
    const isLast = i === sorted.length - 1;
    if (band.maxCount == null && !isLast) {
      return {
        ok: false,
        error: "Only the last pricing band may have no upper limit.",
      };
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevMax = prev.maxCount ?? Number.POSITIVE_INFINITY;
      if (band.minCount <= prevMax) {
        return { ok: false, error: "Pricing bands cannot overlap." };
      }
    }
  }

  return { ok: true };
}

/**
 * Gaps must be warned in Admin and rejected on save unless explicitly allowed.
 */
export function progressiveBandGapWarning(
  includedUnits: number,
  bands: ProgressiveBand[],
  unitType: ProgressiveUnitType = "space"
): string | null {
  const noun = progressiveUnitNoun(unitType, 1);
  const nouns = progressiveUnitNoun(unitType, 2);
  const sorted = [...bands].sort((a, b) => a.minCount - b.minCount);
  const firstPriced = Math.max(0, Number(includedUnits) || 0) + 1;
  if (sorted.length === 0) {
    return firstPriced > 0
      ? `Pricing gap: ${nouns} ${firstPriced} and above are not covered.`
      : null;
  }
  if (sorted[0].minCount > firstPriced) {
    const until = sorted[0].minCount - 1;
    return until === firstPriced
      ? `Pricing gap: ${noun} ${firstPriced} is not covered.`
      : `Pricing gap: ${nouns} ${firstPriced}–${until} are not covered.`;
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (prev.maxCount == null) continue;
    if (prev.maxCount + 1 < next.minCount) {
      const from = prev.maxCount + 1;
      const until = next.minCount - 1;
      return from === until
        ? `Pricing gap: ${noun} ${from} is not covered.`
        : `Pricing gap: ${nouns} ${from}–${until} are not covered.`;
    }
  }
  const last = sorted[sorted.length - 1];
  if (last.maxCount != null) {
    return `Pricing gap: ${nouns} ${last.maxCount + 1} and above are not covered.`;
  }
  return null;
}

function formatCalculationText(input: {
  covered: boolean;
  billableCount: number;
  includedUnits: number;
  monthlyAmount: number;
  breakdown: ProgressiveBreakdownLine[];
  unitType: ProgressiveUnitType;
}): string {
  const noun = progressiveUnitNoun(input.unitType, 2);
  if (input.billableCount <= 0) return `No billable ${noun}`;
  if (!input.covered) return "Not covered by this schedule";
  const bandLines = input.breakdown.filter((line) => line.kind === "band");
  if (bandLines.length === 0) return "Base";
  if (bandLines.length === 1) {
    const band = bandLines[0];
    return `${formatProgressiveRand(input.breakdown[0]?.subtotal ?? 0)} + ${band.unitCount} × ${formatProgressiveRand(band.rate)}`;
  }
  const last = bandLines[bandLines.length - 1];
  const previousTotal = roundMoney(input.monthlyAmount - last.subtotal);
  return `${formatProgressiveRand(previousTotal)} + ${last.unitCount} × ${formatProgressiveRand(last.rate)}`;
}

export function calculateProgressiveSubscription(input: {
  baseAmount: number;
  includedUnits: number;
  bands: ProgressiveBand[];
  unitCount?: number;
  billableCount?: number;
  unitType?: ProgressiveUnitType;
}): ProgressiveCalculation {
  const unitType = input.unitType ?? "space";
  const baseAmount = roundMoney(Number(input.baseAmount) || 0);
  const includedUnits = Math.max(0, Math.floor(Number(input.includedUnits) || 0));
  const count = Math.floor(Number(input.unitCount ?? input.billableCount) || 0);
  const bands = [...input.bands].sort((a, b) => a.minCount - b.minCount);
  const nounPlural = progressiveUnitNoun(unitType, 2);

  if (count <= 0) {
    return {
      billableCount: 0,
      includedUnits,
      baseAmount,
      monthlyAmount: 0,
      covered: true,
      uncoveredCount: 0,
      unresolvedReason: null,
      unitType,
      breakdown: [],
      calculationText: `No billable ${nounPlural}`,
    };
  }

  const overlap = bands.some(
    (band) => matchingProgressiveBands(band.minCount, bands).length > 1
  );
  if (overlap) {
    return {
      billableCount: count,
      includedUnits,
      baseAmount,
      monthlyAmount: 0,
      covered: false,
      uncoveredCount: 0,
      unresolvedReason: "ambiguous_overlapping_tiers",
      unitType,
      breakdown: [],
      calculationText: "Not covered by this schedule",
    };
  }

  const breakdown: ProgressiveBreakdownLine[] = [
    {
      kind: "base",
      label:
        includedUnits > 0
          ? `Base monthly fee (includes ${includedUnits} ${progressiveUnitNoun(unitType, includedUnits)})`
          : "Base monthly fee",
      unitCount: Math.min(count, includedUnits),
      rate: baseAmount,
      subtotal: baseAmount,
      minCount: includedUnits > 0 ? 1 : null,
      maxCount: includedUnits > 0 ? includedUnits : null,
    },
  ];

  const unitsByBand = bands.map(() => 0);
  let uncoveredCount = 0;

  for (let unitNumber = includedUnits + 1; unitNumber <= count; unitNumber += 1) {
    const matches = matchingProgressiveBands(unitNumber, bands);
    if (matches.length !== 1) {
      uncoveredCount += 1;
      continue;
    }
    const index = bands.indexOf(matches[0]);
    unitsByBand[index] += 1;
  }

  bands.forEach((band, index) => {
    const unitCount = unitsByBand[index];
    if (unitCount <= 0) return;
    const rate = roundMoney(band.incrementalAmount);
    const range =
      band.maxCount == null ? `${band.minCount}+` : `${band.minCount}–${band.maxCount}`;
    const noun = progressiveUnitNoun(unitType, 2);
    breakdown.push({
      kind: "band",
      label: band.label || `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${range}`,
      unitCount,
      rate,
      subtotal: roundMoney(unitCount * rate),
      minCount: band.minCount,
      maxCount: band.maxCount,
    });
  });

  if (uncoveredCount > 0) {
    return {
      billableCount: count,
      includedUnits,
      baseAmount,
      monthlyAmount: 0,
      covered: false,
      uncoveredCount,
      unresolvedReason: "no_matching_tier",
      unitType,
      breakdown,
      calculationText: "Not covered by this schedule",
    };
  }

  const monthlyAmount = roundMoney(
    breakdown.reduce((sum, line) => sum + line.subtotal, 0)
  );

  return {
    billableCount: count,
    includedUnits,
    baseAmount,
    monthlyAmount,
    covered: true,
    uncoveredCount: 0,
    unresolvedReason: null,
    unitType,
    breakdown,
    calculationText: formatCalculationText({
      covered: true,
      billableCount: count,
      includedUnits,
      monthlyAmount,
      breakdown,
      unitType,
    }),
  };
}

/** @deprecated Prefer calculateProgressiveSubscription({ unitType: "space" }). */
export function calculateProgressiveSpaceSubscription(input: {
  baseAmount: number;
  includedUnits: number;
  bands: ProgressiveBand[];
  billableCount: number;
}): ProgressiveCalculation {
  return calculateProgressiveSubscription({
    ...input,
    unitCount: input.billableCount,
    unitType: "space",
  });
}

export function progressivePreviewCounts(
  includedUnits: number,
  bands: ProgressiveBand[],
  unitType: ProgressiveUnitType = "space"
): number[] {
  const defaults = [1, 2, 3, 5, 10, 11, 20, 50];
  const boundaries = new Set<number>(defaults);
  const included = Math.max(0, Math.floor(Number(includedUnits) || 0));
  if (included > 0) {
    boundaries.add(included);
    boundaries.add(included + 1);
  }
  for (const band of bands) {
    if (band.minCount > 0) boundaries.add(band.minCount);
    if (band.maxCount != null && band.maxCount > 0) {
      boundaries.add(band.maxCount);
      boundaries.add(band.maxCount + 1);
    }
  }
  void unitType;
  return [...boundaries].filter((count) => count > 0).sort((a, b) => a - b);
}

export function progressiveBandMilestoneCounts(band: ProgressiveBand): number[] {
  const counts = new Set<number>();
  if (band.minCount > 0) counts.add(band.minCount);
  if (band.maxCount != null && band.maxCount > 0) counts.add(band.maxCount);
  if (band.maxCount == null) {
    counts.add(band.minCount);
    if (20 >= band.minCount) counts.add(20);
  }
  return [...counts].sort((a, b) => a - b);
}
