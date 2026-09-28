import {
  DEFAULT_TRANSACTION_FEE_PERCENT,
  LEGACY_COMBINED_PERCENT,
  type CommercialAccountingMode,
  type CommercialModel,
  type CommercialSplit,
} from "@/lib/commercial-calculator";
import type { BillableInventoryCounts } from "@/lib/commercial-inventory";
import {
  isProgressivePricingMode,
  normalizeSubscriptionPricingMode,
  parseCommercialTermTiers,
  progressiveUnitTypeForMode,
  resolveSubscriptionAmount,
  subscriptionBilledScope,
  validateProgressiveSubscriptionTiers,
  validateSubscriptionTiers,
  type CommercialTermTier,
  type SubscriptionPricingMode,
  type SubscriptionResolution,
} from "@/lib/commercial-subscription";

export type { CommercialModel, CommercialAccountingMode } from "@/lib/commercial-calculator";

export type CommercialScopeType =
  | "platform"
  | "organisation"
  | "property"
  | "space";

export type CommercialTermsSource = CommercialScopeType | "legacy_space_percent";

export const COMMERCIAL_SCOPE_PRECEDENCE: CommercialScopeType[] = [
  "space",
  "property",
  "organisation",
  "platform",
];

export const FORBIDDEN_CLIENT_COMMERCIAL_KEYS = [
  "commercial_model",
  "commission_percent",
  "transaction_fee_percent",
  "monthly_subscription_amount",
  "subscription_pricing_mode",
  "subscription_included_units",
  "tiers",
  "platform_fee",
  "owner_earnings",
  "platform_fee_percent",
  "platform_commission_percent",
  "platform_commission_amount",
  "transaction_fee_amount",
  "commercial_terms_id",
] as const;

export type CommercialTermRow = {
  id: string;
  scope_type: CommercialScopeType;
  scope_id: string | null;
  commercial_model: CommercialModel;
  commission_percent: number | string;
  transaction_fee_percent: number | string;
  monthly_subscription_amount: number | string;
  subscription_pricing_mode: SubscriptionPricingMode | null;
  subscription_included_units: number | string | null;
  effective_from: string;
  superseded_at: string | null;
  admin_note: string | null;
  created_by: string | null;
  created_at: string;
  tiers: CommercialTermTier[];
};

export type ResolvedCommercialTerms = {
  termsId: string | null;
  model: CommercialModel;
  commissionPercent: number;
  transactionFeePercent: number;
  monthlySubscriptionAmount: number;
  subscriptionPricingMode: SubscriptionPricingMode | null;
  subscriptionIncludedUnits: number | null;
  subscriptionBaseAmount: number | null;
  tiers: CommercialTermTier[];
  subscription: SubscriptionResolution | null;
  effectiveFrom: string | null;
  adminNote: string | null;
  source: CommercialTermsSource;
  accountingMode: CommercialAccountingMode;
};

export type ResolveCommercialTermsInput = {
  organisationId?: string | null;
  propertyId?: string | null;
  spaceId?: string | null;
  effectiveAt: Date | string;
  rows: CommercialTermRow[];
  legacySpacePercent?: number | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCommercialUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

export function toEffectiveDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid commercial effective date.");
  }
  return date;
}

export function legacyCombinedCommercialTerms(
  spacePercent?: number | null
): ResolvedCommercialTerms {
  const percent = Number(spacePercent);
  return {
    termsId: null,
    model: "commission",
    commissionPercent: Number.isFinite(percent) ? percent : LEGACY_COMBINED_PERCENT,
    transactionFeePercent: 0,
    monthlySubscriptionAmount: 0,
    subscriptionPricingMode: null,
    subscriptionIncludedUnits: null,
    subscriptionBaseAmount: null,
    tiers: [],
    subscription: null,
    effectiveFrom: null,
    adminNote: null,
    source: "legacy_space_percent",
    accountingMode: "legacy_combined",
  };
}

export function rowToResolved(
  row: CommercialTermRow,
  source: CommercialScopeType
): ResolvedCommercialTerms {
  const model = row.commercial_model;
  const pricingMode = normalizeSubscriptionPricingMode(
    model,
    row.subscription_pricing_mode
  );
  const tiers = row.tiers ?? [];
  const fixedMonthly = Number(row.monthly_subscription_amount) || 0;
  const includedRaw = row.subscription_included_units;
  const includedParsed =
    includedRaw == null || includedRaw === "" ? Number.NaN : Number(includedRaw);
  return {
    termsId: row.id,
    model,
    commissionPercent: Number(row.commission_percent) || 0,
    transactionFeePercent: Number(row.transaction_fee_percent) || 0,
    monthlySubscriptionAmount: fixedMonthly,
    subscriptionPricingMode: pricingMode,
    subscriptionIncludedUnits: Number.isFinite(includedParsed) ? includedParsed : null,
    subscriptionBaseAmount: isProgressivePricingMode(pricingMode)
      ? fixedMonthly
      : null,
    tiers,
    subscription: null,
    effectiveFrom: row.effective_from,
    adminNote: row.admin_note,
    source,
    accountingMode: "split",
  };
}

