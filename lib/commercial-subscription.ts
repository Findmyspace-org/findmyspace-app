import type { CommercialModel } from "@/lib/commercial-calculator";
import type {
  BillableInventoryCounts,
  BillableInventoryScope,
} from "@/lib/commercial-inventory";

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
] as const;

export type SubscriptionPricingMode = (typeof SUBSCRIPTION_PRICING_MODES)[number];

export type CommercialTermTier = {
  id: string | null;
  minCount: number;
  maxCount: number | null;
  monthlyAmount: number;
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

export function inventoryCountForMode(
  mode: SubscriptionPricingMode | null,
  counts: BillableInventoryCounts | null
): number | null {
  if (!mode || mode === "fixed") return null;
  if (!counts) return null;
  return mode === "by_property_count" ? counts.propertyCount : counts.spaceCount;
}

export function resolveSubscriptionAmount(input: {
  model: CommercialModel;
  pricingMode: SubscriptionPricingMode | null;
  fixedMonthlyAmount: number;
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
    };
  }

  if (!input.billedScope) {
    return {
      billedScopeType: null,
      billedScopeId: null,
      pricingMode: mode,
      inventoryBasis: mode === "by_property_count" ? "property" : "space",
      inventoryCount: null,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: "platform_default_needs_scope",
    };
  }

  const count = inventoryCountForMode(mode, input.inventory);
  if (count == null) {
    return {
      billedScopeType: input.billedScope.scopeType,
      billedScopeId: input.billedScope.scopeId,
      pricingMode: mode,
      inventoryBasis: mode === "by_property_count" ? "property" : "space",
      inventoryCount: null,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: "inventory_unavailable",
    };
  }

  const matches = matchingSubscriptionTiers(count, input.tiers);
  if (matches.length > 1) {
    return {
      billedScopeType: input.billedScope.scopeType,
      billedScopeId: input.billedScope.scopeId,
      pricingMode: mode,
      inventoryBasis: mode === "by_property_count" ? "property" : "space",
      inventoryCount: count,
      matchedTier: null,
      monthlyAmount: 0,
      unresolvedReason: "ambiguous_overlapping_tiers",
    };
  }
  const matchedTier = matches[0] ?? null;
  return {
    billedScopeType: input.billedScope.scopeType,
    billedScopeId: input.billedScope.scopeId,
    pricingMode: mode,
    inventoryBasis: mode === "by_property_count" ? "property" : "space",
    inventoryCount: count,
    matchedTier,
    monthlyAmount: matchedTier ? matchedTier.monthlyAmount : 0,
    unresolvedReason: matchedTier ? null : "no_matching_tier",
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

export function buildSubscriptionPeriodSnapshot(input: {
  billingAt: Date | string;
  billedScope: { scopeType: BillableInventoryScope; scopeId: string };
  commercialTermsId: string | null;
  resolution: SubscriptionResolution;
}): CommercialSubscriptionPeriodPreview {
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
    const monthlyAmount = Number(item.monthly_amount ?? item.monthlyAmount);
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

    value.push({
      id,
      minCount,
      maxCount,
      monthlyAmount: Number(monthlyAmount.toFixed(2)),
      label,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : i,
    });
  }

  return { ok: true, value };
}
