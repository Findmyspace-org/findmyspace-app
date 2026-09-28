"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { getBrowserAccessToken } from "@/lib/supabase-browser-session";
import {
  formatBillingMonthLabel,
  parseBillingMonthInput,
  subscriptionInvoiceReadiness,
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
  const [eftConfigured, setEftConfigured] = useState(false);
  const [eftMissing, setEftMissing] = useState<string[]>([]);
  const [allowIncompleteEft, setAllowIncompleteEft] = useState(false);
  const [billingOrgId, setBillingOrgId] = useState("");
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");

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
        billingSetup?: { eft?: { configured?: boolean; missing?: string[] } };
      };
      setPeriods(json.periods || []);
      if (json.revenue) setRevenue(json.revenue);
      const eft = json.billingSetup?.eft;
      setEftConfigured(Boolean(eft?.configured));
      setEftMissing(eft?.missing || []);
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
      })) as {
        items?: Array<
          SubscriptionPeriodPreview & {
            readiness?: ReturnType<typeof subscriptionInvoiceReadiness>;
          }
        >;
        billingSetup?: { eft?: { configured?: boolean; missing?: string[] } };
      };
      setPreviews(json.items || []);
      if (json.billingSetup?.eft) {
        setEftConfigured(Boolean(json.billingSetup.eft.configured));
        setEftMissing(json.billingSetup.eft.missing || []);
      }
      const first = (json.items || []).find((row) => row.eligible || row.billedOrganisationId);
      if (first?.billedOrganisationId) {
        setBillingOrgId(first.billedOrganisationId);
        setBillingEmail(first.billingEmail || "");
      }
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
    for (const row of previews) {
      if (row.billedOrganisationId) {
        map.set(row.billedOrganisationId, row.billedPartyName || row.billedOrganisationId);
      }
    }
    return [...map.entries()];
  }, [periods, previews]);

  async function saveBillingContact() {
    if (!billingOrgId) {
      setMessageTone("error");
      setMessage("Choose an organisation first.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await adminApiFetch("/api/admin/subscription-billing", {
        method: "POST",
        body: JSON.stringify({
          action: "save_billing_contact",
          organisation_id: billingOrgId,
          billing_contact_name: billingName,
          billing_email: billingEmail,
          billing_phone: billingPhone,
        }),
      });
      setMessageTone("success");
      setMessage("Billing contact saved. Email is not sent until an invoice is issued.");
      await previewMonth();
      await load();
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Could not save billing contact.");
    } finally {
      setLoading(false);
    }
  }

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

        {!eftConfigured ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">FindMySpace EFT details are not configured.</p>
            <p className="mt-1">
              Set production env vars {`FMS_BILLING_BANK_NAME`}, {`FMS_BILLING_ACCOUNT_NAME`},{" "}
              {`FMS_BILLING_ACCOUNT_NUMBER`}, and {`FMS_BILLING_BRANCH_CODE`}
              {eftMissing.length ? ` (missing: ${eftMissing.join(", ")})` : ""}. Optional:{" "}
              {`FMS_BILLING_ACCOUNT_TYPE`}. Payable invoices stay blocked until these are set.
            </p>
          </section>
        ) : null}

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Billing contact
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Saved on the organisation commercial profile. CRM contacts are not used as
            invoice addresses unless you copy one here.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              Organisation
              <select
                value={billingOrgId}
                onChange={(event) => setBillingOrgId(event.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="">Select organisation</option>
                {organisations.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Billing contact name
              <input
                value={billingName}
                onChange={(event) => setBillingName(event.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Billing email
              <input
                type="email"
                value={billingEmail}
                onChange={(event) => setBillingEmail(event.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Billing phone (optional)
              <input
                value={billingPhone}
                onChange={(event) => setBillingPhone(event.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void saveBillingContact()}
            className="mt-3 rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            Save billing contact
          </button>
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
                          <div>
                            <span className="text-emerald-800">Ready</span>
                            {row.snapshot?.calculationText ? (
                              <div className="text-xs text-gray-500">
                                {row.snapshot.calculationText}
                              </div>
                            ) : null}
                            {row.coverageWarning ? (
                              <div className="text-xs text-amber-800">{row.coverageWarning}</div>
                            ) : null}
                            {!row.billingEmail ? (
                              <div className="text-xs text-gray-500">
                                Invoice can be issued. Email cannot be sent.
                              </div>
                            ) : null}
                          </div>
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
                        (() => {
                          const readiness = subscriptionInvoiceReadiness({
                            termsResolved: Boolean(row.commercial_terms_id),
                            amountResolved: Number(row.monthly_amount) > 0,
                            billedPartyResolved: Boolean(row.billed_organisation_id),
                            monthlyAmount: row.monthly_amount,
                            hasBillingEmail: Boolean(row.billing_email),
                            eftConfigured,
                          });
                          const canClick =
                            readiness.canIssue ||
                            (allowIncompleteEft && readiness.canIssueWithoutEft);
                          return (
                            <div className="space-y-1">
                              <ul className="space-y-0.5 text-[11px] text-gray-600">
                                {readiness.items.map((item) => (
                                  <li key={item.key}>
                                    {item.ok ? "✓" : "○"} {item.label}
                                    {!item.ok ? ` — ${item.detail}` : ""}
                                    {item.key === "email" && !item.ok
                                      ? " Invoice can be issued. Email cannot be sent."
                                      : ""}
                                  </li>
                                ))}
                              </ul>
                              <label className="flex items-center gap-1 text-[11px] text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={allowIncompleteEft}
                                  onChange={(event) =>
                                    setAllowIncompleteEft(event.target.checked)
                                  }
                                />
                                Issue without complete EFT instructions
                              </label>
                              <div className="flex flex-wrap gap-1">
                                <input
                                  type="date"
                                  value={dueDate}
                                  onChange={(event) => setDueDate(event.target.value)}
                                  className="rounded border border-gray-300 px-1 py-0.5"
                                />
                                <button
                                  type="button"
                                  disabled={!canClick || loading}
                                  onClick={() =>
                                    void runAction("issue", {
                                      period_id: row.id,
                                      due_date: dueDate || null,
                                      allow_incomplete_payment_instructions: allowIncompleteEft,
                                    })
                                  }
                                  className="text-[#192a3a] underline disabled:cursor-not-allowed disabled:text-gray-400"
                                >
                                  Issue invoice
                                </button>
                              </div>
                            </div>
                          );
                        })()
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