export function withSubscriptionResolution(
  terms: ResolvedCommercialTerms,
  input: {
    organisationId?: string | null;
    propertyId?: string | null;
    spaceId?: string | null;
    inventory?: BillableInventoryCounts | null;
  }
): ResolvedCommercialTerms {
  const billedScope = subscriptionBilledScope({
    source: terms.source,
    organisationId: input.organisationId,
    propertyId: input.propertyId,
    spaceId: input.spaceId,
  });
  const storedBase = isProgressivePricingMode(terms.subscriptionPricingMode)
    ? terms.subscriptionBaseAmount ?? terms.monthlySubscriptionAmount
    : terms.monthlySubscriptionAmount;
  const subscription = resolveSubscriptionAmount({
    model: terms.model,
    pricingMode: terms.subscriptionPricingMode,
    fixedMonthlyAmount: storedBase,
    includedUnits: terms.subscriptionIncludedUnits,
    tiers: terms.tiers,
    inventory: input.inventory ?? null,
    billedScope,
  });
  return {
    ...terms,
    monthlySubscriptionAmount:
      terms.model === "subscription" ? subscription.monthlyAmount : 0,
    subscriptionBaseAmount: isProgressivePricingMode(terms.subscriptionPricingMode)
      ? storedBase
      : null,
    subscription,
  };
}

function isEffectiveAt(
  row: CommercialTermRow,
  effectiveAt: Date
): boolean {
  const from = new Date(row.effective_from);
  if (Number.isNaN(from.getTime()) || from.getTime() > effectiveAt.getTime()) {
    return false;
  }
  if (!row.superseded_at) return true;
  const until = new Date(row.superseded_at);
  if (Number.isNaN(until.getTime())) return true;
  return until.getTime() > effectiveAt.getTime();
}

export function pickEffectiveRow(
  rows: CommercialTermRow[],
  scopeType: CommercialScopeType,
  scopeId: string | null,
  effectiveAt: Date
): CommercialTermRow | null {
  const matches = rows.filter((row) => {
    if (row.scope_type !== scopeType) return false;
    if (scopeType === "platform") return row.scope_id == null;
    return row.scope_id === scopeId;
  });

  const live = matches
    .filter((row) => isEffectiveAt(row, effectiveAt))
    .sort(
      (a, b) =>
        new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime()
    );

  return live[0] ?? null;
}

/**
 * Space > property > organisation > platform default > legacy space percent.
 * An override is a more specific Global Admin rule, never a host-editable flag.
 */
export function resolveCommercialTerms(
  input: ResolveCommercialTermsInput
): ResolvedCommercialTerms {
  const effectiveAt = toEffectiveDate(input.effectiveAt);
  const spaceId = input.spaceId ?? null;
  const propertyId = input.propertyId ?? null;
  const organisationId = input.organisationId ?? null;

  if (spaceId) {
    const row = pickEffectiveRow(input.rows, "space", spaceId, effectiveAt);
    if (row) return rowToResolved(row, "space");
  }
  if (propertyId) {
    const row = pickEffectiveRow(input.rows, "property", propertyId, effectiveAt);
    if (row) return rowToResolved(row, "property");
  }
  if (organisationId) {
    const row = pickEffectiveRow(
      input.rows,
      "organisation",
      organisationId,
      effectiveAt
    );
    if (row) return rowToResolved(row, "organisation");
  }

  const platform = pickEffectiveRow(input.rows, "platform", null, effectiveAt);
  if (platform) return rowToResolved(platform, "platform");

  return legacyCombinedCommercialTerms(input.legacySpacePercent);
}

export function inheritedFromLabel(source: CommercialTermsSource): string {
  if (source === "legacy_space_percent") return "Platform default (legacy combined)";
  if (source === "platform") return "Platform default";
  if (source === "organisation") return "Organisation";
  if (source === "property") return "Property";
  return "Space";
}

