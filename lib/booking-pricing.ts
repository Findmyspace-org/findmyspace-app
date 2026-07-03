import {
  resolveSpacePriceAmount,
  resolveSpacePriceUnit,
  type SpacePricingInput,
} from "@/lib/space-pricing";

export type BookingPriceSpace = SpacePricingInput & {
  platform_fee_percent?: number | null;
  deposit_type?: string | null;
  deposit_months?: number | null;
  monthly_payment_day?: number | null;
};

/** Unit price for one billable unit (hour/day/month) or flat event price. */
export function resolveBookingUnitPrice(
  space: BookingPriceSpace,
  bookingUnit: string
): number {
  const priceUnit = resolveSpacePriceUnit(space);
  if (priceUnit === "on_request") return 0;

  if (priceUnit === "event") {
    return resolveSpacePriceAmount(space) ?? 0;
  }

  const canonical = resolveSpacePriceAmount(space);
  if (canonical != null && canonical >= 0 && priceUnit) {
    return canonical;
  }

  if (bookingUnit === "hour") return Number(space.price_per_hour || 0);
  if (bookingUnit === "month") return Number(space.price_per_month || 0);
  return Number(space.price_per_day || 0);
}

export function isFlatEventBookingPrice(space: BookingPriceSpace): boolean {
  return resolveSpacePriceUnit(space) === "event";
}

export type BookingTotalsResult = {
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  depositAmount: number;
  monthlyRent: number;
  initialPaymentAmount: number;
  nextPaymentDate: string | null;
  monthsTotal: number;
  monthsPaid: number;
  platformFee: number;
  ownerAmount: number;
};

/**
 * Server-side booking totals at request creation.
 * Per-event pricing charges price_amount once regardless of selected duration.
 */
export function computeBookingTotals(
  space: BookingPriceSpace,
  bookingUnit: string,
  quantity: number,
  startAt: string
): BookingTotalsResult | null {
  const unit = bookingUnit || space.booking_unit || "day";
  const unitPrice = resolveBookingUnitPrice(space, unit);
  if (unitPrice <= 0) return null;

  const platformFeePercent = Number(space.platform_fee_percent ?? 15);
  const depositMonths = Number(space.deposit_months ?? 0);
  const monthlyPaymentDay = Number(space.monthly_payment_day ?? 1);

  let totalPrice: number;
  let depositAmount = 0;
  let monthlyRent = 0;
  let initialPaymentAmount: number;
  let nextPaymentDate: string | null = null;
  let monthsTotal = 0;
  let monthsPaid = 0;
  let billedQuantity = quantity;

  if (isFlatEventBookingPrice(space)) {
    totalPrice = Number(unitPrice.toFixed(2));
    initialPaymentAmount = totalPrice;
    billedQuantity = 1;
  } else if (unit === "month") {
    monthlyRent = unitPrice;
    monthsTotal = quantity;
    depositAmount = Number((monthlyRent * depositMonths).toFixed(2));
    initialPaymentAmount = Number((monthlyRent + depositAmount).toFixed(2));
    totalPrice = initialPaymentAmount;
    monthsPaid = 1;

    const startDate = new Date(startAt);
    const nextPayment = new Date(startDate);
    nextPayment.setMonth(nextPayment.getMonth() + 1);
    nextPayment.setDate(monthlyPaymentDay);
    nextPaymentDate = nextPayment.toISOString();
  } else {
    totalPrice = Number((quantity * unitPrice).toFixed(2));
    initialPaymentAmount = totalPrice;
  }

  const platformFee = Number((totalPrice * (platformFeePercent / 100)).toFixed(2));
  const ownerAmount = Number((totalPrice - platformFee).toFixed(2));

  return {
    unitPrice,
    quantity: billedQuantity,
    totalPrice,
    depositAmount,
    monthlyRent,
    initialPaymentAmount,
    nextPaymentDate,
    monthsTotal,
    monthsPaid,
    platformFee,
    ownerAmount,
  };
}
