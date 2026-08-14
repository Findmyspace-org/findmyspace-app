"use client";

import { useMemo, useState } from "react";
import {
  computeBookingDiscount,
  type BookingApproveDiscountPayload,
  type BookingDiscountType,
} from "@/lib/booking-discount";

const REASON_SUGGESTIONS = [
  "School partner",
  "Community organisation",
  "Repeat customer",
  "Promotional rate",
  "Negotiated rate",
];

type BookingApprovalDiscountPanelProps = {
  originalAmount: number;
  disabled?: boolean;
  busy?: boolean;
  onApprove: (payload: BookingApproveDiscountPayload) => void | Promise<void>;
};

function formatRand(amount: number): string {
  return `R${Number(amount || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function BookingApprovalDiscountPanel({
  originalAmount,
  disabled = false,
  busy = false,
  onApprove,
}: BookingApprovalDiscountPanelProps) {
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<BookingDiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  const parsedValue = discountValue.trim() === "" ? null : Number(discountValue);
  const preview = useMemo(() => {
    if (!applyDiscount) {
      return computeBookingDiscount({
        originalAmount,
        type: null,
        value: null,
      });
    }
    return computeBookingDiscount({
      originalAmount,
      type: discountType,
      value: parsedValue,
    });
  }, [applyDiscount, originalAmount, discountType, parsedValue]);

  const previewError = "error" in preview ? preview.error : null;
  const computed = "error" in preview ? null : preview;
  const canSubmit = !disabled && !busy && !previewError;

  const approveLabel = (() => {
    if (!computed) return "Approve booking";
    if (computed.finalAmount <= 0) return "Approve booking — no payment due";
    if (computed.discountAmount > 0) {
      return `Approve booking – ${formatRand(computed.finalAmount)}`;
    }
    return "Approve & request payment";
  })();

  function submit() {
    if (!canSubmit || !computed) return;
    void onApprove({
      discountType: computed.discountType,
      discountValue: computed.discountValue,
      discountReason: discountReason.trim() ? discountReason.trim() : null,
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
          Booking price
        </p>
        <p className="mt-1 text-sm text-[#192a3a]">
          Original price{" "}
          <span className="font-semibold tabular-nums">{formatRand(originalAmount)}</span>
        </p>
      </div>

      {!applyDiscount ? (
        <button
          type="button"
          onClick={() => setApplyDiscount(true)}
          disabled={disabled || busy}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-[#192a3a] transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply discount
        </button>
      ) : (
        <div className="space-y-3 rounded-md border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
              Discount
            </p>
            <button
              type="button"
              onClick={() => {
                setApplyDiscount(false);
                setDiscountValue("");
                setDiscountReason("");
              }}
              disabled={disabled || busy}
              className="text-xs font-medium text-gray-600 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Remove discount
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              Discount type
              <select
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as BookingDiscountType)
                }
                disabled={disabled || busy}
                className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-[#192a3a] disabled:opacity-60"
              >
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed amount</option>
                <option value="negotiated">Final negotiated price</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              {discountType === "percent"
                ? "Discount (%)"
                : discountType === "fixed"
                  ? "Discount (R)"
                  : "Final price (R)"}
              <input
                type="number"
                min={0}
                max={discountType === "percent" ? 100 : undefined}
                step={discountType === "percent" ? "1" : "0.01"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                disabled={disabled || busy}
                placeholder={
                  discountType === "percent"
                    ? "10"
                    : discountType === "fixed"
                      ? "500"
                      : "3500"
                }
                className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-[#192a3a] disabled:opacity-60"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Discount reason (optional, internal)
            <input
              list="booking-discount-reason-suggestions"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              disabled={disabled || busy}
              placeholder="School partner"
              className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-[#192a3a] disabled:opacity-60"
            />
            <datalist id="booking-discount-reason-suggestions">
              {REASON_SUGGESTIONS.map((reason) => (
                <option key={reason} value={reason} />
              ))}
            </datalist>
          </label>

          {previewError ? (
            <p className="text-xs text-red-700">{previewError}</p>
          ) : computed ? (
            <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-[#192a3a]">
              <div className="flex justify-between gap-3">
                <span>Original</span>
                <span className="tabular-nums">{formatRand(computed.originalAmount)}</span>
              </div>
              {computed.discountAmount > 0 ? (
                <div className="flex justify-between gap-3 text-gray-700">
                  <span>
                    Discount
                    {computed.discountType === "percent" && computed.discountValue != null
                      ? ` (${computed.discountValue}%)`
                      : ""}
                  </span>
                  <span className="tabular-nums">
                    −{formatRand(computed.discountAmount)}
                  </span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between gap-3 border-t border-gray-200 pt-1 font-semibold">
                <span>Final amount</span>
                <span className="tabular-nums">{formatRand(computed.finalAmount)}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Processing..." : approveLabel}
      </button>
    </div>
  );
}
