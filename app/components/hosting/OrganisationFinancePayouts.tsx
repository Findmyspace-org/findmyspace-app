"use client";

import { useEffect, useState } from "react";
import { fetchOrganisationPayouts } from "@/lib/organisation-payout-client";
import {
  formatPayoutMoney,
  type OrganisationPayoutBundle,
} from "@/lib/organisation-payout";
import { HostingSummaryStrip } from "@/app/components/hosting/hosting-ui";

export function OrganisationFinancePayouts({
  organisationId,
}: {
  organisationId: string;
}) {
  const [bundle, setBundle] = useState<Omit<OrganisationPayoutBundle, "can_record"> | null>(
    null
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    fetchOrganisationPayouts(organisationId)
      .then((next) => {
        if (mounted) setBundle(next);
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Could not load payouts.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [organisationId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        Loading organisation payouts…
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error || "Could not load organisation payouts."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HostingSummaryStrip
        label="Organisation payouts"
        items={[
          {
            label: "Revenue / paid bookings",
            value: formatPayoutMoney(
              bundle.totals.awaiting.gross + bundle.totals.paid_out.gross
            ),
            hint: "Eligible plus already paid out",
          },
          {
            label: "Platform fees",
            value: formatPayoutMoney(
              bundle.totals.awaiting.fee + bundle.totals.paid_out.fee
            ),
            hint: "FindMySpace fee on those bookings",
          },
          {
            label: "Awaiting payout",
            value: formatPayoutMoney(bundle.totals.awaiting.net),
            hint: bundle.payout_readiness.ready
              ? "Paid to FindMySpace, not yet recorded as paid to the organisation"
              : bundle.payout_readiness.label,
          },
          {
            label: "Paid out",
            value: formatPayoutMoney(bundle.totals.paid_out.net),
            hint: "Recorded manual EFTs",
          },
        ]}
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#192a3a]">Payout history</h2>
        {bundle.current_bank ? (
          <p className="mt-1 text-xs text-gray-500">
            Current destination {bundle.current_bank.bank_name} ·{" "}
            {bundle.current_bank.account_number_display}
          </p>
        ) : null}
        {bundle.history.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">
            No organisation payouts have been recorded yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bundle.history.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-[#192a3a]">
                    {formatPayoutMoney(row.amount_net)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(row.paid_at).toLocaleDateString("en-ZA")} ·{" "}
                    {row.account_number_display} · {row.reference} · {row.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
