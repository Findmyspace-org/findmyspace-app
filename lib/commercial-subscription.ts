import type { CommercialModel } from "@/lib/commercial-calculator";
import type {
  BillableInventoryCounts,
  BillableInventoryScope,
} from "@/lib/commercial-inventory";
import {
  calculateProgressiveSubscription,
  validateProgressiveBands,
  type ProgressiveBand,
  type ProgressiveBreakdownLine,
  type ProgressiveUnitType,
} from "@/lib/commercial-progressive-pricing";

type SubscriptionSource =
  | "platform"
  | "organisation"
  | "property"
  | "space"
  | "legacy_space_percent";

export const COMMERCIAL_BILLING_TIMEZONE = "Africa/Johannesburg";

export const SUBSCRIPTION_PRICING_MODES = [
  "fixed",
  "by_property_count",
  "by_space_count",
  "progressive_space_pricing",
  "progressive_property_pricing",
] as const;

export type SubscriptionPricingMode = (typeof SUBSCRIPTION_PRICING_MODES)[number];

export type CommercialTermTier = {
  id: string | null;
  minCount: number;
  maxCount: number | null;
  monthlyAmount: number;
  incrementalAmount?: number | null;
  label: string | null;
  sortOrder: number;
};

export type SubscriptionResolution = {
  billedScopeType: BillableInventoryScope | null;
  billedScopeId: string | null;
  pricingMode: SubscriptionPricingMode | null;
  inventoryBasis: "fixed" | "property" | "space" | null;
  inventoryCount: number | null;
  matchedTier: CommercialTermTier | null;
  monthlyAmount: number;
  unresolvedReason: string | null;
  breakdown?: ProgressiveBreakdownLine[] | null;
};

export type CommercialSubscriptionPeriodPreview = {
  billingMonth: string;
  scopeType: BillableInventoryScope;
  scopeId: string;
  commercialTermsId: string | null;
  pricingMode: SubscriptionPricingMode | null;
  inventoryCount: number;
  matchedTierId: string | null;
  matchedTierLabel: string | null;
  monthlyAmount: number;
  status: "draft";
};

export function isSubscriptionPricingMode(
  value: string | null | undefined
): value is SubscriptionPricingMode {
  return (SUBSCRIPTION_PRICING_MODES as readonly string[]).includes(value || "");
}

export function normalizeSubscriptionPricingMode(
  model: CommercialModel,
  value: string | null | undefined
): SubscriptionPricingMode | null {
  if (model !== "subscription") return null;
  if (isSubscriptionPricingMode(value)) return value;
  return "fixed";
}

export function matchingSubscriptionTiers(
  count: number,
  tiers: CommercialTermTier[]
): CommercialTermTier[] {
  return tiers.filter((tier) => {
    if (count < tier.minCount) return false;
    if (tier.maxCount == null) return true;
    return count <= tier.maxCount;
  });
}

/**
 * Returns the single matching tier, or null when none or more than one match.
 * Overlaps must not silently pick a winner.
 */
export function matchSubscriptionTier(
  count: number,
  tiers: CommercialTermTier[]
): CommercialTermTier | null {
  const matches = matchingSubscriptionTiers(count, tiers);
  if (matches.length !== 1) return null;
  return matches[0];
}

export function subscriptionBilledScope(input: {
  source: SubscriptionSource;
  organisationId?: string | null;
  propertyId?: string | null;
  spaceId?: string | null;
}): { scopeType: BillableInventoryScope; scopeId: string } | null {
  if (input.source === "legacy_space_percent") return null;
  if (input.source === "space" && input.spaceId) {
    return { scopeType: "space", scopeId: input.spaceId };
  }
  if (input.source === "property" && input.propertyId) {
    return { scopeType: "property", scopeId: input.propertyId };
  }
  if (
    (input.source === "organisation" || input.source === "platform") &&
    input.organisationId
  ) {
    return { scopeType: "organisation", scopeId: input.organisationId };
  }
  return null;
}

export function isProgressivePricingMode(
  mode: SubscriptionPricingMode | null | undefined
): mode is "progressive_space_pricing" | "progressive_property_pricing" {
  return (
    mode === "progressive_space_pricing" ||
    mode === "progressive_property_pricing"
  );
}

export function isPropertyCountPricingMode(
  mode: SubscriptionPricingMode | null | undefined
): boolean {
  return (
    mode === "by_property_count" || mode === "progressive_property_pricing"
  );
}

export function progressiveUnitTypeForMode(
  mode: SubscriptionPricingMode | null | undefined
): ProgressiveUnitType {
  return mode === "progressive_property_pricing" ? "property" : "space";
}

export function inventoryCountForMode(
  mode: SubscriptionPricingMode | null,
  counts: BillableInventoryCounts | null
): number | null {
  if (!mode || mode === "fixed") return null;
  if (!counts) return null;
  return isPropertyCountPricingMode(mode)
    ? counts.propertyCount
    : counts.spaceCount;
}

