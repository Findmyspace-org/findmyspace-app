"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { getBrowserAccessToken } from "@/lib/supabase-browser-session";
import {
  formatBillingMonthLabel,
  parseBillingMonthInput,
  type SubscriptionPeriodPreview,
  type SubscriptionPeriodRow,
} from "@/lib/subscription-billing";
import { commercialCalendarDate } from "@/lib/commercial-terms";
import { subscriptionPricingMethodLabel } from "@/lib/commercial-admin-display";

function currentBillingMonth(): string {
  return `${commercialCalendarDate(new Date()).slice(0, 7)}-01`;
}

function money(value: number): string {
  return `R ${Number(value || 0).toFixed(2)}`;
}

export default function AdminSubscriptionsPage() {
  const [month, setMonth] = useState(currentBillingMonth);
  const [paymentFilter, setPaymentFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [organisationFilter, setOrganisationFilter] = useState("");
  const [periods, setPeriods] = useState<SubscriptionPeriodRow[]>([]);
  const [previews, setPreviews] = useState<SubscriptionPeriodPreview[]>([]);
  const [revenue, setRevenue] = useState({ invoiced: 0, paid: 0, outstanding: 0 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payPeriodId, setPayPeriodId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = (await adminApiFetch(
        `/api/admin/subscription-billing?month=${encodeURIComponent(month)}${
          paymentFilter === "all" ? "" : `&paymentStatus=${paymentFilter}`
        }${
          organisationFilter
            ? `&organisationId=${encodeURIComponent(organisationFilter)}`
            : ""
        }`
      )) as {
        periods?: SubscriptionPeriodRow[];
        revenue?: { invoiced: number; paid: number; outstanding: number };
      };
      setPeriods(json.periods || []);
      if (json.revenue) setRevenue(json.revenue);
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Could not load subscription billing.");
    } finally {
      setLoading(false);
    }
  }, [month, organisationFilter, paymentFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function previewMonth() {
    setLoading(true);
    setMessage("");
    try {
      const json = (await adminApiFetch("/api/admin/subscription-billing", {
        method: "POST",
        body: JSON.stringify({ action: "preview", billing_month: month }),
      })) as { items?: SubscriptionPeriodPreview[] };
      setPreviews(json.items || []);
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Could not preview billing month.");
    } finally {
      setLoading(false);
    }
  }

  async function createMonth() {
    setLoading(true);
    setMessage("");
    try {
      const json = (await adminApiFetch("/api/admin/subscription-billing", {
        method: "POST",
        body: JSON.stringify({ action: "create_month", billing_month: month }),
      })) as { created?: unknown[]; existing?: unknown[]; skipped?: unknown[] };
      setMessageTone("success");
      setMessage(
        `Created ${json.created?.length || 0} period(s). ${json.existing?.length || 0} already existed. ${json.skipped?.length || 0} skipped.`
      );
      await previewMonth();
      await load();
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Could not create billing periods.");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: string, extra: Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    try {
      const json = (await adminApiFetch("/api/admin/subscription-billing", {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      })) as { emailWarning?: string | null };
      setMessageTone("success");
      setMessage(json.emailWarning || "Saved.");
      setPayPeriodId(null);
      await load();
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Could not update subscription billing.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf(periodId: string) {
    const token = await getBrowserAccessToken();
    if (!token) {
      setMessageTone("error");
      setMessage("Not signed in.");
      return;
    }
    const res = await fetch(`/api/admin/subscription-invoices/${periodId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setMessageTone("error");
      setMessage("Could not download invoice PDF.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "FindMySpace-subscription.pdf";
    link.click();
    URL.revokeObjectURL(url);
  }

  const organisations = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of periods) {
      if (row.billed_organisation_id) {
        map.set(row.billed_organisation_id, row.billed_party_name || row.billed_organisation_id);
      }
    }
    return [...map.entries()];
  }, [periods]);

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-6 py-10 text-[#192a3a]">
      <AdminNav current="subscriptions" />
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Subscription billing</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Monthly organisation subscriptions owed to FindMySpace. Terms are resolved as of
            the first day of the billing month in Africa/Johannesburg. No prorating, no
            PayFast debit, and no mix with booking payouts.
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Invoiced</p>
            <p className="mt-1 text-xl font-semibold">{money(revenue.invoiced)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Paid</p>
            <p className="mt-1 text-xl font-semibold">{money(revenue.paid)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Outstanding</p>
            <p className="mt-1 text-xl font-semibold">{money(revenue.outstanding)}</p>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Generate periods
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600">
              Billing month
              <input
                type="month"
                value={month.slice(0, 7)}
                onChange={(event) =>
                  setMonth(parseBillingMonthInput(event.target.value))
                }
                className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void previewMonth()}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => void createMonth()}
              className="rounded-md bg-[#192a3a] px-3 py-2 text-sm text-white"
            >
              Create billing periods
            </button>
          </div>
          {previews.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="py-1 pr-3">Organisation</th>
                    <th className="py-1 pr-3">Model</th>
                    <th className="py-1 pr-3">Count</th>
                    <th className="py-1 pr-3">Amount</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previews.map((row) => (
                    <tr
                      key={`${row.billedScopeType}-${row.billedScopeId}`}
                      className="border-t border-gray-100"
                    >
                      <td className="py-2 pr-3">{row.billedPartyName}</td>
                      <td className="py-2 pr-3">
                        {row.commercialModel}
                        {row.pricingMode
                          ? ` · ${subscriptionPricingMethodLabel(row.pricingMode)}`
                          : ""}
                      </td>
                      <td className="py-2 pr-3">{row.inventoryCount}</td>
                      <td className="py-2 pr-3">{money(row.monthlyAmount)}</td>
                      <td className="py-2">
                        {row.eligible ? (
                          <span className="text-emerald-800">Ready</span>
                        ) : (
                          <span className="text-amber-800">{row.warning}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-gray-600">
              Payment
              <select
                value={paymentFilter}
                onChange={(event) =>
                  setPaymentFilter(event.target.value as typeof paymentFilter)
                }
                className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="all">All</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Organisation
              <select
                value={organisationFilter}
                onChange={(event) => setOrganisationFilter(event.target.value)}
                className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="">All</option>
                {organisations.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-1 pr-3">Month</th>
                  <th className="py-1 pr-3">Organisation</th>
                  <th className="py-1 pr-3">Pricing</th>
                  <th className="py-1 pr-3">Count</th>
                  <th className="py-1 pr-3">Amount</th>
                  <th className="py-1 pr-3">Invoice</th>
                  <th className="py-1 pr-3">Payment</th>
                  <th className="py-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-3">{formatBillingMonthLabel(row.billing_month)}</td>
                    <td className="py-2 pr-3">{row.billed_party_name}</td>
                    <td className="py-2 pr-3">
                      {subscriptionPricingMethodLabel(row.pricing_mode)}
                    </td>
                    <td className="py-2 pr-3">{row.inventory_count}</td>
                    <td className="py-2 pr-3">{money(row.monthly_amount)}</td>
                    <td className="py-2 pr-3">
                      {row.invoice_number || row.status}
                      {row.due_date ? <div>Due {row.due_date}</div> : null}
                    </td>
                    <td className="py-2 pr-3">{row.payment_status}</td>
                    <td className="py-2 space-y-1">
                      {row.status !== "invoiced" && row.status !== "void" ? (
                        <div className="flex flex-wrap gap-1">
                          <input
                            type="date"
                            value={dueDate}
                            onChange={(event) => setDueDate(event.target.value)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void runAction("issue", {
                                period_id: row.id,
                                due_date: dueDate || null,
                              })
                            }
                            className="text-[#192a3a] underline"
                          >
                            Issue invoice
                          </button>
                        </div>
                      ) : null}
                      {row.status === "invoiced" ? (
                        <button
                          type="button"
                          onClick={() => void downloadPdf(row.id)}
                          className="block text-[#192a3a] underline"
                        >
                          Download PDF
                        </button>
                      ) : null}
                      {row.status === "invoiced" && row.payment_status !== "paid" ? (
                        payPeriodId === row.id ? (
                          <div className="space-y-1">
                            <input
                              placeholder="Payment reference"
                              value={payRef}
                              onChange={(event) => setPayRef(event.target.value)}
                              className="w-full rounded border border-gray-300 px-1 py-0.5"
                            />
                            <input
                              placeholder="Note"
                              value={payNote}
                              onChange={(event) => setPayNote(event.target.value)}
                              className="w-full rounded border border-gray-300 px-1 py-0.5"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void runAction("record_payment", {
                                  period_id: row.id,
                                  payment_reference: payRef,
                                  payment_note: payNote,
                                })
                              }
                              className="text-emerald-800 underline"
                            >
                              Save payment
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPayPeriodId(row.id)}
                            className="block text-emerald-800 underline"
                          >
                            Record payment
                          </button>
                        )
                      ) : null}
                      {row.status !== "void" && row.payment_status !== "paid" ? (
                        <button
                          type="button"
                          onClick={() => void runAction("void", { period_id: row.id })}
                          className="block text-red-700 underline"
                        >
                          Void
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {periods.length === 0 && !loading ? (
              <p className="mt-3 text-sm text-gray-500">No subscription periods for this filter.</p>
            ) : null}
          </div>
        </section>

        {message ? (
          <p
            className={`rounded-md px-3 py-2 text-sm ${
              messageTone === "error"
                ? "bg-red-50 text-red-800"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
