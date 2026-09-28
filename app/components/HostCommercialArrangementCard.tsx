"use client";

import { useEffect, useMemo, useState } from "react";
import { ownerApiFetch } from "@/lib/owner-api-client";
import {
  estimateHostEarningsFromArrangement,
  HOST_COMMERCIAL_NEUTRAL,
  type HostCommercialArrangementDto,
} from "@/lib/host-commercial-copy";

type HostCommercialArrangementCardProps = {
  organisationId?: string | null;
  propertyId?: string | null;
  spaceId?: string | null;
  grossAmount?: number | null;
  grossLabel?: string | null;
};

export function HostCommercialArrangementCard({
  organisationId,
  propertyId,
  spaceId,
  grossAmount,
  grossLabel,
}: HostCommercialArrangementCardProps) {
  const [arrangement, setArrangement] = useState<HostCommercialArrangementDto | null>(
    null
  );
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (organisationId) params.set("organisationId", organisationId);
    if (propertyId) params.set("propertyId", propertyId);
    if (spaceId) params.set("spaceId", spaceId);
    const query = params.toString();
    void ownerApiFetch(
      `/api/host/commercial-arrangement${query ? `?${query}` : ""}`
    )
      .then((data) => {
        if (cancelled) return;
        const next = (data as { arrangement?: HostCommercialArrangementDto })
          .arrangement;
        if (next) setArrangement(next);
        else setLoadFailed(true);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [organisationId, propertyId, spaceId]);

  const estimate = useMemo(() => {
    if (!arrangement || grossAmount == null || !(grossAmount > 0)) return null;
    return estimateHostEarningsFromArrangement(grossAmount, arrangement);
  }, [arrangement, grossAmount]);

  const summary = loadFailed
    ? HOST_COMMERCIAL_NEUTRAL
    : arrangement?.summary || HOST_COMMERCIAL_NEUTRAL;

  return (
    <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3 text-sm text-[#334155] sm:p-4">
      <p className="font-semibold text-[#0f172a]">FindMySpace fees</p>
      <p className="mt-1">{summary}</p>
      {arrangement?.subscriptionUnresolved ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-950">
          {arrangement.subscriptionUnresolvedMessage ||
            "Your monthly subscription amount is not currently resolved."}
        </p>
      ) : null}
      {arrangement?.model === "subscription" &&
      arrangement.monthlyAmount != null &&
      !arrangement.subscriptionUnresolved ? (
        <p className="mt-2 text-xs text-[#64748b]">
          The monthly subscription is billed separately. It is not added to the
          renter price and is not deducted from this listing amount.
        </p>
      ) : null}
      {estimate && grossAmount != null ? (
        <div className="mt-2 space-y-0.5">
          <p>
            {grossLabel || "Listed amount"}: R{grossAmount.toFixed(2)}
          </p>
          {estimate.platformCommission != null ? (
            <p>
              Platform commission: -R{estimate.platformCommission.toFixed(2)}
            </p>
          ) : null}
          {estimate.transactionFee != null ? (
            <p>Transaction fee: -R{estimate.transactionFee.toFixed(2)}</p>
          ) : null}
          <p className="pt-1.5 font-semibold text-[#0f172a]">
            You would receive approximately R{estimate.hostEarnings.toFixed(2)}
          </p>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-[#64748b]">
        Renters pay the listed amount. Exact fees are locked when a booking is
        created.
      </p>
    </div>
  );
}