export function inventoryBasisForMode(
  mode: SubscriptionPricingMode | null
): "fixed" | "property" | "space" | null {
  if (!mode) return null;
  if (mode === "fixed") return "fixed";
  if (isPropertyCountPricingMode(mode)) return "property";
  return "space";
}

export function commercialTiersToProgressiveBands(
  tiers: CommercialTermTier[]
): ProgressiveBand[] {
  return tiers.map((tier) => ({
    minCount: tier.minCount,
    maxCount: tier.maxCount,
    incrementalAmount: Number(tier.incrementalAmount) || 0,
    label: tier.label,
  }));
}

export function resolveSubscriptionAmount(input: {
  model: CommercialModel;
  pricingMode: SubscriptionPricingMode | null;
  fixedMonthlyAmount: number;
  includedUnits?: number | null;
  tiers: CommercialTermTier[];
  inventory: BillableInventoryCounts | null;
  billedScope: { scopeType: BillableInventoryScope; scopeId: string } | null;
}): SubscriptionResolution {
  if (input.model !== "subscription") {
    return {
      billedScopeType: input.billedScope?.scopeType ?? null,
      billedScopeId: input.billedScope?.scopeId ?? null,
      pricingMode: null,
      inventoryBasis: null,
      inventoryCount: null,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: null,
      breakdown: null,
    };
  }

  const mode = input.pricingMode ?? "fixed";
  if (mode === "fixed") {
    return {
      billedScopeType: input.billedScope?.scopeType ?? null,
      billedScopeId: input.billedScope?.scopeId ?? null,
      pricingMode: "fixed",
      inventoryBasis: "fixed",
      inventoryCount: null,
      matchedTier: null,
      monthlyAmount: Number(input.fixedMonthlyAmount) || 0,
      unresolvedReason: null,
      breakdown: null,
    };
  }

  const inventoryBasis = inventoryBasisForMode(mode);

  if (!input.billedScope) {
    return {
      billedScopeType: null,
      billedScopeId: null,
      pricingMode: mode,
      inventoryBasis,
      inventoryCount: null,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: "platform_default_needs_scope",
      breakdown: null,
    };
  }

  const count = inventoryCountForMode(mode, input.inventory);
  if (count == null) {
    return {
      billedScopeType: input.billedScope.scopeType,
      billedScopeId: input.billedScope.scopeId,
      pricingMode: mode,
      inventoryBasis,
      inventoryCount: null,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: "inventory_unavailable",
      breakdown: null,
    };
  }

  if (isProgressivePricingMode(mode)) {
    const calculated = calculateProgressiveSubscription({
      baseAmount: input.fixedMonthlyAmount,
      includedUnits: input.includedUnits ?? 0,
      bands: commercialTiersToProgressiveBands(input.tiers),
      unitCount: count,
      unitType: progressiveUnitTypeForMode(mode),
    });
    return {
      billedScopeType: input.billedScope.scopeType,
      billedScopeId: input.billedScope.scopeId,
      pricingMode: mode,
      inventoryBasis,
      inventoryCount: count,
      matchedTier: null,
      monthlyAmount: calculated.monthlyAmount,
      unresolvedReason: calculated.unresolvedReason,
      breakdown: calculated.breakdown,
    };
  }

  const matches = matchingSubscriptionTiers(count, input.tiers);
  if (matches.length > 1) {
    return {
      billedScopeType: input.billedScope.scopeType,
      billedScopeId: input.billedScope.scopeId,
      pricingMode: mode,
      inventoryBasis,
      inventoryCount: count,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: "ambiguous_overlapping_tiers",
      breakdown: null,
    };
  }
  const matchedTier = matches[0] ?? null;
  return {
    billedScopeType: input.billedScope.scopeType,
    billedScopeId: input.billedScope.scopeId,
    pricingMode: mode,
    inventoryBasis,
    inventoryCount: count,
    matchedTier,
    monthlyAmount: matchedTier ? matchedTier.monthlyAmount : 0,
    unresolvedReason: matchedTier ? null : "no_matching_tier",
    breakdown: null,
  };
}

export function billingMonthStart(
  at: Date | string,
  timeZone: string = COMMERCIAL_BILLING_TIMEZONE
): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid commercial billing date.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) {
    throw new Error("Could not resolve billing month.");
  }
  return `${year}-${month}-01`;
}

export function assertBillableSubscriptionResolution(
  resolution: SubscriptionResolution
): { ok: true } | { ok: false; error: string } {
  if (resolution.unresolvedReason) {
    return {
      ok: false,
      error: `subscription_period_unresolved:${resolution.unresolvedReason}`,
    };
  }
  return { ok: true };
}

