"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FOCUS_HIGHLIGHT_CLASS,
  useFocusHighlight,
} from "@/lib/use-focus-highlight";
import {
  Ban,
  Building2,
  ClipboardList,
  History,
  LayoutDashboard,
  Link2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  StickyNote,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { BookingRequirementResponsesLoader } from "@/app/components/BookingRequirementResponsesLoader";

type AdminBookingRow = {
  id: string;
  spaceId: string | null;
  listingTitle: string;
  location: string;
  renterId: string;
  renterName: string;
  renterEmail: string | null;
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  bookingUnit: string | null;
  status: string;
  paymentStatus: string;
  startAt: string | null;
  endAt: string | null;
  totalPrice: number | null;
  createdAt: string | null;
};

function AdminBookingsPageContent({
  focusBookingId,
}: {
  focusBookingId: string | null;
}) {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [supportModal, setSupportModal] = useState<
    | null
    | { booking: AdminBookingRow; mode: "note" | "pay" | "cancel" }
  >(null);
  const [requirementsModalBooking, setRequirementsModalBooking] =
    useState<AdminBookingRow | null>(null);
  const [supportNote, setSupportNote] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [payLinkResult, setPayLinkResult] = useState<string | null>(null);

  const { highlightedId } = useFocusHighlight({
    focusId: focusBookingId,
    ready: !loading,
    prefix: "admin-booking",
  });

  // When arriving via `?focus=…`, broaden filters so the row is visible and
  // pre-populate the search box (the booking id is also queryable).
  useEffect(() => {
    if (!focusBookingId || loading) return;
    const found = bookings.some((b) => b.id === focusBookingId);
    if (!found) return;
    setStatusFilter("all");
    setPaymentFilter("all");
  }, [focusBookingId, loading, bookings]);

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
    if (!hasAdminUiAccess((profile as { role?: string | null } | null)?.role)) {
      setRole("user");
      return false;
    }
    setRole("admin");
    return true;
  }, []);

  const loadBookings = useCallback(async () => {
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
        setMessage("Sign in to view bookings.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (paymentFilter !== "all") params.set("payment_status", paymentFilter);
      if (appliedSearch.trim()) params.set("q", appliedSearch.trim());

      const res = await fetch(`/api/admin/bookings?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Could not load bookings.");
        setMessageIsError(true);
        setLoading(false);
        return;
      }

      setBookings((json?.bookings || []) as AdminBookingRow[]);
    } catch {
      setMessage("Something went wrong while loading. Try again.");
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  }, [checkRole, statusFilter, paymentFilter, appliedSearch]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  function applySearch() {
    setAppliedSearch(searchInput);
  }

  function canAdminResendPayment(b: AdminBookingRow): boolean {
    return (
      b.status === "accepted_awaiting_payment" &&
      (b.paymentStatus || "").toLowerCase() === "awaiting_payment"
    );
  }

  function canAdminCancelSupport(b: AdminBookingRow): boolean {
    const ps = (b.paymentStatus || "").toLowerCase();
    if (ps === "paid" || ps === "paid_confirmed") return false;
    return (
      b.status === "pending_owner" || b.status === "accepted_awaiting_payment"
    );
  }

  function openSupport(
    booking: AdminBookingRow,
    mode: "note" | "pay" | "cancel"
  ) {
    setSupportModal({ booking, mode });
    setSupportNote("");
    setSupportReason("");
    setPayLinkResult(null);
  }

  function closeSupport() {
    setSupportModal(null);
    setSupportNote("");
    setSupportReason("");
    setPayLinkResult(null);
  }

  async function submitSupport() {
    if (!supportModal) return;
    const { booking, mode } = supportModal;
    const reason = supportReason.trim();
    if (reason.length < 3) {
      setMessage("Enter a reason (at least 3 characters).");
      setMessageIsError(true);
      return;
    }
    if (mode === "note") {
      const note = supportNote.trim();
      if (note.length < 3) {
        setMessage("Enter a note (at least 3 characters).");
        setMessageIsError(true);
        return;
      }
    }

    setSupportBusy(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Sign in again.");
        setMessageIsError(true);
        setSupportBusy(false);
        return;
      }

      const path =
        mode === "note"
          ? `/api/admin/bookings/${booking.id}/note`
          : mode === "pay"
            ? `/api/admin/bookings/${booking.id}/payment-link`
            : `/api/admin/bookings/${booking.id}/cancel-support`;

      const body =
        mode === "note"
          ? JSON.stringify({ note: supportNote.trim(), reason })
          : JSON.stringify({ reason });

      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error || "Action failed.");
        setMessageIsError(true);
        setSupportBusy(false);
        return;
      }

      if (mode === "pay") {
        setPayLinkResult(JSON.stringify(json, null, 2));
        setMessage("Payment checkout payload generated (copy for renter flow).");
        setMessageIsError(false);
      } else {
        setMessage(
          mode === "note"
            ? "Support note added."
            : "Booking cancelled (support)."
        );
        setMessageIsError(false);
        closeSupport();
        await loadBookings();
      }
    } catch {
      setMessage("Request failed.");
      setMessageIsError(true);
    } finally {
      setSupportBusy(false);
    }
  }

  if (loading && role === null) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-6xl rounded-md border border-gray-300 p-6 shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      </main>
    );
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-md border border-red-300 bg-red-50 p-6">
          <h1 className="mb-3 text-2xl font-bold">Access denied</h1>
          <p className="text-sm text-red-700">
            You do not have admin access to this area.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-4xl font-bold">Admin — Bookings</h1>
        <p className="mb-6 text-gray-600">
          Bookings list with support note, payment-link payload, and limited cancel
          (same eligibility rules as renter where applicable).
        </p>

        <AdminNav current="bookings" />

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-gray-300 bg-white p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Booking status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="pending_owner">pending_owner</option>
              <option value="accepted_awaiting_payment">accepted_awaiting_payment</option>
              <option value="paid_confirmed">paid_confirmed</option>
              <option value="declined">declined</option>
              <option value="expired">expired</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Payment status
            </label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="unpaid">unpaid</option>
              <option value="awaiting_payment">awaiting_payment</option>
              <option value="paid">paid</option>
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Text search
            </label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-gray-500" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearch();
                  }}
                  placeholder="ID, name, email, listing…"
                  className="w-full min-w-0 border-0 bg-transparent text-sm outline-none"
                />
              </div>
              <button
                type="button"
                onClick={applySearch}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Search
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadBookings()}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-md p-3 text-sm ${
              messageIsError
                ? "border border-red-200 bg-red-50 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
            role={messageIsError ? "alert" : "status"}
          >
            {message}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-300 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-3">Booking</th>
                  <th className="px-3 py-3">Listing</th>
                  <th className="px-3 py-3">Renter</th>
                  <th className="px-3 py-3">Host</th>
                  <th className="px-3 py-3">Dates</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Status / Pay</th>
                  <th className="px-3 py-3">Support</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr
                    key={b.id}
                    id={`admin-booking-${b.id}`}
                    className={`border-b border-gray-100 ${
                      highlightedId === b.id ? FOCUS_HIGHLIGHT_CLASS : ""
                    }`}
                  >
                    <td className="max-w-[140px] px-3 py-3 font-mono text-xs text-[#192a3a]">
                      {b.id}
                    </td>
                    <td className="max-w-[180px] px-3 py-3">
                      <div className="font-medium text-[#192a3a]">
                        {b.listingTitle}
                      </div>
                      <div className="text-xs text-gray-500">{b.location}</div>
                    </td>
                    <td className="max-w-[160px] px-3 py-3 text-xs">
                      <div>{b.renterName}</div>
                      <div className="truncate text-gray-500">{b.renterEmail}</div>
                    </td>
                    <td className="max-w-[160px] px-3 py-3 text-xs">
                      <div>{b.ownerName}</div>
                      <div className="truncate text-gray-500">{b.ownerEmail}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-700">
                      {b.startAt
                        ? new Date(b.startAt).toLocaleString()
                        : "—"}
                      <br />
                      {b.endAt ? new Date(b.endAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {b.totalPrice != null
                        ? `R ${Number(b.totalPrice).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div>{b.status}</div>
                      <div className="text-gray-600">{b.paymentStatus}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setRequirementsModalBooking(b)}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] hover:bg-gray-50"
                        >
                          <ClipboardList className="h-3 w-3" />
                          Requirements
                        </button>
                        <button
                          type="button"
                          onClick={() => openSupport(b, "note")}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] hover:bg-gray-50"
                        >
                          <StickyNote className="h-3 w-3" />
                          Note
                        </button>
                        <button
                          type="button"
                          disabled={!canAdminResendPayment(b)}
                          onClick={() => openSupport(b, "pay")}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            canAdminResendPayment(b)
                              ? "Generate PayFast payload"
                              : "Only for accepted_awaiting_payment + awaiting_payment"
                          }
                        >
                          <Link2 className="h-3 w-3" />
                          Pay link
                        </button>
                        <button
                          type="button"
                          disabled={!canAdminCancelSupport(b)}
                          onClick={() => openSupport(b, "cancel")}
                          className="inline-flex items-center gap-1 rounded border border-red-100 px-2 py-1 text-[11px] text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            canAdminCancelSupport(b)
                              ? "Cancel (pending owner or awaiting payment, not paid)"
                              : "Not eligible for support cancel"
                          }
                        >
                          <Ban className="h-3 w-3" />
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bookings.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-600">
                No bookings match filters.
              </p>
            )}
          </div>
        )}

        {requirementsModalBooking && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
              role="dialog"
              aria-labelledby="admin-booking-requirements-title"
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h2
                    id="admin-booking-requirements-title"
                    className="text-lg font-semibold text-[#192a3a]"
                  >
                    Booking requirements
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {requirementsModalBooking.listingTitle}
                  </p>
                  <p className="font-mono text-xs text-gray-500">
                    {requirementsModalBooking.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRequirementsModalBooking(null)}
                  className="rounded p-1 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <BookingRequirementResponsesLoader
                bookingId={requirementsModalBooking.id}
                infoUrl={`/api/admin/bookings/${requirementsModalBooking.id}/requirement-info`}
                title="Renter-submitted information"
              />
            </div>
          </div>
        )}

        {supportModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
              role="dialog"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-[#192a3a]">
                    {supportModal.mode === "note" && "Support note"}
                    {supportModal.mode === "pay" && "Payment link payload"}
                    {supportModal.mode === "cancel" && "Support cancellation"}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-gray-500">
                    {supportModal.booking.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSupport}
                  className="rounded p-1 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {supportModal.mode === "note" && (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Note (visible in thread as [Support])
                  </label>
                  <textarea
                    value={supportNote}
                    onChange={(e) => setSupportNote(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              {supportModal.mode === "pay" && payLinkResult && (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Response JSON
                  </label>
                  <pre className="max-h-48 overflow-auto rounded border bg-gray-50 p-2 text-[10px]">
                    {payLinkResult}
                  </pre>
                </div>
              )}

              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Reason (audit log)
                </label>
                <input
                  type="text"
                  value={supportReason}
                  onChange={(e) => setSupportReason(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Why are you doing this?"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeSupport}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm"
                >
                  {supportModal.mode === "pay" && payLinkResult ? "Close" : "Cancel"}
                </button>
                {supportModal.mode === "pay" && payLinkResult ? null : (
                  <button
                    type="button"
                    onClick={() => void submitSupport()}
                    disabled={supportBusy}
                    className="rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {supportBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Submit"
                    )}
                  </button>
                )}
              </div>
              {supportModal.mode === "pay" && payLinkResult && (
                <p className="mt-2 text-xs text-gray-500">
                  Renter should complete payment while logged in; this payload matches
                  server-side Pay now rules.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function AdminBookingsSearchParamsClient() {
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("focus");
  return <AdminBookingsPageContent focusBookingId={focusBookingId} />;
}

export default function AdminBookingsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-10 text-sm text-gray-600">Loading…</div>
      }
    >
      <AdminBookingsSearchParamsClient />
    </Suspense>
  );
}
