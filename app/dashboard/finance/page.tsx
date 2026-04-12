"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Download,
  Home,
  Landmark,
  LayoutDashboard,
  Search,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import {
  buildFinanceLineItems,
  type FinanceBookingInput,
} from "@/lib/finance-booking-lines";
import {
  filterFinanceLineItems,
  groupMonthlyPaidLines,
  summarizePaidLines,
} from "@/lib/admin-finance-filters";
import { isChargeLinePendingForReporting } from "@/lib/finance-status";
import { FINANCE_BOOKINGS_QUERY_LIMIT } from "@/lib/finance-query-limits";

type SpaceOption = { id: string; title: string | null };

function formatMoney(n: number) {
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function OwnerFinancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [bookings, setBookings] = useState<FinanceBookingInput[]>([]);

  const [spaceId, setSpaceId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [chargeTypeFilter, setChargeTypeFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("Please log in.");
          setLoading(false);
          return;
        }
        setSessionEmail(user.email ?? null);

        const { data: spaceRows, error: spaceErr } = await supabase
          .from("spaces")
          .select("id, title")
          .eq("owner_id", user.id)
          .order("title", { ascending: true });

        if (spaceErr) throw spaceErr;
        setSpaces((spaceRows || []) as SpaceOption[]);

        const { data: bookingRows, error: bookErr } = await (supabase
          .from("bookings") as any)
          .select(
            `
            id,
            space_id,
            total_price,
            platform_fee,
            owner_earnings,
            status,
            payment_status,
            paid_at,
            created_at,
            renter:profiles!bookings_renter_id_fkey(first_name, last_name, email),
            space:spaces(title),
            booking_charges(
              id,
              charge_type,
              description,
              billing_period_start,
              billing_period_end,
              amount,
              status,
              paid_at,
              payment_reference,
              statement_month
            )
          `
          )
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(FINANCE_BOOKINGS_QUERY_LIMIT);

        if (bookErr) throw bookErr;
        setBookings((bookingRows || []) as FinanceBookingInput[]);
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "object" &&
                e !== null &&
                "message" in e &&
                typeof (e as { message: unknown }).message === "string"
              ? (e as { message: string }).message
              : "Could not load finance data.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const allTransactions = useMemo(
    () => buildFinanceLineItems(bookings),
    [bookings]
  );

  const chargeTypes = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTransactions) s.add(t.chargeType);
    return Array.from(s).sort();
  }, [allTransactions]);

  const filtered = useMemo(
    () =>
      filterFinanceLineItems(allTransactions, bookings, {
        dateFrom,
        dateTo,
        status: statusFilter,
        chargeType: chargeTypeFilter,
        spaceId,
      }),
    [
      allTransactions,
      bookings,
      spaceId,
      dateFrom,
      dateTo,
      statusFilter,
      chargeTypeFilter,
    ]
  );

  const summary = useMemo(() => {
    const paid = summarizePaidLines(filtered);

    let outstanding = 0;
    for (const t of allTransactions) {
      if (!isChargeLinePendingForReporting(t.status)) continue;
      const b = bookings.find((x) => x.id === t.bookingId);
      if (
        b?.status === "accepted_awaiting_payment" &&
        (b.payment_status || "") === "awaiting_payment"
      ) {
        outstanding += t.gross;
      }
    }

    return {
      grossReceived: paid.grossBookingValue,
      deposits: paid.depositsCollected,
      platformFees: paid.totalPlatformFees,
      netOwner: paid.totalOwnerEarnings,
      outstanding,
    };
  }, [filtered, allTransactions, bookings]);

  const statementsByMonth = useMemo(
    () => groupMonthlyPaidLines(filtered, bookings),
    [filtered, bookings]
  );

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f7f9fb] px-4 py-8 text-[#192a3a] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4">
            <Link
              href="/dashboard/owner"
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Overview</span>
            </Link>
            <Link
              href="/dashboard/listings"
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]"
            >
              <Home className="h-4 w-4" />
              <span>Listings</span>
            </Link>
            <Link
              href="/dashboard/requests"
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]"
            >
              <ClipboardList className="h-4 w-4" />
              <span>Requests</span>
            </Link>
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]"
            >
              <CalendarDays className="h-4 w-4" />
              <span>Calendar</span>
            </Link>
            <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-[#192a3a] shadow-sm">
              <Landmark className="h-4 w-4" />
              <span>Finance</span>
            </div>
          </div>

          <div className="mb-6 rounded-md border border-gray-200 bg-white p-5 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Finance
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Payments, deposits, fees, and net earnings across your listings.
            </p>
            {sessionEmail && (
              <p className="mt-2 text-sm text-gray-500">Logged in as {sessionEmail}</p>
            )}
          </div>

          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-600">Loading finance data…</p>
          ) : (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  {
                    title: "Gross received",
                    value: formatMoney(summary.grossReceived),
                    sub: "Paid charges (filtered)",
                  },
                  {
                    title: "Deposits received",
                    value: formatMoney(summary.deposits),
                    sub: "Deposit line items",
                  },
                  {
                    title: "Platform fees",
                    value: formatMoney(summary.platformFees),
                    sub: "Allocated from bookings",
                  },
                  {
                    title: "Net owner earnings",
                    value: formatMoney(summary.netOwner),
                    sub: "After platform fee",
                  },
                  {
                    title: "Outstanding",
                    value: formatMoney(summary.outstanding),
                    sub: "Awaiting renter payment",
                  },
                ].map((card) => (
                  <div
                    key={card.title}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      {card.title}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-[#192a3a]">
                      {card.value}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{card.sub}</p>
                  </div>
                ))}
              </div>

              <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium text-[#192a3a]">
                  <Search className="h-4 w-4" />
                  Filters
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    Property
                    <select
                      value={spaceId}
                      onChange={(e) => setSpaceId(e.target.value)}
                      className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-[#192a3a]"
                    >
                      <option value="all">All properties</option>
                      {spaces.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title || "Untitled"}
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
                      className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
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
                      className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
                    >
                      <option value="all">All types</option>
                      {chargeTypes.map((ct) => (
                        <option key={ct} value={ct}>
                          {ct.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Date range applies to paid charges. Clear dates to include
                  pending rows when status allows.
                </p>
              </div>

              <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-[#192a3a]">
                    Transactions
                  </h2>
                </div>
                <table className="min-w-[1000px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                    <tr>
                      <th className="px-3 py-2">Property</th>
                      <th className="px-3 py-2">Renter</th>
                      <th className="px-3 py-2">Charge type</th>
                      <th className="px-3 py-2">Billing period</th>
                      <th className="px-3 py-2 text-right">Gross</th>
                      <th className="px-3 py-2 text-right">Platform fee</th>
                      <th className="px-3 py-2 text-right">Net</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Paid at</th>
                      <th className="px-3 py-2">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-3 py-8 text-center text-gray-500"
                        >
                          No transactions match your filters.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((t) => (
                        <tr
                          key={t.id}
                          className="border-t border-gray-100 hover:bg-gray-50/80"
                        >
                          <td className="px-3 py-2">{t.propertyTitle}</td>
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
                          <td className="max-w-[140px] truncate px-3 py-2 text-gray-600">
                            {t.paymentRef || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[#192a3a]">
                    Monthly statements
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Grouped by payment month
                  </span>
                </div>
                {statementsByMonth.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No paid transactions in the current filter selection. Adjust
                    filters or date range to see statement groupings.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {statementsByMonth.map((s) => (
                      <li
                        key={s.key}
                        className="flex flex-col gap-1 rounded-md border border-gray-200 bg-[#fbfcfd] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium text-[#192a3a]">{s.label}</p>
                          <p className="text-xs text-gray-500">
                            {s.count} line item{s.count === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <span className="text-gray-600">
                            Gross{" "}
                            <strong className="text-[#192a3a]">
                              {formatMoney(s.gross)}
                            </strong>
                          </span>
                          <span className="text-gray-600">
                            Fees{" "}
                            <strong className="text-[#192a3a]">
                              {formatMoney(s.platform)}
                            </strong>
                          </span>
                          <span className="text-gray-600">
                            Net{" "}
                            <strong className="text-[#192a3a]">
                              {formatMoney(s.net)}
                            </strong>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[#192a3a]">
                      Reports &amp; export
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      CSV/PDF exports and scheduled reports will plug in here.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400"
                  >
                    <Download className="h-4 w-4" />
                    Export (soon)
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
