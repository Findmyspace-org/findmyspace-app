"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  DEFAULT_COMMISSION_PERCENT,
  DEFAULT_TRANSACTION_FEE_PERCENT,
} from "@/lib/commercial-calculator";
import {
  commercialCalendarDate,
  commercialEffectiveDateConflictMessage,
  formatCommercialShortDate,
  suggestedCommercialEffectiveDate,
  type CommercialModel,
  type CommercialScopeType,
} from "@/lib/commercial-terms";
import {
  commercialTiersToProgressiveBands,
  isProgressivePricingMode,
  isPropertyCountPricingMode,
  progressiveUnitTypeForMode,
  resolveSubscriptionAmount,
  type CommercialTermTier,
  type SubscriptionPricingMode,
  type SubscriptionResolution,
} from "@/lib/commercial-subscription";
import {
  calculateProgressiveSubscription,
  displayProgressiveBandLabel,
  progressiveBandGapWarning,
  progressiveBandMilestoneCounts,
  progressivePreviewCounts,
  progressiveUnitNoun,
} from "@/lib/commercial-progressive-pricing";
import {
  BILLABLE_INVENTORY_HELP,
  BILLABLE_PROPERTY_HELP,
  FIXED_TIER_HELP,
  PLATFORM_DEFAULT_UNCONFIGURED_BODY,
  PLATFORM_DEFAULT_UNCONFIGURED_TITLE,
  PROGRESSIVE_PRICING_HELP,
  subscriptionPricingMethodLabel,
  subscriptionTierGapWarning,
  subscriptionUncoveredInventoryWarning,
  type CommercialPrecedenceStep,
} from "@/lib/commercial-admin-display";

type ResolvedDto = {
  termsId?: string | null;
  model: CommercialModel;
  commissionPercent: number;
  transactionFeePercent: number;
  monthlySubscriptionAmount: number;
  subscriptionPricingMode: SubscriptionPricingMode | null;
  subscriptionIncludedUnits?: number | null;
  subscriptionBaseAmount?: number | null;
  tiers: CommercialTermTier[];
  subscription: SubscriptionResolution | null;
  effectiveFrom: string | null;
  adminNote: string | null;
  source: string;
  accountingMode: string;
  inheritedFrom: string;
  inherited?: boolean;
  isOverride?: boolean;
  summary: string;
};

type TermRow = {
  id: string;
  scope_type: CommercialScopeType;
  scope_id: string | null;
  commercial_model: CommercialModel;
  commission_percent: number | string;
  transaction_fee_percent: number | string;
  monthly_subscription_amount: number | string;
  subscription_pricing_mode?: SubscriptionPricingMode | null;
  effective_from: string;
  superseded_at: string | null;
  admin_note: string | null;
  tiers?: CommercialTermTier[];
};

type TierDraft = {
  minCount: string;
  maxCount: string;
  monthlyAmount: string;
  incrementalAmount: string;
  label: string;
};

function todayIsoDate(): string {
  return commercialCalendarDate(new Date());
}