export function formatCommercialArrangement(
  terms: ResolvedCommercialTerms
): string {
  const tx = Number(terms.transactionFeePercent).toFixed(2);
  if (terms.accountingMode === "legacy_combined") {
    return `Legacy combined ${Number(terms.commissionPercent).toFixed(2)}% FindMySpace fee`;
  }
  if (terms.model === "subscription") {
    if (terms.subscription?.unresolvedReason) {
      return `Subscription unresolved · ${tx}% transaction`;
    }
    const monthly = Number(
      terms.subscription?.monthlyAmount ?? terms.monthlySubscriptionAmount
    ).toFixed(2);
    const mode = terms.subscriptionPricingMode;
    if (mode === "by_space_count") {
      return `Subscription by spaces · R${monthly}/month + ${tx}% transaction`;
    }
    if (mode === "by_property_count") {
      return `Subscription by properties · R${monthly}/month + ${tx}% transaction`;
    }
    if (mode === "progressive_space_pricing") {
      return `Progressive per-space · R${monthly}/month + ${tx}% transaction`;
    }
    if (mode === "progressive_property_pricing") {
      return `Progressive per-property · R${monthly}/month + ${tx}% transaction`;
    }
    return `R${monthly}/month + ${tx}% transaction`;
  }
  if (terms.model === "free") {
    return `0% platform + ${tx}% transaction`;
  }
  return `${Number(terms.commissionPercent).toFixed(2)}% platform + ${tx}% transaction`;
}

export function hasForbiddenClientCommercialKeys(
  payload: Record<string, unknown> | null | undefined
): boolean {
  if (!payload) return false;
  return FORBIDDEN_CLIENT_COMMERCIAL_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key)
  );
}

export function stripForbiddenClientCommercialKeys<T extends Record<string, unknown>>(
  payload: T
): T {
  const next = { ...payload };
  for (const key of FORBIDDEN_CLIENT_COMMERCIAL_KEYS) {
    delete next[key];
  }
  return next;
}

export type CommercialTermsWriteInput = {
  scopeType: CommercialScopeType;
  scopeId: string | null;
  model: CommercialModel;
  commissionPercent: number;
  transactionFeePercent: number;
  monthlySubscriptionAmount: number;
  subscriptionPricingMode: SubscriptionPricingMode | null;
  subscriptionIncludedUnits: number | null;
  tiers: CommercialTermTier[];
  effectiveFrom: string;
  adminNote: string | null;
};

