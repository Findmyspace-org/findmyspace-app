"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  ClipboardList,
  Download,
  History,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FinanceLineItem } from "@/lib/finance-booking-lines";
import type { MonthlyFinanceRollup } from "@/lib/admin-finance-filters";

type AdminFinanceSummary = {
  grossBookingValue: number;
  totalPlatformFees: number;
  totalOwnerEarnings: number;
  depositsCollected: number;
  committedFutureIncomeGross: number;
  expiredUnpaid: number;
  paymentFailures: number;
  paymentFailureAmount: number;
};

type SpaceOption = { id: string; title: string };

export default function AdminFinancePage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [summary, setSummary] = useState<AdminFinanceSummary | null>(null);
  const [transactions, setTransactions] = useState<FinanceLineItem[]>([]);
  const [monthly, setMonthly] = useState<MonthlyFinanceRollup[]>([]);
  const [chargeTypes, setChargeTypes] = useState<string[]>([]);
  const [spaceOptions, setSpaceOptions] = useState<SpaceOption[]>([]);

  const [spaceId, setSpaceId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [chargeTypeFilter, setChargeTypeFilter] = useState("all");

  const checkRole = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRole("guest");
      return false;
    }
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("role")
      .eq("id", user.id)
      .single();
    if ((profile as { role?: string } | null)?.role !== "admin") {
      setRole("user");
      return false;
    }
    setRole("admin");
    return true;
  }, []);

  const loadFinance = useCallback(async () => {
    setMessage("");
    setMessageIsError(false);
    setLoading(true);
    try {
      const ok = await checkRole();
      if (!ok) {
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Sign in to view finance data.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (chargeTypeFilter !== "all") params.set("chargeType", chargeTypeFilter);
      if (spaceId !== "all") params.set("spaceId", spaceId);

      const res = await fetch(`/api/admin/finance?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Could not load finance data.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }

      setSummary(json.summary);
      setTransactions(json.transactions || []);
      setMonthly(json.monthly || []);
      setChargeTypes(json.filters?.chargeTypes || []);
      setSpaceOptions(json.filters?.spaceOptions || []);
    } catch {
      setMessage("Something went wrong while loading. Try again.");
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  }, [
    checkRole,
    dateFrom,
    dateTo,
    statusFilter,
    chargeTypeFilter,
    spaceId,
  ]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  async function handleExportCsv() {
    setMessage("");
    setMessageIsError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Sign in to export.");
        setMessageIsError(true);
        return;
      }

      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (chargeTypeFilter !== "all") params.set("chargeType", chargeTypeFilter);
      if (spaceId !== "all") params.set("spaceId", spaceId);

      const res = await fetch(`/api/admin/finance/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err?.error || "Export failed.");
        setMessageIsError(true);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `findmyspace-finance-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("Export failed. Try again.");
      setMessageIsError(true);
    }
  }

  function formatMoney(n: number) {
    return `R ${n.toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  if (loading && !summary) {
    return (
      <main className="min-h-screen bg-[#f7f9fb] px-4 py-10 text-[#192a3a] sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 h-9 w-56 max-w-full animate-pulse rounded-md bg-gray-200/90" />
          <div className="mb-8 h-4 w-full max-w-md animate-pulse rounded-md bg-gray-200/80" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-lg border border-gray-200/80 bg-white shadow-sm"
              />
            ))}
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#192a3a]" aria-hidden />
            Loading finance data…
          </div>
        </div>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="min-h-screen bg-[#f7f9fb] px-4 py-10 text-[#192a3a] sm:px-6">
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex gap-3">
            <AlertCircle className="h-6 w-6 shrink-0 text-red-600" aria-hidden />
            <div>
              <h1 className="text-lg font-semibold text-[#192a3a]">Access denied</h1>
              <p className="mt-2 text-sm text-gray-600">
                You don&apos;t have permission to view admin finance.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="min-h-screen bg-[#f7f9fb] px-4 py-10 text-[#192a3a] sm:px-6">
        <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex gap-3">
            <AlertCircle className="h-6 w-6 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">Couldn&apos;t load finance</h1>
              <p className="mt-2 text-sm text-gray-600">
                {message || "Check your connection and try again."}
              </p>
              <button
                type="button"
                onClick={() => void loadFinance()}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f9fb] px-4 py-10 text-[#192a3a] sm:px-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Admin — Finance
        </h1>
        <p className="mb-6 max-w-2xl text-sm text-gray-600 sm:text-base">
          Platform revenue, owner liabilities, deposits, and reconciliation.
        </p>

        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/activity"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            Activity
          </Link>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Bookings
          </Link>
          <Link
            href="/admin/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            Listings
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Verification
          </Link>
          <Link
            href="/admin/messages"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <MessageSquare className="h-4 w-4" />
            Messages
          </Link>
          <div className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white">
            Finance
          </div>
        </div>

        {message && (
          <div
            className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
              messageIsError
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
            role={messageIsError ? "alert" : "status"}
          >
            {messageIsError ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : null}
            <span>{message}</span>
          </div>
        )}

        {loading && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin text-[#192a3a]" aria-hidden />
            Updating…
          </div>
        )}

        <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {[
                {
                  title: "Gross booking value",
                  value: formatMoney(summary.grossBookingValue),
                  sub: "Paid lines (filtered)",
                },
                {
                  title: "Platform fees",
                  value: formatMoney(summary.totalPlatformFees),
                  sub: "Allocated",
                },
                {
                  title: "Owner earnings (liability)",
                  value: formatMoney(summary.totalOwnerEarnings),
                  sub: "Net to owners",
                },
                {
                  title: "Deposits collected",
                  value: formatMoney(summary.depositsCollected),
                  sub: "Deposit charges",
                },
                {
                  title: "Committed future income",
                  value: formatMoney(summary.committedFutureIncomeGross),
                  sub: "Monthly leases — rent not yet due (not cash received)",
                },
                {
                  title: "Expired unpaid",
                  value: formatMoney(summary.expiredUnpaid),
                  sub: "All expired bookings",
                },
                {
                  title: "Payment failures",
                  value: `${summary.paymentFailures} (${formatMoney(summary.paymentFailureAmount)})`,
                  sub: "Payments table",
                },
              ].map((c) => (
                <div
                  key={c.title}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {c.title}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[#192a3a]">
                    {c.value}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{c.sub}</p>
                </div>
              ))}
            </div>

            <div className="mb-6 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-[#192a3a]">
                  <Search className="h-4 w-4" />
                  Filters
                </div>
                <button
                  type="button"
                  onClick={() => void handleExportCsv()}
                  className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  Property
                  <select
                    value={spaceId}
                    onChange={(e) => setSpaceId(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    {spaceOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  Paid from
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  Paid to
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  Charge type
                  <select
                    value={chargeTypeFilter}
                    onChange={(e) => setChargeTypeFilter(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    {chargeTypes.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Gross booking value, fees, deposits, and paid transaction rows
                follow filters. Committed future income uses the property filter
                only (not paid-date filters). Expired unpaid and payment failures
                are global snapshots.
              </p>
            </div>

            <div className="mb-6 overflow-x-auto rounded-md border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-[#192a3a]">
                  Transactions
                </h2>
              </div>
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Booking</th>
                    <th className="px-3 py-2">Property</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Renter</th>
                    <th className="px-3 py-2">Charge</th>
                    <th className="px-3 py-2">Billing period</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">Fee</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Paid at</th>
                    <th className="px-3 py-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-14 text-center">
                        <p className="text-sm font-medium text-gray-700">No transactions match</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Widen your date range or clear filters to see more rows.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t) => (
                      <tr
                        key={t.id}
                        className="border-t border-gray-100 hover:bg-gray-50/80"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">
                          {t.bookingId.slice(0, 8)}…
                        </td>
                        <td className="px-3 py-2">{t.propertyTitle}</td>
                        <td className="px-3 py-2">{t.ownerLabel}</td>
                        <td className="px-3 py-2">{t.renterLabel}</td>
                        <td className="px-3 py-2 capitalize">
                          {t.chargeType.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {t.billingPeriodLabel}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(t.gross)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {formatMoney(t.platformFee)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatMoney(t.netOwner)}
                        </td>
                        <td className="px-3 py-2">{t.status}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {t.paidAt
                            ? new Date(t.paidAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-2 text-gray-600">
                          {t.paymentRef || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-md border border-dashed border-gray-300 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-[#192a3a]">
                Monthly report (paid lines, filtered)
              </h2>
              {monthly.length === 0 ? (
                <p className="text-sm leading-relaxed text-gray-600">
                  No paid activity in this filter selection. Adjust filters or dates to include paid lines.
                </p>
              ) : (
                <ul className="space-y-2">
                  {monthly.map((m) => (
                    <li
                      key={m.key}
                      className="flex flex-col justify-between gap-2 rounded-md border border-gray-200 bg-[#fbfcfd] px-4 py-3 sm:flex-row sm:items-center"
                    >
                      <span className="font-medium">{m.label}</span>
                      <span className="text-sm text-gray-600">
                        Gross {formatMoney(m.gross)} · Fees{" "}
                        {formatMoney(m.platform)} · Net {formatMoney(m.net)} ·{" "}
                        {m.count} line{m.count === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-gray-500">
                PDF exports and scheduled monthly packs can attach here later.
              </p>
            </div>
        </>
      </div>
    </main>
  );
}
