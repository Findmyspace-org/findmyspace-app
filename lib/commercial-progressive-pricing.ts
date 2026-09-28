/**
 * Authoritative progressive per-space subscription arithmetic.
 * Used by Admin preview, the commercial resolver, and period snapshots.
 */

import { roundMoney } from "@/lib/commercial-calculator";

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
  breakdown: ProgressiveBreakdownLine[];
};

function bandCovers(spaceNumber: number, band: ProgressiveBand): boolean {
  if (spaceNumber < band.minCount) return false;
  if (band.maxCount == null) return true;
  return spaceNumber <= band.maxCount;
}

function matchingProgressiveBands(
  spaceNumber: number,
  bands: ProgressiveBand[]
): ProgressiveBand[] {
  return bands.filter((band) => bandCovers(spaceNumber, band));
}

export function validateProgressiveBands(
  bands: ProgressiveBand[]
): { ok: true } | { ok: false; error: string } {
  const sorted = [...bands].sort((a, b) => a.minCount - b.minCount);
  const mins = new Set<number>();

  for (let i = 0; i < sorted.length; i += 1) {
    const band = sorted[i];
    if (!Number.isInteger(band.minCount) || band.minCount < 1) {
      return {
        ok: false,
        error: "Each pricing band must start at a whole space number of 1 or more.",
      };
    }
    if (mins.has(band.minCount)) {
      return { ok: false, error: "Pricing bands cannot share the same starting space." };
    }
    mins.add(band.minCount);
    if (
      band.maxCount != null &&
      (!Number.isInteger(band.maxCount) || band.maxCount < band.minCount)
    ) {
      return {
        ok: false,
        error: "Band maximum must be empty or at least the starting space.",
      };
    }
    if (!Number.isFinite(band.incrementalAmount) || band.incrementalAmount < 0) {
      return {
        ok: false,
        error: "Price per additional space must be 0 or greater.",
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
 * Gaps are allowed to save, but counts in a gap will not resolve.
 */
export function progressiveBandGapWarning(
  includedUnits: number,
  bands: ProgressiveBand[]
): string | null {
  const sorted = [...bands].sort((a, b) => a.minCount - b.minCount);
  const firstPriced = Math.max(0, Number(includedUnits) || 0) + 1;
  if (sorted.length === 0) {
    return firstPriced > 0
      ? `No pricing bands. Space ${firstPriced} and above will not resolve.`
      : null;
  }
  if (sorted[0].minCount > firstPriced) {
    return `There is a gap before space ${sorted[0].minCount}. Counts in that range will not resolve.`;
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (prev.maxCount == null) continue;
    if (prev.maxCount + 1 < next.minCount) {
      return `There is a gap between ${prev.maxCount} and ${next.minCount}. Counts in that range will not resolve.`;
    }
  }
  return null;
}

export function calculateProgressiveSpaceSubscription(input: {
  baseAmount: number;
  includedUnits: number;
  bands: ProgressiveBand[];
  billableCount: number;
}): ProgressiveCalculation {
  const baseAmount = roundMoney(Number(input.baseAmount) || 0);
  const includedUnits = Math.max(0, Math.floor(Number(input.includedUnits) || 0));
  const count = Math.floor(Number(input.billableCount) || 0);
  const bands = [...input.bands].sort((a, b) => a.minCount - b.minCount);

  if (count <= 0) {
    return {
      billableCount: 0,
      includedUnits,
      baseAmount,
      monthlyAmount: 0,
      covered: true,
      uncoveredCount: 0,
      unresolvedReason: null,
      breakdown: [],
    };
  }

  const overlap = bands.some((band) => matchingProgressiveBands(band.minCount, bands).length > 1);
  if (overlap) {
    return {
      billableCount: count,
      includedUnits,
      baseAmount,
      monthlyAmount: 0,
      covered: false,
      uncoveredCount: 0,
      unresolvedReason: "ambiguous_overlapping_tiers",
      breakdown: [],
    };
  }

  const breakdown: ProgressiveBreakdownLine[] = [
    {
      kind: "base",
      label:
        includedUnits > 0
          ? `Base monthly fee (includes ${includedUnits} space${includedUnits === 1 ? "" : "s"})`
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

  for (let spaceNumber = includedUnits + 1; spaceNumber <= count; spaceNumber += 1) {
    const matches = matchingProgressiveBands(spaceNumber, bands);
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
    breakdown.push({
      kind: "band",
      label: band.label || `Spaces ${range}`,
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
      breakdown,
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
    breakdown,
  };
}

export function progressivePreviewCounts(
  includedUnits: number,
  bands: ProgressiveBand[]
): number[] {
  const defaults = [1, 2, 5, 10, 11, 20, 50];
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
  return [...boundaries].filter((count) => count > 0).sort((a, b) => a - b);
}