export function buildSubscriptionPeriodSnapshot(input: {
  billingAt: Date | string;
  billedScope: { scopeType: BillableInventoryScope; scopeId: string };
  commercialTermsId: string | null;
  resolution: SubscriptionResolution;
}): CommercialSubscriptionPeriodPreview {
  const allowed = assertBillableSubscriptionResolution(input.resolution);
  if (!allowed.ok) {
    throw new Error(allowed.error);
  }
  return {
    billingMonth: billingMonthStart(input.billingAt),
    scopeType: input.billedScope.scopeType,
    scopeId: input.billedScope.scopeId,
    commercialTermsId: input.commercialTermsId,
    pricingMode: input.resolution.pricingMode,
    inventoryCount: input.resolution.inventoryCount ?? 0,
    matchedTierId: input.resolution.matchedTier?.id ?? null,
    matchedTierLabel: input.resolution.matchedTier?.label ?? null,
    monthlyAmount: input.resolution.monthlyAmount,
    status: "draft",
  };
}

export function validateProgressiveSubscriptionTiers(
  tiers: CommercialTermTier[],
  unitType: ProgressiveUnitType = "space"
): { ok: true } | { ok: false; error: string } {
  const noun = unitType === "property" ? "property" : "space";
  if (
    tiers.some(
      (tier) =>
        tier.incrementalAmount == null || !Number.isFinite(tier.incrementalAmount)
    )
  ) {
    return {
      ok: false,
      error: `Each pricing band needs a price per additional ${noun}.`,
    };
  }
  return validateProgressiveBands(
    commercialTiersToProgressiveBands(tiers),
    unitType
  );
}

export function validateSubscriptionTiers(
  tiers: CommercialTermTier[]
): { ok: true } | { ok: false; error: string } {
  if (tiers.length === 0) {
    return { ok: false, error: "Tiered subscription requires at least one tier." };
  }

  const sorted = [...tiers].sort((a, b) => a.minCount - b.minCount);
  for (let i = 0; i < sorted.length; i += 1) {
    const tier = sorted[i];
    if (!Number.isInteger(tier.minCount) || tier.minCount < 0) {
      return { ok: false, error: "Tier minimum count must be a whole number of 0 or more." };
    }
    if (
      tier.maxCount != null &&
      (!Number.isInteger(tier.maxCount) || tier.maxCount < tier.minCount)
    ) {
      return {
        ok: false,
        error: "Tier maximum count must be empty or at least the minimum.",
      };
    }
    if (!Number.isFinite(tier.monthlyAmount) || tier.monthlyAmount < 0) {
      return { ok: false, error: "Tier monthly amount must be 0 or greater." };
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevMax = prev.maxCount ?? Number.POSITIVE_INFINITY;
      if (tier.minCount <= prevMax) {
        return { ok: false, error: "Subscription tiers cannot overlap." };
      }
    }
  }

  return { ok: true };
}

export function parseCommercialTermTiers(
  raw: unknown
): { ok: true; value: CommercialTermTier[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "tiers must be an array." };
  }

  const value: CommercialTermTier[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `Tier ${i + 1} is invalid.` };
    }
    const item = row as Record<string, unknown>;
    const minCount = Number(item.min_count ?? item.minCount);
    const maxRaw = item.max_count ?? item.maxCount;
    const maxCount =
      maxRaw == null || maxRaw === "" ? null : Number(maxRaw);
    const incrementalRaw = item.incremental_amount ?? item.incrementalAmount;
    const hasIncremental = incrementalRaw != null && incrementalRaw !== "";
    const incrementalAmount = hasIncremental ? Number(incrementalRaw) : null;
    const monthlyRaw = item.monthly_amount ?? item.monthlyAmount;
    const monthlyAmount =
      monthlyRaw == null || monthlyRaw === ""
        ? hasIncremental
          ? 0
          : Number.NaN
        : Number(monthlyRaw);
    const label =
      typeof item.label === "string" ? item.label.trim() || null : null;
    const sortOrder = Number(item.sort_order ?? item.sortOrder ?? i);
    const id =
      typeof item.id === "string" && item.id.trim() ? item.id.trim() : null;

    if (!Number.isFinite(minCount)) {
      return { ok: false, error: `Tier ${i + 1} needs a minimum count.` };
    }
    if (maxCount != null && !Number.isFinite(maxCount)) {
      return { ok: false, error: `Tier ${i + 1} maximum count is invalid.` };
    }
    if (!Number.isFinite(monthlyAmount)) {
      return { ok: false, error: `Tier ${i + 1} needs a monthly amount.` };
    }
    if (hasIncremental && (incrementalAmount == null || !Number.isFinite(incrementalAmount))) {
      return {
        ok: false,
        error: `Pricing band ${i + 1} needs a price per additional unit.`,
      };
    }

    value.push({
      id,
      minCount,
      maxCount,
      monthlyAmount: Number(monthlyAmount.toFixed(2)),
      incrementalAmount:
        incrementalAmount == null ? null : Number(incrementalAmount.toFixed(2)),
      label,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : i,
    });
  }

  return { ok: true, value };
}
