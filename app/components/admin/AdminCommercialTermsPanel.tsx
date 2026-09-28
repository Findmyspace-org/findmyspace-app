"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  DEFAULT_COMMISSION_PERCENT,
  DEFAULT_TRANSACTION_FEE_PERCENT,
} from "@/lib/commercial-calculator";
import type { CommercialModel, CommercialScopeType } from "@/lib/commercial-terms";

type ResolvedDto = {
  model: CommercialModel;
  commissionPercent: number;
  transactionFeePercent: number;
  monthlySubscriptionAmount: number;
  effectiveFrom: string | null;
  adminNote: string | null;
  source: string;
  accountingMode: string;
  inheritedFrom: string;
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
  effective_from: string;
  superseded_at: string | null;
  admin_note: string | null;
};

function todayIsoDate(): string {
  const now = new Date();
  const tz = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

function money(value: number | string | null | undefined): string {
  return `R ${Number(value || 0).toFixed(2)}`;
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

  const [model, setModel] = useState<CommercialModel>("commission");
  const [commissionPercent, setCommissionPercent] = useState(
    String(DEFAULT_COMMISSION_PERCENT)
  );
  const [transactionFeePercent, setTransactionFeePercent] = useState(
    String(DEFAULT_TRANSACTION_FEE_PERCENT)
  );
  const [monthlySubscriptionAmount, setMonthlySubscriptionAmount] = useState("0");
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
      };
      setResolved(json.resolved ?? null);
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

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Global Admin only. Hosts cannot change these terms. New bookings use the
        arrangement in force on the booking date; historical bookings are never
        recalculated.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading commercial terms…</p>
      ) : resolved ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p>
            <span className="font-medium text-[#192a3a]">Current effective:</span>{" "}
            {resolved.summary}
          </p>
          <p className="mt-1 text-gray-600">
            Inherited from {resolved.inheritedFrom}
            {resolved.effectiveFrom
              ? ` · effective ${new Date(resolved.effectiveFrom).toLocaleDateString("en-ZA")}`
              : ""}
          </p>
          {resolved.adminNote ? (
            <p className="mt-1 text-xs text-gray-500">Internal note: {resolved.adminNote}</p>
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

      <p className="mt-3 text-xs text-gray-500">
        {model === "commission"
          ? `${Number(commissionPercent || 0).toFixed(2)}% platform + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
          : model === "subscription"
            ? `${money(monthlySubscriptionAmount)}/month + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`
            : `0% platform + ${Number(transactionFeePercent || 0).toFixed(2)}% transaction`}
        . Transaction fee applies to each online payment. Subscription is not billed
        automatically in this pass.
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
        {saving ? "Saving…" : "Save terms from effective date"}
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