export function parseCommercialTermsWriteBody(
  body: unknown
): { ok: true; value: CommercialTermsWriteInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid commercial terms payload." };
  }
  const raw = body as Record<string, unknown>;
  const scopeType = raw.scope_type;
  if (
    scopeType !== "platform" &&
    scopeType !== "organisation" &&
    scopeType !== "property" &&
    scopeType !== "space"
  ) {
    return { ok: false, error: "scope_type must be platform, organisation, property, or space." };
  }

  const scopeIdRaw = raw.scope_id;
  const scopeId =
    scopeIdRaw == null || scopeIdRaw === ""
      ? null
      : typeof scopeIdRaw === "string"
        ? scopeIdRaw
        : null;

  if (scopeType === "platform") {
    if (scopeId != null) {
      return { ok: false, error: "Platform commercial terms cannot have a scope_id." };
    }
  } else if (!isCommercialUuid(scopeId)) {
    return { ok: false, error: "scope_id must be a valid id for this scope." };
  }

  const model = raw.commercial_model;
  if (model !== "commission" && model !== "subscription" && model !== "free") {
    return { ok: false, error: "commercial_model must be commission, subscription, or free." };
  }

  const commissionPercent = Number(raw.commission_percent);
  const transactionFeePercent = Number(
    raw.transaction_fee_percent ?? DEFAULT_TRANSACTION_FEE_PERCENT
  );
  const monthlySubscriptionAmount = Number(raw.monthly_subscription_amount ?? 0);

  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { ok: false, error: "commission_percent must be between 0 and 100." };
  }
  if (
    !Number.isFinite(transactionFeePercent) ||
    transactionFeePercent < 0 ||
    transactionFeePercent > 100
  ) {
    return { ok: false, error: "transaction_fee_percent must be between 0 and 100." };
  }
  if (
    !Number.isFinite(monthlySubscriptionAmount) ||
    monthlySubscriptionAmount < 0
  ) {
    return { ok: false, error: "monthly_subscription_amount must be 0 or greater." };
  }
  if (commissionPercent + transactionFeePercent > 100) {
    return { ok: false, error: "Commission plus transaction fee cannot exceed 100%." };
  }

  const effectiveFromRaw =
    typeof raw.effective_from === "string" ? raw.effective_from.trim() : "";
  if (!effectiveFromRaw) {
    return { ok: false, error: "effective_from is required." };
  }
  const effectiveFromDate = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(effectiveFromRaw)
      ? `${effectiveFromRaw}T00:00:00+02:00`
      : effectiveFromRaw
  );
  if (Number.isNaN(effectiveFromDate.getTime())) {
    return { ok: false, error: "effective_from must be a valid date." };
  }

  const adminNote =
    typeof raw.admin_note === "string" ? raw.admin_note.trim() || null : null;

  let nextCommission = Number(commissionPercent.toFixed(3));
  let nextMonthly = Number(monthlySubscriptionAmount.toFixed(2));
  const nextTx = Number(transactionFeePercent.toFixed(3));
  const parsedTiers = parseCommercialTermTiers(raw.tiers);
  if (!parsedTiers.ok) return parsedTiers;

  let subscriptionPricingMode: SubscriptionPricingMode | null = null;
  let tiers: CommercialTermTier[] = [];
  let subscriptionIncludedUnits: number | null = null;

  if (model === "free") {
    nextCommission = 0;
    nextMonthly = 0;
  } else if (model === "subscription") {
    nextCommission = 0;
    subscriptionPricingMode = normalizeSubscriptionPricingMode(
      model,
      typeof raw.subscription_pricing_mode === "string"
        ? raw.subscription_pricing_mode
        : null
    );
    if (subscriptionPricingMode === "fixed") {
      tiers = [];
    } else if (isProgressivePricingMode(subscriptionPricingMode)) {
      const unitType = progressiveUnitTypeForMode(subscriptionPricingMode);
      const noun = unitType === "property" ? "Properties" : "Spaces";
      const includedRaw =
        raw.subscription_included_units ?? raw.subscriptionIncludedUnits ?? 0;
      const includedUnits = Number(includedRaw);
      if (
        !Number.isFinite(includedUnits) ||
        includedUnits < 0 ||
        !Number.isInteger(includedUnits)
      ) {
        return {
          ok: false,
          error: `${noun} included must be a whole number of 0 or more.`,
        };
      }
      const valid = validateProgressiveSubscriptionTiers(
        parsedTiers.value,
        unitType
      );
      if (!valid.ok) return valid;
      if (
        parsedTiers.value.some(
          (tier) =>
            tier.incrementalAmount == null ||
            !Number.isFinite(tier.incrementalAmount)
        )
      ) {
        return {
          ok: false,
          error: `Each pricing band needs a price per additional ${unitType}.`,
        };
      }
      tiers = parsedTiers.value;
      subscriptionIncludedUnits = includedUnits;
    } else {
      const valid = validateSubscriptionTiers(parsedTiers.value);
      if (!valid.ok) return valid;
      tiers = parsedTiers.value;
      nextMonthly = 0;
    }
  } else {
    nextMonthly = 0;
  }

  return {
    ok: true,
    value: {
      scopeType,
      scopeId,
      model,
      commissionPercent: nextCommission,
      transactionFeePercent: nextTx,
      monthlySubscriptionAmount: nextMonthly,
      subscriptionPricingMode,
      subscriptionIncludedUnits,
      tiers,
      effectiveFrom: effectiveFromDate.toISOString(),
      adminNote,
    },
  };
}

export function snapshotBookingCommercialInsert(
  split: CommercialSplit,
  terms: ResolvedCommercialTerms,
  effectiveAt: Date | string
): Record<string, unknown> {
  const at = toEffectiveDate(effectiveAt).toISOString();
  if (split.accountingMode === "legacy_combined") {
    return {
      commercial_model: null,
      platform_commission_percent: null,
      transaction_fee_percent: null,
      platform_commission_amount: null,
      transaction_fee_amount: null,
      monthly_subscription_amount: null,
      commercial_terms_id: null,
      commercial_terms_source: "legacy_space_percent",
      commercial_terms_effective_at: at,
    };
  }

  return {
    commercial_model: terms.model,
    platform_commission_percent: terms.commissionPercent,
    transaction_fee_percent: terms.transactionFeePercent,
    platform_commission_amount: split.platformCommission,
    transaction_fee_amount: split.transactionFee,
    monthly_subscription_amount:
      terms.model === "subscription" ? terms.monthlySubscriptionAmount : 0,
    commercial_terms_id: terms.termsId,
    commercial_terms_source: terms.source,
    commercial_terms_effective_at: at,
  };
}

export function canMutateCommercialTerms(input: {
  isGlobalAdmin?: boolean;
  isOrganisationAdmin?: boolean;
  isPropertyManager?: boolean;
  isSpaceManager?: boolean;
}): boolean {
  return Boolean(input.isGlobalAdmin);
}
