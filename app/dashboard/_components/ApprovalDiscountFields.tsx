"use client";

import { useMemo, useState } from "react";
import { quoteApprovalDiscount, type DiscountType } from "@/lib/approval-discount";

export type ApprovalDiscountChoice = {
  type: DiscountType;
  value: number;
  reason: string;
};

export function ApprovalDiscountFields({
  originalAmount,
  platformFee,
  onChange,
}: {
  originalAmount: number;
  platformFee?: number | null;
  onChange: (discount: ApprovalDiscountChoice | null) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [type, setType] = useState<DiscountType>("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  const quote = useMemo(() => {
    if (!enabled) return null;
    const parsed = Number(value);
    if (!value.trim() || !Number.isFinite(parsed)) return null;
    return quoteApprovalDiscount({
      originalRental: originalAmount,
      type,
      value: parsed,
      platformFee: platformFee ?? null,
    });
  }, [enabled, originalAmount, platformFee, type, value]);

  function publish(nextEnabled: boolean, nextType: DiscountType, nextValue: string, nextReason: string) {
    const parsed = Number(nextValue);
    if (!nextEnabled || !nextValue.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      onChange(null);
      return;
    }
    onChange({ type: nextType, value: parsed, reason: nextReason });
  }

  return (
    <div className="w-full rounded-md border border-gray-200 bg-white p-3 text-sm text-[#192a3a]">
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            publish(event.target.checked, type, value, reason);
          }}
        />
        Apply a discount to this request
      </label>
      {enabled ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Discount type</span>
            <select
              value={type}
              onChange={(event) => {
                const next = event.target.value === "fixed" ? "fixed" : "percent";
                setType(next);
                publish(true, next, value, reason);
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5"
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount (ZAR)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              {type === "percent" ? "Percent" : "Amount in rand"}
            </span>
            <input
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                publish(true, type, event.target.value, reason);
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">Reason for the discount</span>
            <input
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                publish(true, type, value, event.target.value);
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          {quote?.ok ? (
            <div className="sm:col-span-2 space-y-1 rounded-md bg-[#fbfcfd] p-3">
              <p>Original booking amount: R{quote.originalRental.toFixed(2)}</p>
              <p>Host discount: R{quote.discountAmount.toFixed(2)}</p>
              <p>Approved rental amount: R{quote.approvedRental.toFixed(2)}</p>
              {quote.platformFee != null ? <p>FindMySpace fee: R{quote.platformFee.toFixed(2)}</p> : null}
              {quote.hostPayout != null ? <p>Expected host payout: R{quote.hostPayout.toFixed(2)}</p> : null}
              <p className="font-medium">Amount payable by the renter: R{quote.approvedRental.toFixed(2)}</p>
            </div>
          ) : null}
          {quote && !quote.ok ? (
            <p className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">{quote.error}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-gray-600">Leave this off to approve the original amount.</p>
      )}
    </div>
  );
}
