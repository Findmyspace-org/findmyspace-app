import { roundMoney } from "@/lib/commercial-calculator";
import { PAYFAST_MIN_AMOUNT_ZAR } from "@/lib/payfast-amount";

export type DiscountType = "percent" | "fixed";

export type ApprovalDiscountInput = {
  originalRental: number;
  type: DiscountType;
  value: number;
  platformFee: number | null;
};

export type ApprovalDiscountResult =
  | {
      ok: true;
      originalRental: number;
      discountAmount: number;
      approvedRental: number;
      platformFee: number | null;
      hostPayout: number | null;
    }
  | { ok: false; error: string };

export function quoteApprovalDiscount(input: ApprovalDiscountInput): ApprovalDiscountResult {
  const original = roundMoney(input.originalRental);
  if (!Number.isFinite(original) || original <= 0) {
    return { ok: false, error: "This request has no rental amount that can be discounted." };
  }
  if (!Number.isFinite(input.value) || input.value <= 0) {
    return { ok: false, error: "Enter a discount greater than zero, or approve without one." };
  }
  const discountAmount =
    input.type === "percent"
      ? roundMoney((original * input.value) / 100)
      : roundMoney(input.value);
  if (input.type === "percent" && input.value > 100) {
    return { ok: false, error: "A percentage discount cannot be more than 100%." };
  }
  if (discountAmount > original) {
    return { ok: false, error: "The discount cannot be more than the booking amount." };
  }
  const approved = roundMoney(original - discountAmount);
  if (approved < PAYFAST_MIN_AMOUNT_ZAR) {
    return {
      ok: false,
      error: `The amount payable must be at least R${PAYFAST_MIN_AMOUNT_ZAR.toFixed(2)}. A free or smaller booking cannot be sent to PayFast in this release.`,
    };
  }
  const platformFee =
    input.platformFee == null ? null : roundMoney((input.platformFee * approved) / original);
  const hostPayout = platformFee == null ? null : roundMoney(approved - platformFee);
  return {
    ok: true,
    originalRental: original,
    discountAmount,
    approvedRental: approved,
    platformFee,
    hostPayout,
  };
}
