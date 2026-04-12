/**
 * Monthly lease: committed future rent is derived from booking columns, not stored
 * as paid booking_charges (future months are not yet payable).
 */

import type { FinanceBookingInput } from "@/lib/finance-booking-lines";

export type MonthlyContractSnapshot = {
  isMonthly: boolean;
  monthlyRent: number;
  monthsTotal: number;
  monthsPaid: number;
  futureRentMonths: number;
  /** Rent scheduled after months already paid (not yet invoiced as charges). */
  committedFutureIncomeGross: number;
  /** Full-term rent (months_total × monthly_rent). */
  totalContractRentGross: number;
  /** Rent still to be collected over the lease (same as committedFutureIncomeGross when months_paid is accurate). */
  remainingContractRentGross: number;
  nextRentAmount: number;
  depositAmount: number;
  initialPaymentAmount: number | null;
  nextPaymentDate: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isMonthlyBookingUnit(unit: string | null | undefined): boolean {
  return (unit || "").trim().toLowerCase() === "month";
}

/**
 * Bookings that have an approved/accepted lease worth showing committed future for.
 * Excludes declined/expired and pre-owner-response requests.
 */
export function shouldIncludeBookingForCommittedFuture(
  b: Pick<FinanceBookingInput, "booking_unit" | "status">
): boolean {
  if (!isMonthlyBookingUnit(b.booking_unit)) return false;
  const st = (b.status || "").trim().toLowerCase();
  if (
    st === "declined" ||
    st === "expired" ||
    st === "pending_owner" ||
    st === "pending"
  ) {
    return false;
  }
  return true;
}

export function getMonthlyContractSnapshot(
  b: Pick<
    FinanceBookingInput,
    | "booking_unit"
    | "monthly_rent"
    | "months_total"
    | "months_paid"
    | "deposit_amount"
    | "initial_payment_amount"
    | "next_payment_date"
  >
): MonthlyContractSnapshot | null {
  if (!isMonthlyBookingUnit(b.booking_unit)) return null;

  const monthlyRent = Number(b.monthly_rent ?? 0);
  const monthsTotal = Math.max(0, Math.floor(Number(b.months_total ?? 0)));
  const monthsPaidRaw = b.months_paid;
  const monthsPaid = Math.max(
    0,
    Math.floor(
      monthsPaidRaw === null || monthsPaidRaw === undefined
        ? 1
        : Number(monthsPaidRaw)
    )
  );

  if (monthsTotal <= 0 || monthlyRent <= 0) {
    return {
      isMonthly: true,
      monthlyRent,
      monthsTotal,
      monthsPaid,
      futureRentMonths: 0,
      committedFutureIncomeGross: 0,
      totalContractRentGross: 0,
      remainingContractRentGross: 0,
      nextRentAmount: monthlyRent,
      depositAmount: Number(b.deposit_amount ?? 0),
      initialPaymentAmount:
        b.initial_payment_amount !== null &&
        b.initial_payment_amount !== undefined
          ? Number(b.initial_payment_amount)
          : null,
      nextPaymentDate: b.next_payment_date ?? null,
    };
  }

  const totalContractRentGross = round2(monthsTotal * monthlyRent);
  const futureRentMonths = Math.max(0, monthsTotal - monthsPaid);
  const committedFutureIncomeGross = round2(futureRentMonths * monthlyRent);

  return {
    isMonthly: true,
    monthlyRent,
    monthsTotal,
    monthsPaid,
    futureRentMonths,
    committedFutureIncomeGross,
    totalContractRentGross,
    remainingContractRentGross: committedFutureIncomeGross,
    nextRentAmount: monthlyRent,
    depositAmount: Number(b.deposit_amount ?? 0),
    initialPaymentAmount:
      b.initial_payment_amount !== null &&
      b.initial_payment_amount !== undefined
        ? Number(b.initial_payment_amount)
        : null,
    nextPaymentDate: b.next_payment_date ?? null,
  };
}

/** Sum committed future rent across owner/admin booking lists (not received cash). */
export function sumCommittedFutureIncomeGross(
  bookings: FinanceBookingInput[]
): number {
  let sum = 0;
  for (const b of bookings) {
    if (!shouldIncludeBookingForCommittedFuture(b)) continue;
    const snap = getMonthlyContractSnapshot(b);
    if (snap && snap.committedFutureIncomeGross > 0) {
      sum += snap.committedFutureIncomeGross;
    }
  }
  return round2(sum);
}
