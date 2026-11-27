import {
  calculateBookingCommercials,
  roundMoney,
  type CommercialModel,
} from "@/lib/commercial-calculator";
import { PAYFAST_MIN_AMOUNT_ZAR } from "@/lib/payfast-amount";

export type DiscountType = "percent" | "fixed";

/** Commercial terms already stored on the booking. Listing rates are not read again. */
export type SnapshottedBookingCommercials = {
  model: CommercialModel | null;
  commissionPercent: number | null;
  transactionFeePercent: number | null;
  source: string | null;
};

export type ApprovalDiscountInput = {
  originalRental: number;
  type: DiscountType;
  value: number;
  platformFee: number | null;
  terms?: SnapshottedBookingCommercials | null;
};

export type ApprovalDiscountResult =
  | {
      ok: true;
      originalRental: number;
      discountAmount: number;
      approvedRental: number;
      platformFee: number | null;
      hostPayout: number | null;
      transactionFee: number | null;
      platformCommission: number | null;
    }
  | { ok: false; error: string };

function usesSplitPercents(terms: SnapshottedBookingCommercials | null | undefined): terms is SnapshottedBookingCommercials {
  return Boolean(
    terms &&
      terms.source &&
      terms.source !== "legacy_space_percent" &&
      terms.model &&
      terms.transactionFeePercent != null &&
      terms.commissionPercent != null
  );
}

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
  if (usesSplitPercents(input.terms)) {
    const split = calculateBookingCommercials(approved, {
      model: input.terms.model as CommercialModel,
      commissionPercent: input.terms.commissionPercent as number,
      transactionFeePercent: input.terms.transactionFeePercent as number,
      accountingMode: "split",
    });
    return {
      ok: true,
      originalRental: original,
      discountAmount,
      approvedRental: approved,
      platformFee: split.totalFindmyspaceFee,
      hostPayout: split.hostEarnings,
      transactionFee: split.transactionFee,
      platformCommission: split.platformCommission,
    };
  }

  // Legacy combined bookings store one fee and no percentage. Scale that fee.
  // A monthly subscription amount is not part of this fee.
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
    transactionFee: null,
    platformCommission: null,
  };
}
