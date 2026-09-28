"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { useHostingWorkspace } from "@/lib/use-hosting-workspace";
import { ownerApiFetch } from "@/lib/owner-api-client";
import { getBrowserAccessToken } from "@/lib/supabase-browser-session";
import { formatBillingMonthLabel } from "@/lib/subscription-billing";

type InvoiceRow = {
  id: string;
  billingMonth: string;
  invoiceNumber: string | null;
  dueDate: string | null;
  monthlyAmount: number;
  status: string;
  paymentStatus: string;
};

function SubscriptionBillingContent() {
  const hosting = useHostingWorkspace();
  const organisationId = hosting.organisationId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [arrangement, setArrangement] = useState("");
  const [estimate, setEstimate] = useState<number>(0);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    if (hosting.loading) return;
    if (!hosting.summary.showOrganisationCommercial) {
      window.location.replace(hosting.ownerHref);
    }
  }, [hosting.loading, hosting.ownerHref, hosting.summary.showOrganisationCommercial]);

  const load = useCallback(async () => {
    if (!organisationId || !hosting.summary.showOrganisationCommercial) return;
    setLoading(true);
    setError("");
    try {
      const json = (await ownerApiFetch(
        `/api/organisations/${organisationId}/subscription-billing`
      )) as {
        arrangement?: { summary?: string };
        estimate?: { monthlyAmount?: number };
        invoices?: InvoiceRow[];
      };
      setArrangement(json.arrangement?.summary || "");
      setEstimate(json.estimate?.monthlyAmount || 0);
      setInvoices(json.invoices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load subscription billing.");
    } finally {
      setLoading(false);
    }
  }, [hosting.summary.showOrganisationCommercial, organisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadPdf(invoiceId: string) {
    if (!organisationId) return;
    const token = await getBrowserAccessToken();
    if (!token) return;
    const res = await fetch(
      `/api/organisations/${organisationId}/subscription-invoices/${invoiceId}/pdf`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      setError("Could not download invoice PDF.");
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

  return (
    <RequireAuth>
      <DashboardShell
        workspaceLabel="Hosting"
        pageTitle="Subscription billing"
        navItems={hosting.navItems}
        activeHref="/dashboard/subscription"
      >
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          <div>
            <h1 className="text-2xl font-semibold">Subscription billing</h1>
            <p className="mt-2 text-sm text-gray-600">
              Read-only view of your organisation subscription invoices. Contact
              FindMySpace to record payment.
            </p>
          </div>
          {loading ? <p className="text-sm text-gray-500">Loading…</p> : null}
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Current arrangement
            </h2>
            <p className="mt-2 text-sm">{arrangement || "No subscription arrangement."}</p>
            <p className="mt-1 text-sm text-gray-600">
              Current monthly estimate: R {Number(estimate).toFixed(2)}
            </p>
          </section>
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Invoices
            </h2>
            {invoices.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No subscription invoices yet.</p>
            ) : (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="py-1 pr-3">Month</th>
                    <th className="py-1 pr-3">Invoice</th>
                    <th className="py-1 pr-3">Due</th>
                    <th className="py-1 pr-3">Amount</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="py-2 pr-3">{formatBillingMonthLabel(row.billingMonth)}</td>
                      <td className="py-2 pr-3">{row.invoiceNumber || "—"}</td>
                      <td className="py-2 pr-3">{row.dueDate || "—"}</td>
                      <td className="py-2 pr-3">R {Number(row.monthlyAmount).toFixed(2)}</td>
                      <td className="py-2 pr-3">
                        {row.status === "void" ? "Void" : row.paymentStatus}
                      </td>
                      <td className="py-2">
                        {row.invoiceNumber ? (
                          <button
                            type="button"
                            onClick={() => void downloadPdf(row.id)}
                            className="text-[#192a3a] underline"
                          >
                            Download
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </DashboardShell>
    </RequireAuth>
  );
}

export default function SubscriptionBillingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
      <SubscriptionBillingContent />
    </Suspense>
  );
}
