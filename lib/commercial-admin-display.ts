import {
  formatCommercialArrangement,
  inheritedFromLabel,
  type CommercialScopeType,
  type CommercialTermsSource,
  type ResolvedCommercialTerms,
} from "@/lib/commercial-terms";
import type { CommercialTermTier } from "@/lib/commercial-subscription";

export type CommercialSearchKind = "organisation" | "property" | "space";

export const COMMERCIAL_KIND_LABELS: Record<CommercialSearchKind, string> = {
  organisation: "Organisation",
  property: "Property",
  space: "Space",
};

export const BILLABLE_INVENTORY_HELP =
  "Billable inventory is currently managed stock: active, paused, pending, pending verification, owner claimed, needs changes, draft, and approved listings. Deleted, archived, unclaimed, and rejected listings are excluded. Spaces on archived properties do not count. Pausing a listing does not drop a subscription tier; archiving or deleting can.";

export const PLATFORM_DEFAULT_UNCONFIGURED_TITLE =
  "No platform commercial terms configured.";

export const PLATFORM_DEFAULT_UNCONFIGURED_BODY =
  "Current fallback: legacy space-level fee, otherwise a combined 15% FindMySpace fee. This is expected until Global Admin saves a platform default. Saving a default would apply Commission, Subscription, or Free to organisations that have no more specific override. Historical bookings would stay on the fees already snapshotted.";

export type CommercialSearchHit = {
  kind: CommercialSearchKind;
  id: string;
  name: string;
  organisationId: string | null;
  propertyId: string | null;
  spaceId: string | null;
  organisationName: string | null;
  propertyName: string | null;
};

export type DecoratedCommercialSearchHit = CommercialSearchHit & {
  kindLabel: string;
  parentContext: string | null;
  commercialSummary: string;
  commercialSource: CommercialTermsSource;
  inheritedFrom: string;
  isLegacy: boolean;
};

export function commercialParentContext(hit: CommercialSearchHit): string | null {
  if (hit.kind === "organisation") return null;
  if (hit.kind === "property") {
    return hit.organisationName || "No organisation linked";
  }
  const parts = [hit.propertyName, hit.organisationName].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  if (hit.propertyId) return "Property linked";
  return "No property linked";
}

export function decorateCommercialSearchHit(
  hit: CommercialSearchHit,
  resolved: ResolvedCommercialTerms
): DecoratedCommercialSearchHit {
  return {
    ...hit,
    kindLabel: COMMERCIAL_KIND_LABELS[hit.kind],
    parentContext: commercialParentContext(hit),
    commercialSummary: formatCommercialArrangement(resolved),
    commercialSource: resolved.source,
    inheritedFrom: inheritedFromLabel(resolved.source),
    isLegacy: resolved.accountingMode === "legacy_combined",
  };
}

export type CommercialPrecedenceStep = {
  scopeType: CommercialScopeType | "legacy";
  title: string;
  detail: string;
  hasOverride: boolean;
  isEffective: boolean;
};

export function buildCommercialPrecedencePath(input: {
  viewScope: CommercialScopeType;
  spaceName?: string | null;
  propertyName?: string | null;
  organisationName?: string | null;
  source: CommercialTermsSource;
}): CommercialPrecedenceStep[] {
  const steps: CommercialPrecedenceStep[] = [];
  if (input.viewScope === "space") {
    steps.push({
      scopeType: "space",
      title: "Space",
      detail: input.spaceName || "This space",
      hasOverride: input.source === "space",
      isEffective: input.source === "space",
    });
  }
  if (input.viewScope === "space" || input.viewScope === "property") {
    steps.push({
      scopeType: "property",
      title: "Property",
      detail: input.propertyName || "No property linked",
      hasOverride: input.source === "property",
      isEffective: input.source === "property",
    });
  }
  if (input.viewScope !== "platform") {
    steps.push({
      scopeType: "organisation",
      title: "Organisation",
      detail: input.organisationName || "No organisation linked",
      hasOverride: input.source === "organisation",
      isEffective: input.source === "organisation",
    });
  }
  steps.push({
    scopeType: "platform",
    title: "Platform default",
    detail: "Applies when no more specific override exists",
    hasOverride: input.source === "platform",
    isEffective: input.source === "platform",
  });
  steps.push({
    scopeType: "legacy",
    title: "Legacy fallback",
    detail: "Space-level fee, otherwise combined 15%",
    hasOverride: input.source === "legacy_space_percent",
    isEffective: input.source === "legacy_space_percent",
  });
  return steps;
}

export function subscriptionTierGapWarning(
  tiers: CommercialTermTier[]
): string | null {
  const sorted = [...tiers].sort((a, b) => a.minCount - b.minCount);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (prev.maxCount == null) continue;
    if (prev.maxCount + 1 < next.minCount) {
      return `There is a gap between ${prev.maxCount} and ${next.minCount}. Counts in that range will not match a tier.`;
    }
  }
  return null;
}

export function subscriptionPricingMethodLabel(
  mode: string | null | undefined
): string {
  if (mode === "by_space_count") return "Fixed tiers by space count";
  if (mode === "by_property_count") return "Fixed tiers by property count";
  if (mode === "progressive_space_pricing") return "Progressive pricing by space count";
  return "Fixed monthly";
}

/**
 * Distinguishes an uncovered inventory count from a configured R0 monthly fee.
 * Returns null when the current count matches a tier.
 */
export function subscriptionUncoveredInventoryWarning(input: {
  unresolvedReason: string | null | undefined;
  inventoryCount: number | null | undefined;
  inventoryBasis: "property" | "space" | "fixed" | null | undefined;
  tiers: CommercialTermTier[];
}): string | null {
  if (input.unresolvedReason !== "no_matching_tier") return null;
  const basis =
    input.inventoryBasis === "property" ? "properties" : "spaces";
  const count = input.inventoryCount ?? null;
  const finiteMaxes = input.tiers
    .map((tier) => tier.maxCount)
    .filter((value): value is number => value != null);
  const highestMax = finiteMaxes.length > 0 ? Math.max(...finiteMaxes) : null;
  if (count != null && highestMax != null && count > highestMax) {
    return `No subscription pricing covers ${highestMax + 1}+ ${basis}`;
  }
  if (count != null) {
    return `No matching subscription pricing for ${count} ${basis}`;
  }
  return "No matching subscription pricing";
}
