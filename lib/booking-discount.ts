/**
 * Booking-specific discount math (rands, 2 decimal places).
 * Does not touch listing/space/property prices.
 *
 * Payable amount remains bookings.total_price after approval.
 * Original pricing-engine amount is preserved on original_total_price.
 */

export const COMPLIMENTARY_FULL_DISCOUNT_REFERENCE =
  "complimentary_full_discount";

export type BookingDiscountType = "percent" | "fixed" | "negotiated";

export type BookingDiscountComputeInput = {
  originalAmount: number;
  type: BookingDiscountType | null | undefined;
  value: number | null | undefined;
};

export type ComputedBookingDiscount = {
  originalAmount: number;
  discountType: BookingDiscountType | null;
  discountValue: number | null;
  discountAmount: number;
  finalAmount: number;
};

export type BookingApproveDiscountPayload = {
  discountType: BookingDiscountType | null;
  discountValue: number | null;
  discountReason: string | null;
};

export type BookingDiscountParseResult =
  | {
      ok: true;
      type: BookingDiscountType | null;
      value: number | null;
      reason: string | null;
      ownerResponseMessage: string | null;
    }
  | { ok: false; error: string };

export type PendingChargeForDiscount = {
  id: string;
  charge_type: string | null;
  amount: number | string | null;
  status: string | null;
};

export type ChargeAmountPatch = {
  id: string;
  amount: number;
};

/** Same 2dp rounding as `computeBookingTotals` / invoice helpers. */
export function roundMoney(value: number): number {
  return Number(Number(value).toFixed(2));
}

export function bookingHasVisibleDiscount(
  discountAmount: number | null | undefined
): boolean {
  return Number(discountAmount || 0) > 0;
}

/**
 * Historical bookings have null original_total_price; the stored total_price
 * is the pricing-engine amount until a discount is applied.
 */
export function resolveOriginalBookingAmount(booking: {
  original_total_price?: number | null;
  total_price?: number | null;
}): number {
  const snap = Number(booking.original_total_price);
  if (Number.isFinite(snap) && snap >= 0 && booking.original_total_price != null) {
    return roundMoney(snap);
  }
  return roundMoney(Number(booking.total_price || 0));
}

export function computeBookingDiscount(
  input: BookingDiscountComputeInput
): ComputedBookingDiscount | { error: string } {
  const originalAmount = roundMoney(Number(input.originalAmount));
  if (!Number.isFinite(originalAmount) || originalAmount < 0) {
    return { error: "Invalid original booking amount." };
  }

  const type = input.type ?? null;
  if (type == null) {
    return {
      originalAmount,
      discountType: null,
      discountValue: null,
      discountAmount: 0,
      finalAmount: originalAmount,
    };
  }

  if (type !== "percent" && type !== "fixed" && type !== "negotiated") {
    return { error: "Invalid discount type." };
  }

  const rawValue = Number(input.value);
  if (!Number.isFinite(rawValue)) {
    return { error: "Enter a valid discount value." };
  }
  if (rawValue < 0) {
    return { error: "Discount must be zero or greater." };
  }

  let discountAmount = 0;
  let finalAmount = originalAmount;
  let discountValue = roundMoney(rawValue);

  if (type === "percent") {
    if (rawValue > 100) {
      return { error: "Percentage discount must be between 0 and 100." };
    }
    discountValue = roundMoney(rawValue);
    discountAmount = roundMoney(originalAmount * (discountValue / 100));
    if (discountAmount > originalAmount) discountAmount = originalAmount;
    finalAmount = roundMoney(originalAmount - discountAmount);
  } else if (type === "fixed") {
    discountValue = roundMoney(rawValue);
    if (discountValue > originalAmount) {
      return { error: "Discount cannot exceed the original booking amount." };
    }
    discountAmount = discountValue;
    finalAmount = roundMoney(originalAmount - discountAmount);
  } else {
    const negotiated = roundMoney(rawValue);
    if (negotiated > originalAmount) {
      return { error: "Negotiated price cannot exceed the original booking amount." };
    }
    discountValue = negotiated;
    finalAmount = negotiated;
    discountAmount = roundMoney(originalAmount - finalAmount);
  }

  if (discountAmount < 0 || finalAmount < 0) {
    return { error: "Discount produced an invalid amount." };
  }
  if (discountAmount > originalAmount) {
    return { error: "Discount cannot exceed the original booking amount." };
  }
  if (roundMoney(originalAmount - discountAmount) !== finalAmount) {
    return { error: "Final amount does not match original minus discount." };
  }

  if (discountAmount === 0) {
    return {
      originalAmount,
      discountType: null,
      discountValue: null,
      discountAmount: 0,
      finalAmount: originalAmount,
    };
  }

  return {
    originalAmount,
    discountType: type,
    discountValue,
    discountAmount,
    finalAmount,
  };
}

function asTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function asDiscountType(value: unknown): BookingDiscountType | null | { error: string } {
  if (value == null || value === "" || value === "none") return null;
  if (value === "percent" || value === "fixed" || value === "negotiated") {
    return value;
  }
  return { error: "Invalid discount type." };
}

/**
 * Reads only approver inputs. Ignores client-supplied original/final/discount
 * amounts — those are always recomputed from the stored booking.
 */
export function parseApproverDiscountBody(body: unknown): BookingDiscountParseResult {
  const raw =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const typeResult = asDiscountType(raw.discountType ?? raw.discount_type);
  if (typeResult && typeof typeResult === "object" && "error" in typeResult) {
    return { ok: false, error: typeResult.error };
  }
  const type = (typeResult ?? null) as BookingDiscountType | null;

  let value: number | null = null;
  const rawValue = raw.discountValue ?? raw.discount_value;
  if (type != null) {
    if (rawValue == null || rawValue === "") {
      return { ok: false, error: "Enter a discount value." };
    }
    const n = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Enter a valid discount value." };
    }
    value = n;
  }

  return {
    ok: true,
    type,
    value,
    reason: asTrimmedString(raw.discountReason ?? raw.discount_reason, 500),
    ownerResponseMessage: asTrimmedString(
      raw.ownerResponseMessage ?? raw.owner_response_message,
      2000
    ),
  };
}

export function feesFromFinalAmount(params: {
  originalAmount: number;
  finalAmount: number;
  storedPlatformFee: number | null | undefined;
}): { platformFee: number; ownerEarnings: number } {
  const original = roundMoney(Number(params.originalAmount || 0));
  const finalAmount = roundMoney(Number(params.finalAmount || 0));
  const storedFee = roundMoney(Number(params.storedPlatformFee || 0));
  const rate = original > 0 ? storedFee / original : 0;
  const platformFee = roundMoney(finalAmount * rate);
  const ownerEarnings = roundMoney(finalAmount - platformFee);
  return { platformFee, ownerEarnings };
}

/**
 * Redistribute pending charge lines so they sum to the final approved amount.
 * Monthly: reduce first-month rent first, then deposit.
 */
export function redistributePendingChargesToFinal(
  charges: PendingChargeForDiscount[],
  finalAmount: number
): ChargeAmountPatch[] {
  const pending = charges.filter((c) => (c.status || "pending") === "pending");
  const target = roundMoney(finalAmount);
  if (pending.length === 0) return [];

  const byType = (type: string) =>
    pending.filter((c) => (c.charge_type || "") === type);

  const rentRows = byType("first_month_rent");
  const depositRows = byType("deposit");
  const totalRows = byType("booking_total");

  if (rentRows.length > 0 || depositRows.length > 0) {
    const patches: ChargeAmountPatch[] = [];
    let remaining = target;

    for (const row of rentRows) {
      const current = roundMoney(Number(row.amount || 0));
      const next = roundMoney(Math.min(current, remaining));
      remaining = roundMoney(remaining - next);
      patches.push({ id: row.id, amount: next });
    }
    for (const row of depositRows) {
      const current = roundMoney(Number(row.amount || 0));
      const next = roundMoney(Math.min(current, remaining));
      remaining = roundMoney(remaining - next);
      patches.push({ id: row.id, amount: next });
    }
    for (const row of pending) {
      if (patches.some((p) => p.id === row.id)) continue;
      patches.push({ id: row.id, amount: 0 });
    }
    return patches;
  }

  if (totalRows.length === 1 && pending.length === 1) {
    return [{ id: totalRows[0].id, amount: target }];
  }

  const sum = roundMoney(
    pending.reduce((s, c) => s + Number(c.amount || 0), 0)
  );
  if (sum <= 0) {
    return pending.map((c, i) => ({
      id: c.id,
      amount: i === 0 ? target : 0,
    }));
  }

  const patches: ChargeAmountPatch[] = [];
  let allocated = 0;
  pending.forEach((c, i) => {
    if (i === pending.length - 1) {
      patches.push({ id: c.id, amount: roundMoney(target - allocated) });
      return;
    }
    const share = roundMoney((Number(c.amount || 0) / sum) * target);
    allocated = roundMoney(allocated + share);
    patches.push({ id: c.id, amount: share });
  });
  return patches;
}

export function monthlySplitAfterDiscount(params: {
  monthlyRent: number | null | undefined;
  depositAmount: number | null | undefined;
  finalAmount: number;
}): { monthlyRent: number; depositAmount: number } {
  const rent = roundMoney(Number(params.monthlyRent || 0));
  const deposit = roundMoney(Number(params.depositAmount || 0));
  let remaining = roundMoney(params.finalAmount);
  const nextRent = roundMoney(Math.min(rent, remaining));
  remaining = roundMoney(remaining - nextRent);
  const nextDeposit = roundMoney(Math.min(deposit, remaining));
  return { monthlyRent: nextRent, depositAmount: nextDeposit };
}
