import {
  calculateBookingCommercials,
  type CommercialAccountingMode,
  type CommercialModel,
} from "@/lib/commercial-calculator";
import { subscriptionUncoveredInventoryWarning } from "@/lib/commercial-admin-display";
import type { ResolvedCommercialTerms } from "@/lib/commercial-terms";

export const HOST_COMMERCIAL_NEUTRAL =
  "FindMySpace fees apply according to your commercial agreement.";

export type HostCommercialArrangementDto = {
  summary: string;
  model: CommercialModel | "legacy";
  accountingMode: CommercialAccountingMode;
  commissionPercent: number | null;
  transactionFeePercent: number | null;
  monthlyAmount: number | null;
  subscriptionUnresolved: boolean;
  subscriptionUnresolvedMessage: string | null;
};

function formatHostPercent(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

export function formatHostCommercialArrangement(
  terms: ResolvedCommercialTerms
): string {
  if (terms.accountingMode === "legacy_combined") {
    return HOST_COMMERCIAL_NEUTRAL;
  }

  const tx = formatHostPercent(Number(terms.transactionFeePercent) || 0);

  if (terms.model === "subscription") {
    if (terms.subscription?.unresolvedReason) {
      return HOST_COMMERCIAL_NEUTRAL;
    }
    const monthly = Number(
      terms.subscription?.monthlyAmount ?? terms.monthlySubscriptionAmount
    );
    return `R${monthly.toFixed(2)}/month subscription + ${tx}% transaction fee on online payments`;
  }

  if (terms.model === "free") {
    return `0% platform commission + ${tx}% transaction fee`;
  }

  return `${formatHostPercent(Number(terms.commissionPercent) || 0)}% platform commission + ${tx}% transaction fee`;
}

export function toHostCommercialArrangementDto(
  terms: ResolvedCommercialTerms
): HostCommercialArrangementDto {
  const unresolved = Boolean(terms.subscription?.unresolvedReason);
  const uncovered = unresolved
    ? subscriptionUncoveredInventoryWarning({
        unresolvedReason: terms.subscription?.unresolvedReason ?? null,
        inventoryCount: terms.subscription?.inventoryCount ?? null,
        inventoryBasis: terms.subscription?.inventoryBasis ?? null,
        tiers: terms.tiers,
      })
    : null;

  return {
    summary: formatHostCommercialArrangement(terms),
    model: terms.accountingMode === "legacy_combined" ? "legacy" : terms.model,
    accountingMode: terms.accountingMode,
    commissionPercent:
      terms.accountingMode === "legacy_combined"
        ? null
        : Number(terms.commissionPercent) || 0,
    transactionFeePercent:
      terms.accountingMode === "legacy_combined"
        ? null
        : Number(terms.transactionFeePercent) || 0,
    monthlyAmount:
      terms.model === "subscription" && !unresolved
        ? Number(
            terms.subscription?.monthlyAmount ?? terms.monthlySubscriptionAmount
          )
        : null,
    subscriptionUnresolved: unresolved,
    subscriptionUnresolvedMessage: uncovered,
  };
}

export function estimateHostEarningsFromArrangement(
  grossAmount: number,
  arrangement: HostCommercialArrangementDto
) {
  if (arrangement.accountingMode !== "split") return null;
  if (arrangement.commissionPercent == null) return null;
  if (arrangement.transactionFeePercent == null) return null;
  const model: CommercialModel =
    arrangement.model === "legacy" ? "commission" : arrangement.model;
  return calculateBookingCommercials(grossAmount, {
    model,
    commissionPercent: arrangement.commissionPercent,
    transactionFeePercent: arrangement.transactionFeePercent,
    accountingMode: "split",
  });
}
