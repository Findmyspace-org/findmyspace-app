"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminOrganisationPayouts,
  recordAdminOrganisationPayout,
} from "@/lib/organisation-payout-client";
import {
  formatPayoutMoney,
  sumOrganisationPayoutItems,
  type OrganisationPayoutBundle,
} from "@/lib/organisation-payout";

function todayInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function OrganisationPayoutAdminPanel({
  organisationId,
}: {
  organisationId: string;
}) {
  const [bundle, setBundle] = useState<OrganisationPayoutBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayInputValue);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await fetchAdminOrganisationPayouts(organisationId);
      setBundle(next);
      setSelected(next.eligible.map((row) => row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payouts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId]);

  const selectedRows = useMemo(
    () => (bundle?.eligible || []).filter((row) => selected.includes(row.id)),
    [bundle, selected]
  );
  const totals = useMemo(
    () =>
      sumOrganisationPayoutItems(
        selectedRows.map((row) => ({
          gross: row.total_price,
          fee: row.platform_fee,
          net: row.owner_earnings,
        }))
      ),
    [selectedRows]
  );

  async function recordPayout() {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await recordAdminOrganisationPayout(organisationId, {
        booking_ids: selected,
        reference,
        paid_at: paidAt || null,
        notes: notes || null,
      });
      setMessage("Manual payout recorded. This did not send money from FindMySpace.");
      setReference("");
      setNotes("");
      setPaidAt(todayInputValue());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payout.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
        Loading organisation payouts…
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error || "Could not load organisation payouts."}
      </div>
    );
  }

  const bank = bundle.current_bank;
  const ready = bundle.payout_readiness.ready && bundle.can_record;

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Organisation payouts</h3>
        <p className="mt-1 text-sm text-gray-600">
          Record a manual EFT already made outside FindMySpace. Clicking Record payout
          does not send money.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <p>
          <span className="text-gray-500">Payout readiness:</span>{" "}
          <strong>{bundle.payout_readiness.label}</strong>
        </p>
        <p>
          <span className="text-gray-500">Awaiting payout:</span>{" "}
          <strong>{formatPayoutMoney(bundle.totals.awaiting.net)}</strong>
          {bundle.totals.awaiting.count
            ? ` (${bundle.totals.awaiting.count})`
            : ""}
        </p>
      </div>

      {bank ? (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p>
            Current verified bank: {bank.bank_name} · {bank.account_holder_name} ·{" "}
            {bank.account_number_display}
          </p>
          <p className="text-xs text-gray-500">
            Version {bank.version_number} · {bank.status}. Full account numbers stay
            in the bank review panel.
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No current bank account on file.</p>
      )}

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Eligible bookings</h4>
          {bundle.eligible.length > 0 ? (
            <button
              type="button"
              className="text-xs underline"
              onClick={() =>
                setSelected(
                  selected.length === bundle.eligible.length
                    ? []
                    : bundle.eligible.map((row) => row.id)
                )
              }
            >
              {selected.length === bundle.eligible.length
                ? "Clear selection"
                : "Select all eligible"}
            </button>
          ) : null}
        </div>
        {bundle.eligible.length === 0 ? (
          <p className="text-sm text-gray-500">R0 awaiting payout.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">Include</th>
                  <th className="px-3 py-2">Booking</th>
                  <th className="px-3 py-2">Space</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Fee</th>
                  <th className="px-3 py-2 text-right">Organisation</th>
                </tr>
              </thead>
              <tbody>
                {bundle.eligible.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={(event) => {
                          setSelected((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, row.id]))
                              : current.filter((id) => id !== row.id)
                          );
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">
                      {row.space_title || "—"}
                      {row.renter_label ? (
                        <span className="block text-xs text-gray-500">
                          {row.renter_label}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPayoutMoney(row.total_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPayoutMoney(row.platform_fee)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPayoutMoney(row.owner_earnings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <p>
          Gross <strong>{formatPayoutMoney(totals.gross)}</strong>
        </p>
        <p>
          Platform fee <strong>{formatPayoutMoney(totals.fee)}</strong>
        </p>
        <p>
          Amount due <strong>{formatPayoutMoney(totals.net)}</strong>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          EFT / payment reference
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Bank reference"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Paid date
          <input
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            disabled={busy}
          />
        </label>
        <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-gray-600">
          Note (optional)
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            rows={2}
            disabled={busy}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void recordPayout()}
        disabled={busy || !ready || selected.length === 0 || reference.trim().length < 2}
        className="rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? "Recording…" : "Record payout"}
      </button>
      {!ready ? (
        <p className="text-xs text-amber-800">{bundle.payout_readiness.explanation}</p>
      ) : null}

      <div>
        <h4 className="mb-2 text-sm font-semibold">Payout history</h4>
        {bundle.history.length === 0 ? (
          <p className="text-sm text-gray-500">No payouts recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {bundle.history.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-gray-200 px-3 py-2"
              >
                <p className="font-medium">
                  {formatPayoutMoney(row.amount_net)} · {row.reference}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(row.paid_at).toLocaleString("en-ZA")} ·{" "}
                  {row.account_number_display} · {row.booking_count} booking
                  {row.booking_count === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