function money(value: number | string | null | undefined): string {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function emptyTier(): TierDraft {
  return {
    minCount: "1",
    maxCount: "",
    monthlyAmount: "0",
    incrementalAmount: "",
    label: "",
  };
}

function emptyBand(): TierDraft {
  return {
    minCount: "",
    maxCount: "",
    monthlyAmount: "0",
    incrementalAmount: "",
    label: "",
  };
}

function tiersToDrafts(tiers: CommercialTermTier[] | undefined): TierDraft[] {
  if (!tiers || tiers.length === 0) return [emptyTier()];
  return tiers.map((tier) => ({
    minCount: String(tier.minCount),
    maxCount: tier.maxCount == null ? "" : String(tier.maxCount),
    monthlyAmount: String(tier.monthlyAmount),
    incrementalAmount:
      tier.incrementalAmount == null ? "" : String(tier.incrementalAmount),
    label: tier.label || "",
  }));
}

function bandsToDrafts(
  tiers: CommercialTermTier[] | undefined,
  unitType: "space" | "property" = "space"
): TierDraft[] {
  if (!tiers || tiers.length === 0) return [emptyBand()];
  return tiers.map((tier) => ({
    minCount: String(tier.minCount),
    maxCount: tier.maxCount == null ? "" : String(tier.maxCount),
    monthlyAmount: "0",
    incrementalAmount:
      tier.incrementalAmount == null ? "" : String(tier.incrementalAmount),
    label: displayProgressiveBandLabel(
      unitType,
      tier.label,
      tier.minCount,
      tier.maxCount == null ? null : Number(tier.maxCount)
    ),
  }));
}

function draftsToPayload(drafts: TierDraft[], progressive: boolean) {
  return drafts.map((tier, index) => ({
    min_count: Number(tier.minCount),
    max_count: tier.maxCount.trim() === "" ? null : Number(tier.maxCount),
    monthly_amount: progressive ? 0 : Number(tier.monthlyAmount),
    incremental_amount: progressive ? Number(tier.incrementalAmount) : null,
    label: tier.label.trim() || null,
    sort_order: index,
  }));
}

function formatTierRange(tier: CommercialTermTier): string {
  if (tier.maxCount == null) return `${tier.minCount}+`;
  return `${tier.minCount}–${tier.maxCount}`;
}

export function AdminCommercialTermsPanel({
  scopeType,
  scopeId,
  organisationId,
  propertyId,
  spaceId,
  title = "Commercial terms",
}: {
  scopeType: CommercialScopeType;
  scopeId?: string | null;
  organisationId?: string | null;
  propertyId?: string | null;
  spaceId?: string | null;
  title?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [resolved, setResolved] = useState<ResolvedDto | null>(null);
  const [history, setHistory] = useState<TermRow[]>([]);
  const [precedence, setPrecedence] = useState<CommercialPrecedenceStep[]>([]);

  const [model, setModel] = useState<CommercialModel>("commission");
  const [commissionPercent, setCommissionPercent] = useState(
    String(DEFAULT_COMMISSION_PERCENT)
  );
  const [transactionFeePercent, setTransactionFeePercent] = useState(
    String(DEFAULT_TRANSACTION_FEE_PERCENT)
  );
  const [pricingMode, setPricingMode] = useState<SubscriptionPricingMode>("fixed");
  const [monthlySubscriptionAmount, setMonthlySubscriptionAmount] = useState("0");
  const [includedUnits, setIncludedUnits] = useState("0");
  const [tiers, setTiers] = useState<TierDraft[]>([emptyTier()]);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIsoDate);
  const [allowIncompleteSchedule, setAllowIncompleteSchedule] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [inventory, setInventory] = useState<{
    propertyCount: number;
    spaceCount: number;
  } | null>(null);
  const [labels, setLabels] = useState<{
    organisationName: string | null;
    propertyName: string | null;
    spaceName: string | null;
  } | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (organisationId) params.set("organisationId", organisationId);
    if (propertyId) params.set("propertyId", propertyId);
    if (spaceId) params.set("spaceId", spaceId);
    return params.toString();
  }, [organisationId, propertyId, spaceId]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const json = (await adminApiFetch(
        `/api/admin/commercial-terms${query ? `?${query}` : ""}`
      )) as {
        resolved?: ResolvedDto;
        terms?: TermRow[];
        precedence?: CommercialPrecedenceStep[];
        inventory?: { propertyCount: number; spaceCount: number } | null;
        labels?: {
          organisationName: string | null;
          propertyName: string | null;
          spaceName: string | null;
        };
      };
      setResolved(json.resolved ?? null);
      setPrecedence(json.precedence ?? []);
      setInventory(json.inventory ?? null);
      setLabels(json.labels ?? null);
      const rows = json.terms ?? [];
      const scopeRows = rows.filter((row) =>
        scopeType === "platform"
          ? row.scope_type === "platform"
          : row.scope_type === scopeType && row.scope_id === (scopeId ?? null)
      );
      setHistory(scopeRows);
      setEffectiveFrom(
        suggestedCommercialEffectiveDate({
          occupiedFrom: scopeRows.map((row) => row.effective_from),
          today: todayIsoDate(),
        })
      );
      setAllowIncompleteSchedule(false);
      if (json.resolved?.accountingMode === "split") {
        setModel(json.resolved.model);
        setCommissionPercent(String(json.resolved.commissionPercent));
        setTransactionFeePercent(String(json.resolved.transactionFeePercent));
        setMonthlySubscriptionAmount(
          String(
            isProgressivePricingMode(json.resolved.subscriptionPricingMode)
              ? json.resolved.subscriptionBaseAmount ??
                  json.resolved.monthlySubscriptionAmount
              : json.resolved.monthlySubscriptionAmount
          )
        );
        setIncludedUnits(String(json.resolved.subscriptionIncludedUnits ?? 0));
        setPricingMode(json.resolved.subscriptionPricingMode || "fixed");
        setTiers(
          isProgressivePricingMode(json.resolved.subscriptionPricingMode)
            ? bandsToDrafts(
                json.resolved.tiers,
                progressiveUnitTypeForMode(json.resolved.subscriptionPricingMode)
              )
            : tiersToDrafts(json.resolved.tiers)
        );
        setAdminNote(json.resolved.adminNote || "");
      }
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Could not load commercial terms.");
    } finally {
      setLoading(false);
    }
  }, [query, scopeId, scopeType]);

  useEffect(() => {
    void load();
  }, [load]);

  const subscription = resolved?.subscription ?? null;
  const saveLabel =
    scopeType === "platform"
      ? "Save platform default from effective date"
      : resolved?.inherited
        ? `Create ${scopeType} override from effective date`
        : `Save ${scopeType} override from effective date`;
  const parsedDraftTiers: CommercialTermTier[] = useMemo(
    () =>
      tiers.map((tier, index) => ({
        id: null,
        minCount: Number(tier.minCount),
        maxCount: tier.maxCount.trim() === "" ? null : Number(tier.maxCount),
        monthlyAmount: Number(tier.monthlyAmount) || 0,
        incrementalAmount:
          tier.incrementalAmount.trim() === ""
            ? null
            : Number(tier.incrementalAmount),
        label: tier.label || null,
        sortOrder: index,
      })),
    [tiers]
  );
  const progressiveUnitType = progressiveUnitTypeForMode(pricingMode);
  const propertyBased = isPropertyCountPricingMode(pricingMode);
  const gapWarning = useMemo(() => {
    if (model !== "subscription" || pricingMode === "fixed") return null;
    if (isProgressivePricingMode(pricingMode)) {
      return progressiveBandGapWarning(
        Number(includedUnits) || 0,
        commercialTiersToProgressiveBands(parsedDraftTiers),
        progressiveUnitTypeForMode(pricingMode)
      );
    }
    return subscriptionTierGapWarning(parsedDraftTiers);
  }, [includedUnits, model, parsedDraftTiers, pricingMode]);
  const effectiveDateConflict = useMemo(() => {
    const occupiedMatch = history.find(
      (row) => commercialCalendarDate(row.effective_from) === effectiveFrom
    );
    if (!occupiedMatch) return null;
    return commercialEffectiveDateConflictMessage(
      occupiedMatch.effective_from,
      suggestedCommercialEffectiveDate({
        occupiedFrom: history.map((row) => row.effective_from),
        today: effectiveFrom,
      })
    );
  }, [effectiveFrom, history]);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const occupiedMatch = history.find(
        (row) => commercialCalendarDate(row.effective_from) === effectiveFrom
      );
      if (occupiedMatch) {
        setMessageTone("error");
        setMessage(
          commercialEffectiveDateConflictMessage(
            occupiedMatch.effective_from,
            suggestedCommercialEffectiveDate({
              occupiedFrom: history.map((row) => row.effective_from),
              today: effectiveFrom,
            })
          )
        );
        return;
      }
      const progressiveIncomplete =
        model === "subscription" &&
        isProgressivePricingMode(pricingMode) &&
        Boolean(gapWarning);
      if (progressiveIncomplete && !allowIncompleteSchedule) {
        setMessageTone("error");
        setMessage(
          gapWarning ||
            "Complete the progressive pricing schedule before saving."
        );
        return;
      }
      await adminApiFetch("/api/admin/commercial-terms", {
        method: "POST",
        body: JSON.stringify({
          scope_type: scopeType,
          scope_id: scopeType === "platform" ? null : scopeId,
          commercial_model: model,
          commission_percent: Number(commissionPercent),
          transaction_fee_percent: Number(transactionFeePercent),
          monthly_subscription_amount: Number(monthlySubscriptionAmount),
          subscription_pricing_mode: model === "subscription" ? pricingMode : null,
          subscription_included_units:
            model === "subscription" && isProgressivePricingMode(pricingMode)
              ? Number(includedUnits)
              : null,
          tiers:
            model === "subscription" && pricingMode !== "fixed"
              ? draftsToPayload(tiers, isProgressivePricingMode(pricingMode))
              : [],
          effective_from: effectiveFrom,
          admin_note: adminNote,
          allow_incomplete_schedule: progressiveIncomplete && allowIncompleteSchedule,
        }),
      });
      setMessageTone("success");
      setMessage("Commercial terms saved. Existing bookings keep their original fees.");
      await load();
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Could not save commercial terms.");
    } finally {
      setSaving(false);
    }
  }

  const progressivePreview = useMemo(() => {
    if (model !== "subscription" || !isProgressivePricingMode(pricingMode)) {
      return [];
    }
    const unitType = progressiveUnitTypeForMode(pricingMode);
    const bands = commercialTiersToProgressiveBands(parsedDraftTiers);
    const counts = progressivePreviewCounts(
      Number(includedUnits) || 0,
      bands,
      unitType
    );
    return counts.map((count) => ({
      count,
      result: calculateProgressiveSubscription({
        baseAmount: Number(monthlySubscriptionAmount) || 0,
        includedUnits: Number(includedUnits) || 0,
        bands,
        unitCount: count,
        unitType,
      }),
    }));
  }, [
    includedUnits,
    model,
    monthlySubscriptionAmount,
    parsedDraftTiers,
    pricingMode,
  ]);
  const proposedResolution = useMemo(() => {
    if (model !== "subscription") return null;
    const billedScope =
      scopeType === "space" && spaceId
        ? { scopeType: "space" as const, scopeId: spaceId }
        : scopeType === "property" && propertyId
          ? { scopeType: "property" as const, scopeId: propertyId }
          : organisationId
            ? { scopeType: "organisation" as const, scopeId: organisationId }
            : null;
    return resolveSubscriptionAmount({
      model: "subscription",
      pricingMode,
      fixedMonthlyAmount: Number(monthlySubscriptionAmount) || 0,
      includedUnits: Number(includedUnits) || 0,
      tiers: parsedDraftTiers,
      inventory: inventory
        ? {
            scopeType: billedScope?.scopeType ?? "organisation",
            scopeId: billedScope?.scopeId ?? organisationId ?? "",
            propertyCount: inventory.propertyCount,
            spaceCount: inventory.spaceCount,
            organisationBillable: true,
          }
        : null,
      billedScope,
    });
  }, [
    includedUnits,
    inventory,
    model,
    monthlySubscriptionAmount,
    organisationId,
    parsedDraftTiers,
    pricingMode,
    propertyId,
    scopeType,
    spaceId,
  ]);
  const impactEntityName =
    scopeType === "space"
      ? labels?.spaceName
      : scopeType === "property"
        ? labels?.propertyName
        : scopeType === "organisation"
          ? labels?.organisationName
          : "Platform default";
  const uncoveredWarning = subscriptionUncoveredInventoryWarning({
    unresolvedReason: subscription?.unresolvedReason ?? null,
    inventoryCount: subscription?.inventoryCount ?? null,
    inventoryBasis: subscription?.inventoryBasis ?? null,
    tiers: resolved?.tiers ?? [],
  });
  const subscriptionUnresolved = Boolean(subscription?.unresolvedReason);
  const unconfiguredPlatform =
    scopeType === "platform" && resolved?.accountingMode === "legacy_combined";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Global Admin only. Hosts, organisation admins, and managers cannot change
        these terms. A more specific override may use a completely different model
        from the platform default. Historical bookings and monthly snapshots are
        never rewritten.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading commercial terms…</p>
      ) : resolved ? (
        <div className="mt-4 space-y-3">
          {unconfiguredPlatform ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-[#192a3a]">
                {PLATFORM_DEFAULT_UNCONFIGURED_TITLE}
              </p>
              <p className="mt-1 text-gray-600">{PLATFORM_DEFAULT_UNCONFIGURED_BODY}</p>
              <p className="mt-2 text-gray-700">
                Current fallback: {resolved.summary}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>
                <span className="font-medium text-[#192a3a]">
                  Effective commercial terms:
                </span>{" "}
                {resolved.summary}
              </p>
              <p className="mt-1 text-gray-600">
                Source: {resolved.inheritedFrom}
                {resolved.inherited ? " · inherited" : " · override at this scope"}
                {resolved.effectiveFrom
                  ? ` · effective ${new Date(resolved.effectiveFrom).toLocaleDateString("en-ZA")}`
                  : ""}
              </p>
              {resolved.model === "subscription" ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-xs text-gray-700">
                  <div>
                    <dt className="font-medium text-gray-500">Subscription basis</dt>
                    <dd>
                      {subscriptionPricingMethodLabel(
                        resolved.subscriptionPricingMode
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Monthly subscription</dt>
                    <dd>
                      {subscriptionUnresolved
                        ? "Unresolved — not a R0 subscription"
                        : money(
                            subscription?.monthlyAmount ??
                              resolved.monthlySubscriptionAmount
                          )}
                    </dd>
                  </div>
                  {subscription?.inventoryCount != null ? (
                    <div>
                      <dt className="font-medium text-gray-500">
                        {subscription.inventoryBasis === "property"
                          ? "Current billable properties"
                          : "Current billable spaces"}
                      </dt>
                      <dd>
                        {subscription.inventoryCount}{" "}
                        {subscription.inventoryBasis === "property"
                          ? "properties"
                          : "spaces"}
                      </dd>
                    </div>
                  ) : null}
                  {subscription?.matchedTier ? (
                    <div>
                      <dt className="font-medium text-gray-500">Matched tier</dt>
                      <dd>
                        {subscription.matchedTier.label ||
                          formatTierRange(subscription.matchedTier)}{" "}
                        · {money(subscription.matchedTier.monthlyAmount)}
                      </dd>
                    </div>
                  ) : null}
                  {resolved.subscriptionPricingMode &&
                  resolved.subscriptionPricingMode !== "fixed" ? (
                    <p className="sm:col-span-2 text-gray-500">
                      {isPropertyCountPricingMode(resolved.subscriptionPricingMode)
                        ? BILLABLE_PROPERTY_HELP
                        : BILLABLE_INVENTORY_HELP}
                    </p>
                  ) : null}
                  {subscription?.unresolvedReason === "platform_default_needs_scope" ? (
                    <p className="sm:col-span-2 text-gray-500">
                      Select an organisation, property, or space to see the inventory
                      count and matched tier for this default.
                    </p>
                  ) : null}
                  {subscription?.unresolvedReason === "no_matching_tier" ? (
                    <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
                      <p className="font-semibold">
                        {uncoveredWarning || "No matching subscription tier"}
                      </p>
                      <p className="mt-1">
                        This is not a valid R0 subscription. Do not create a billable
                        subscription period until a covering tier is saved.
                      </p>
                    </div>
                  ) : null}
                  {subscription?.unresolvedReason === "ambiguous_overlapping_tiers" ? (
                    <p className="sm:col-span-2 text-amber-800">
                      Overlapping tiers match this inventory count. Save a new terms
                      version with non-overlapping ranges.
                    </p>
                  ) : null}
                </dl>
              ) : null}
              {resolved.adminNote ? (
                <p className="mt-2 text-xs text-gray-500">
                  Internal note: {resolved.adminNote}
                </p>
              ) : null}
            </div>
          )}

          {precedence.length > 0 ? (
            <ol className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-gray-700">
              <li className="mb-2 font-semibold uppercase tracking-wide text-gray-500">
                Resolution path
              </li>
              {precedence.map((step, index) => (
                <li
                  key={`${step.scopeType}-${index}`}
                  className={`flex flex-col gap-0.5 py-1 ${
                    step.isEffective ? "font-medium text-[#192a3a]" : ""
                  }`}
                >
                  <span>
                    {step.title}: {step.detail}
                    {step.isEffective
                      ? " → effective terms"
                      : step.hasOverride
                        ? " · override"
                        : " · no override"}
                  </span>
                  {index < precedence.length - 1 ? (
                    <span className="text-gray-400">↓</span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Commercial model
          <select
            value={model}
            onChange={(event) => setModel(event.target.value as CommercialModel)}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="commission">Commission</option>
            <option value="subscription">Monthly subscription</option>
            <option value="free">Free / waived platform fee</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-gray-600 sm:col-span-1">
          {resolved?.effectiveFrom ? (
            <>
              <p>
                <span className="font-medium text-gray-700">
                  Current version effective from:
                </span>{" "}
                {formatCommercialShortDate(resolved.effectiveFrom)}
              </p>
              <label className="flex flex-col gap-1">
                New version effective from
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-2 text-sm"
                />
              </label>
              <p className="text-[11px] leading-4 text-gray-500">
                Changing commercial terms creates a new version. The previous
                version remains valid until the new version becomes effective.
              </p>
            </>
          ) : (
            <label className="flex flex-col gap-1">
              Effective from
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className="rounded-md border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
          )}
          {effectiveDateConflict ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              {effectiveDateConflict}
            </p>
          ) : null}
        </div>
        {model === "commission" ? (
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Platform commission (%)
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={commissionPercent}
              onChange={(event) => setCommissionPercent(event.target.value)}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Transaction fee (%)
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={transactionFeePercent}
            onChange={(event) => setTransactionFeePercent(event.target.value)}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          />
        </label>
        {model === "subscription" ? (
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Subscription pricing
            <select
              value={pricingMode}
              onChange={(event) => {
                const next = event.target.value as SubscriptionPricingMode;
                setPricingMode(next);
                if (isProgressivePricingMode(next)) {
                  setTiers((current) =>
                    current.length > 0 ? current : [emptyBand()]
                  );
                }
              }}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="fixed">Fixed monthly</option>
              <option value="by_property_count">Fixed tiers by property count</option>
              <option value="by_space_count">Fixed tiers by space count</option>
              <option value="progressive_property_pricing">
                Progressive pricing by property count
              </option>
              <option value="progressive_space_pricing">
                Progressive pricing by space count
              </option>
            </select>
          </label>
        ) : null}
        {model === "subscription" && pricingMode === "fixed" ? (
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Monthly subscription (ZAR)
            <input
              type="number"
              min={0}
              step="0.01"
              value={monthlySubscriptionAmount}
              onChange={(event) => setMonthlySubscriptionAmount(event.target.value)}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-gray-600 sm:col-span-2">
          Admin note (internal)
          <input
            type="text"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            placeholder="School partnership — platform fee waived"
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          />
        </label>
      </div>

      {model === "subscription" &&
      (pricingMode === "by_property_count" ||
        pricingMode === "by_space_count") ? (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Subscription pricing structure
          </h3>
          <p className="mt-1 text-xs text-gray-600">{FIXED_TIER_HELP}</p>
          <p className="mt-1 text-xs text-gray-500">
            Leave maximum blank for an open-ended highest tier. Ranges cannot
            overlap. Gaps are allowed but those counts will not match a tier.
          </p>
          <div className="mt-2 space-y-2">
            {tiers.map((tier, index) => (
              <div
                key={`tier-${index}`}
                className="grid gap-2 sm:grid-cols-5 rounded-md border border-gray-200 p-2"
              >
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  From {propertyBased ? "property" : "space"}
                  <input
                    type="number"
                    min={0}
                    value={tier.minCount}
                    onChange={(event) => {
                      const next = [...tiers];
                      next[index] = { ...tier, minCount: event.target.value };
                      setTiers(next);
                    }}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  To {propertyBased ? "property" : "space"}
                  <input
                    type="number"
                    min={0}
                    value={tier.maxCount}
                    placeholder="open"
                    onChange={(event) => {
                      const next = [...tiers];
                      next[index] = { ...tier, maxCount: event.target.value };
                      setTiers(next);
                    }}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  Total monthly amount (ZAR)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tier.monthlyAmount}
                    onChange={(event) => {
                      const next = [...tiers];
                      next[index] = { ...tier, monthlyAmount: event.target.value };
                      setTiers(next);
                    }}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600 sm:col-span-2">
                  Label
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tier.label}
                      onChange={(event) => {
                        const next = [...tiers];
                        next[index] = { ...tier, label: event.target.value };
                        setTiers(next);
                      }}
                      placeholder={propertyBased ? "4–10 properties" : "4–10 spaces"}
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    {tiers.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
                        className="text-xs text-red-700"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </label>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTiers([...tiers, emptyTier()])}
            className="mt-2 text-xs font-medium text-[#192a3a]"
          >
            Add tier
          </button>
          {gapWarning ? (
            <p className="mt-2 text-xs text-amber-800">{gapWarning}</p>
          ) : null}
        </div>
      ) : null}

      {model === "subscription" && isProgressivePricingMode(pricingMode) ? (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Subscription pricing structure
            </h3>
            <p className="mt-1 text-xs text-gray-600">{PROGRESSIVE_PRICING_HELP}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              Base monthly fee
              <input
                type="number"
                min={0}
                step="0.01"
                value={monthlySubscriptionAmount}
                onChange={(event) => setMonthlySubscriptionAmount(event.target.value)}
                className="rounded-md border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              {propertyBased ? "Properties included" : "Spaces included"}
              <input
                type="number"
                min={0}
                step="1"
                value={includedUnits}
                onChange={(event) => setIncludedUnits(event.target.value)}
                className="rounded-md border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {propertyBased
                ? "Additional property pricing"
                : "Additional space pricing"}
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              Each band adds to the base monthly fee. Only the last band may be
              open-ended. Ranges cannot overlap.
            </p>
            <div className="mt-2 space-y-2">
              {tiers.map((tier, index) => {
                const openEnded = tier.maxCount.trim() === "";
                const unitNounPlural = progressiveUnitNoun(progressiveUnitType, 2);
                const band = {
                  minCount: Number(tier.minCount) || 0,
                  maxCount: openEnded ? null : Number(tier.maxCount),
                  incrementalAmount: Number(tier.incrementalAmount) || 0,
                  label: tier.label || null,
                };
                const milestones = progressiveBandMilestoneCounts(band).map(
                  (count) => ({
                    count,
                    result: calculateProgressiveSubscription({
                      baseAmount: Number(monthlySubscriptionAmount) || 0,
                      includedUnits: Number(includedUnits) || 0,
                      bands: commercialTiersToProgressiveBands(parsedDraftTiers),
                      unitCount: count,
                      unitType: progressiveUnitType,
                    }),
                  })
                );
                return (
                  <div
                    key={`band-${index}`}
                    className="rounded-md border border-gray-200 p-3"
                  >
                    <div className="flex flex-wrap items-end gap-x-2 gap-y-2 text-sm text-gray-800">
                      <span className="pb-1.5 capitalize">{unitNounPlural}</span>
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
                        From
                        <input
                          type="number"
                          min={1}
                          value={tier.minCount}
                          aria-label={`Band ${index + 1} from ${progressiveUnitNoun(progressiveUnitType, 1)}`}
                          onChange={(event) => {
                            const next = [...tiers];
                            next[index] = { ...tier, minCount: event.target.value };
                            setTiers(next);
                          }}
                          className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                      {openEnded ? (
                        <span className="pb-1.5 text-sm text-gray-800">and above</span>
                      ) : (
                        <>
                          <span className="pb-1.5 text-sm text-gray-800">through</span>
                          <label className="flex flex-col gap-1 text-xs text-gray-600">
                            To
                            <input
                              type="number"
                              min={1}
                              value={tier.maxCount}
                              aria-label={`Band ${index + 1} to ${progressiveUnitNoun(progressiveUnitType, 1)}`}
                              onChange={(event) => {
                                const next = [...tiers];
                                next[index] = { ...tier, maxCount: event.target.value };
                                setTiers(next);
                              }}
                              className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          </label>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...tiers];
                          next[index] = {
                            ...tier,
                            maxCount: openEnded ? String(Number(tier.minCount) || 1) : "",
                          };
                          setTiers(next);
                        }}
                        className="pb-1.5 text-xs font-medium text-[#192a3a]"
                      >
                        {openEnded ? "Set upper limit" : "No upper limit"}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-x-2 gap-y-2 text-sm text-gray-800">
                      <span className="pb-1.5">+ R</span>
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
                        {propertyBased
                          ? "Per additional property"
                          : "Per additional space"}
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={tier.incrementalAmount}
                          aria-label={`Band ${index + 1} additional fee`}
                          onChange={(event) => {
                            const next = [...tiers];
                            next[index] = {
                              ...tier,
                              incrementalAmount: event.target.value,
                            };
                            setTiers(next);
                          }}
                          className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                      <span className="pb-1.5">
                        per additional {progressiveUnitNoun(progressiveUnitType, 1)}
                      </span>
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
                        Label
                        <input
                          type="text"
                          value={tier.label}
                          onChange={(event) => {
                            const next = [...tiers];
                            next[index] = { ...tier, label: event.target.value };
                            setTiers(next);
                          }}
                          placeholder={
                            propertyBased ? "2–10 properties" : "2–10 spaces"
                          }
                          className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                      <div className="flex items-end gap-2 pb-1.5 text-xs">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => {
                            if (index === 0) return;
                            const next = [...tiers];
                            [next[index - 1], next[index]] = [
                              next[index],
                              next[index - 1],
                            ];
                            setTiers(next);
                          }}
                          className="text-[#192a3a] disabled:text-gray-300"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          disabled={index === tiers.length - 1}
                          onClick={() => {
                            if (index >= tiers.length - 1) return;
                            const next = [...tiers];
                            [next[index + 1], next[index]] = [
                              next[index],
                              next[index + 1],
                            ];
                            setTiers(next);
                          }}
                          className="text-[#192a3a] disabled:text-gray-300"
                        >
                          Down
                        </button>
                        {tiers.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setTiers(tiers.filter((_, i) => i !== index))
                            }
                            className="text-red-700"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <ul className="mt-2 text-xs text-gray-700">
                      {milestones.map(({ count, result }) => (
                        <li key={`band-${index}-at-${count}`}>
                          At {count} {progressiveUnitNoun(progressiveUnitType, count)}
                          :{" "}
                          {result.covered
                            ? `${money(result.monthlyAmount)}/month total`
                            : "Unresolved — not R0"}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setTiers([...tiers, emptyBand()])}
              className="mt-2 text-xs font-medium text-[#192a3a]"
            >
              Add pricing band
            </button>
            {propertyBased &&
            tiers.some((tier) => tier.maxCount.trim() !== "") &&
            tiers.every((tier) => tier.maxCount.trim() !== "") ? (
              <button
                type="button"
                onClick={() => {
                  const lastMax = Math.max(
                    ...tiers.map((tier) => Number(tier.maxCount) || 0)
                  );
                  setTiers([
                    ...tiers,
                    {
                      ...emptyBand(),
                      minCount: String(lastMax + 1),
                      maxCount: "",
                      label: displayProgressiveBandLabel(
                        "property",
                        null,
                        lastMax + 1,
                        null
                      ),
                    },
                  ]);
                }}
                className="ml-3 mt-2 text-xs font-medium text-[#192a3a]"
              >
                Add open-ended properties band
              </button>
            ) : null}
            {gapWarning ? (
              <div className="mt-3 rounded-md border border-amber-400 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-950">{gapWarning}</p>
                <p className="mt-1 text-xs text-amber-900">
                  Counts in a gap will not resolve. Complete the schedule before
                  saving, or explicitly allow an incomplete save.
                </p>
                <label className="mt-2 flex items-start gap-2 text-xs text-amber-950">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allowIncompleteSchedule}
                    onChange={(event) =>
                      setAllowIncompleteSchedule(event.target.checked)
                    }
                  />
                  Save this incomplete schedule anyway
                </label>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Monthly price preview
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              Uses the values above, before you save.
            </p>
            <table className="mt-2 w-full text-left text-xs text-gray-800">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-1 pr-3">
                    {propertyBased ? "Property count" : "Space count"}
                  </th>
                  <th className="py-1 pr-3">Calculation</th>
                  <th className="py-1">Monthly total</th>
                </tr>
              </thead>
              <tbody>
                {progressivePreview.map(({ count, result }) => (
                  <tr key={`preview-${count}`} className="border-t border-slate-200">
                    <td className="py-1 pr-3">
                      {count} {progressiveUnitNoun(progressiveUnitType, count)}
                    </td>
                    <td className="py-1 pr-3">{result.calculationText}</td>
                    <td className="py-1">
                      {result.covered
                        ? money(result.monthlyAmount)
                        : "Unresolved — not R0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {model === "subscription" ? (
        <div className="mt-4 rounded-md border border-slate-200 p-3 text-sm text-gray-700">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Before you save
          </h3>
          {impactEntityName ? (
            <p className="mt-2 text-xs text-gray-500">{impactEntityName}</p>
          ) : null}
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
            <div>
              <dt className="font-medium text-gray-500">Current arrangement</dt>
              <dd>
                {subscriptionPricingMethodLabel(resolved?.subscriptionPricingMode)}
                {resolved?.inherited ? " · inherited" : ""}
                {subscription?.inventoryCount != null
                  ? ` · ${subscription.inventoryCount} ${
                      subscription.inventoryBasis === "property"
                        ? "properties"
                        : "spaces"
                    }`
                  : ""}
                {" · "}
                {subscriptionUnresolved
                  ? "Unresolved — not a R0 subscription"
                  : money(
                      subscription?.monthlyAmount ??
                        resolved?.monthlySubscriptionAmount ??
                        0
                    )}
                /month
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">Proposed arrangement</dt>
              <dd>
                {subscriptionPricingMethodLabel(pricingMode)}
                {inventory
                  ? ` · ${
                      propertyBased
                        ? inventory.propertyCount
                        : inventory.spaceCount
                    } billable ${
                      propertyBased ? "properties" : "spaces"
                    }`
                  : ""}
                {" · "}
                {proposedResolution?.unresolvedReason
                  ? "Unresolved — not a R0 subscription"
                  : money(proposedResolution?.monthlyAmount ?? 0)}
                /month
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">
                {resolved?.effectiveFrom
                  ? "New version effective from"
                  : "Effective from"}
              </dt>
              <dd>{formatCommercialShortDate(`${effectiveFrom}T00:00:00+02:00`)}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">Current source</dt>
              <dd>{resolved?.inheritedFrom || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">
                {propertyBased
                  ? "Current billable properties"
                  : "Current billable spaces"}
              </dt>
              <dd>
                {inventory
                  ? `${
                      propertyBased
                        ? inventory.propertyCount
                        : inventory.spaceCount
                    } ${propertyBased ? "properties" : "spaces"}`
                  : "Select an organisation, property, or space to see inventory"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">Transaction fee</dt>
              <dd>{Number(transactionFeePercent || 0).toFixed(2)}%</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-gray-500">
            Saving creates a new commercial-terms version. Historical months keep
            the amounts calculated under the version that applied then.
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-gray-500">
        {model === "commission"
          ? `${Number(commissionPercent || 0).toFixed(2)}% platform + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
          : model === "subscription"
            ? pricingMode === "fixed"
              ? `${money(monthlySubscriptionAmount)}/month + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
              : isProgressivePricingMode(pricingMode)
                ? `Progressive per-${progressiveUnitNoun(progressiveUnitType, 1)} + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
                : `Tiered ${propertyBased ? "by properties" : "by spaces"} + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
            : `0% platform + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`}
        . Transaction fee applies to each online payment. Monthly subscription is not
        billed automatically in this pass.
      </p>

      {message ? (
        <p
          className={`mt-3 rounded-md px-3 py-2 text-sm ${
            messageTone === "error"
              ? "bg-red-50 text-red-800"
              : "bg-emerald-50 text-emerald-800"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={
          saving ||
          (scopeType !== "platform" && !scopeId) ||
          Boolean(effectiveDateConflict) ||
          (model === "subscription" &&
            isProgressivePricingMode(pricingMode) &&
            Boolean(gapWarning) &&
            !allowIncompleteSchedule)
        }
        className="mt-4 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Saving…" : saveLabel}
      </button>

      {history.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Version history
          </h3>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1 pr-3">From</th>
                <th className="py-1 pr-3">Model</th>
                <th className="py-1 pr-3">Pricing</th>
                <th className="py-1 pr-3">Commission</th>
                <th className="py-1 pr-3">Transaction</th>
                <th className="py-1 pr-3">Monthly</th>
                <th className="py-1">Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {new Date(row.effective_from).toLocaleDateString("en-ZA")}
                    {row.superseded_at
                      ? ` – ${new Date(row.superseded_at).toLocaleDateString("en-ZA")}`
                      : " – open"}
                  </td>
                  <td className="py-1 pr-3 capitalize">{row.commercial_model}</td>
                  <td className="py-1 pr-3">
                    {row.subscription_pricing_mode || "—"}
                  </td>
                  <td className="py-1 pr-3">{Number(row.commission_percent).toFixed(2)}%</td>
                  <td className="py-1 pr-3">
                    {Number(row.transaction_fee_percent).toFixed(2)}%
                  </td>
                  <td className="py-1 pr-3">{money(row.monthly_subscription_amount)}</td>
                  <td className="py-1 text-gray-500">{row.admin_note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
