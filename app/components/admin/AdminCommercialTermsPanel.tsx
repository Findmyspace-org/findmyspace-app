"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  DEFAULT_COMMISSION_PERCENT,
  DEFAULT_TRANSACTION_FEE_PERCENT,
} from "@/lib/commercial-calculator";
import type { CommercialModel, CommercialScopeType } from "@/lib/commercial-terms";
import type {
  CommercialTermTier,
  SubscriptionPricingMode,
  SubscriptionResolution,
} from "@/lib/commercial-subscription";
import {
  BILLABLE_INVENTORY_HELP,
  PLATFORM_DEFAULT_UNCONFIGURED_BODY,
  PLATFORM_DEFAULT_UNCONFIGURED_TITLE,
  subscriptionTierGapWarning,
  type CommercialPrecedenceStep,
} from "@/lib/commercial-admin-display";

type ResolvedDto = {
  model: CommercialModel;
  commissionPercent: number;
  transactionFeePercent: number;
  monthlySubscriptionAmount: number;
  subscriptionPricingMode: SubscriptionPricingMode | null;
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
  label: string;
};

function todayIsoDate(): string {
  const now = new Date();
  const tz = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

function money(value: number | string | null | undefined): string {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function emptyTier(): TierDraft {
  return { minCount: "1", maxCount: "", monthlyAmount: "0", label: "" };
}

function tiersToDrafts(tiers: CommercialTermTier[] | undefined): TierDraft[] {
  if (!tiers || tiers.length === 0) return [emptyTier()];
  return tiers.map((tier) => ({
    minCount: String(tier.minCount),
    maxCount: tier.maxCount == null ? "" : String(tier.maxCount),
    monthlyAmount: String(tier.monthlyAmount),
    label: tier.label || "",
  }));
}

function draftsToPayload(drafts: TierDraft[]) {
  return drafts.map((tier, index) => ({
    min_count: Number(tier.minCount),
    max_count: tier.maxCount.trim() === "" ? null : Number(tier.maxCount),
    monthly_amount: Number(tier.monthlyAmount),
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
  const [tiers, setTiers] = useState<TierDraft[]>([emptyTier()]);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIsoDate);
  const [adminNote, setAdminNote] = useState("");

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
      };
      setResolved(json.resolved ?? null);
      setPrecedence(json.precedence ?? []);
      const rows = json.terms ?? [];
      setHistory(
        rows.filter((row) =>
          scopeType === "platform"
            ? row.scope_type === "platform"
            : row.scope_type === scopeType && row.scope_id === (scopeId ?? null)
        )
      );
      if (json.resolved?.accountingMode === "split") {
        setModel(json.resolved.model);
        setCommissionPercent(String(json.resolved.commissionPercent));
        setTransactionFeePercent(String(json.resolved.transactionFeePercent));
        setMonthlySubscriptionAmount(
          String(json.resolved.monthlySubscriptionAmount)
        );
        setPricingMode(json.resolved.subscriptionPricingMode || "fixed");
        setTiers(tiersToDrafts(json.resolved.tiers));
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

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
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
          tiers:
            model === "subscription" && pricingMode !== "fixed"
              ? draftsToPayload(tiers)
              : [],
          effective_from: effectiveFrom,
          admin_note: adminNote,
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

  const subscription = resolved?.subscription ?? null;
  const saveLabel =
    scopeType === "platform"
      ? "Save platform default from effective date"
      : resolved?.inherited
        ? `Create ${scopeType} override from effective date`
        : `Save ${scopeType} override from effective date`;
  const gapWarning = useMemo(() => {
    if (model !== "subscription" || pricingMode === "fixed") return null;
    return subscriptionTierGapWarning(
      tiers.map((tier, index) => ({
        id: null,
        minCount: Number(tier.minCount),
        maxCount: tier.maxCount.trim() === "" ? null : Number(tier.maxCount),
        monthlyAmount: Number(tier.monthlyAmount),
        label: tier.label || null,
        sortOrder: index,
      }))
    );
  }, [model, pricingMode, tiers]);
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
                      {resolved.subscriptionPricingMode === "by_space_count"
                        ? "Number of spaces"
                        : resolved.subscriptionPricingMode === "by_property_count"
                          ? "Number of properties"
                          : "Fixed monthly amount"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Resolved monthly fee</dt>
                    <dd>
                      {money(
                        subscription?.monthlyAmount ?? resolved.monthlySubscriptionAmount
                      )}
                    </dd>
                  </div>
                  {subscription?.inventoryCount != null ? (
                    <div>
                      <dt className="font-medium text-gray-500">Billable inventory</dt>
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
                    <p className="sm:col-span-2 text-gray-500" title={BILLABLE_INVENTORY_HELP}>
                      {BILLABLE_INVENTORY_HELP}
                    </p>
                  ) : null}
                  {subscription?.unresolvedReason === "platform_default_needs_scope" ? (
                    <p className="sm:col-span-2 text-gray-500">
                      Select an organisation, property, or space to see the inventory
                      count and matched tier for this default.
                    </p>
                  ) : null}
                  {subscription?.unresolvedReason === "no_matching_tier" ? (
                    <p className="sm:col-span-2 text-amber-800">
                      No matching subscription tier
                    </p>
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
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Effective from
          <input
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          />
        </label>
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
              onChange={(event) =>
                setPricingMode(event.target.value as SubscriptionPricingMode)
              }
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="fixed">Fixed monthly amount</option>
              <option value="by_property_count">By property count</option>
              <option value="by_space_count">By space count</option>
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

      {model === "subscription" && pricingMode !== "fixed" ? (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Subscription tiers
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Leave maximum blank for an open-ended highest tier (for example 31+).
            Ranges cannot overlap. Gaps are allowed but those counts will not match
            a tier.
          </p>
          <div className="mt-2 space-y-2">
            {tiers.map((tier, index) => (
              <div
                key={`tier-${index}`}
                className="grid gap-2 sm:grid-cols-5 rounded-md border border-gray-200 p-2"
              >
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  Min count
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
                  Max count
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
                  Monthly (ZAR)
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
                      placeholder="4–10 spaces"
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

      <p className="mt-3 text-xs text-gray-500">
        {model === "commission"
          ? `${Number(commissionPercent || 0).toFixed(2)}% platform + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
          : model === "subscription"
            ? pricingMode === "fixed"
              ? `${money(monthlySubscriptionAmount)}/month + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
              : `Tiered ${pricingMode === "by_space_count" ? "by spaces" : "by properties"} + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
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
        disabled={saving || (scopeType !== "platform" && !scopeId)}
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
