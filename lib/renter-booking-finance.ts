/**
 * Renter-facing booking finance metrics (My Bookings, summaries).
 * Aligns with invoice + monthly-contract snapshot: paid charges, pending charges,
 * and scheduled future rent for monthly leases.
 */

import {
  isBookingStatusEligibleForPaidReporting,
  isChargeLinePaidForReporting,
  isChargeLinePendingForReporting,
  isPaymentSettledForReporting,
} from "@/lib/finance-status";
import { getMonthlyContractSnapshot } from "@/lib/monthly-contract-finance";

export type BookingChargeLite = {
  amount: number | string | null;
  status: string | null;
};

export type RenterBookingFinance = {
  amountPaid: number;
  amountOutstanding: number;
  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Same rounding as invoice / monthly helpers. */
export function formatZarCompact(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** One line for expanded card + page summary. */
export function formatRenterNextPaymentSummary(
  fin: RenterBookingFinance
): string {
  if (fin.nextPaymentDate && fin.nextPaymentAmount != null) {
    const d = new Date(fin.nextPaymentDate);
    return `${formatZarCompact(fin.nextPaymentAmount)} · ${d.toLocaleDateString(
      "en-ZA",
      { day: "numeric", month: "short", year: "numeric" }
    )}`;
  }
  if (fin.nextPaymentAmount != null && fin.nextPaymentAmount > 0) {
    return `${formatZarCompact(fin.nextPaymentAmount)} · Due now`;
  }
  return "—";
}

export function formatPageNextPaymentSummary(
  m: RenterBookingsPageMetrics
): string {
  if (m.nextPaymentDate && m.nextPaymentAmount != null) {
    const d = new Date(m.nextPaymentDate);
    return `${formatZarCompact(m.nextPaymentAmount)} · ${d.toLocaleDateString(
      "en-ZA",
      { day: "numeric", month: "short", year: "numeric" }
    )}`;
  }
  if (m.checkoutDueAmount != null && m.checkoutDueAmount > 0) {
    return `${formatZarCompact(m.checkoutDueAmount)} · Due now`;
  }
  return "—";
}

/**
 * Amount paid: sum of paid `booking_charges` lines; if none and booking is paid+eligible, `total_price` (legacy).
 * Outstanding: pending charge lines + remaining scheduled rent for monthly (matches invoice renter total).
 * Next payment: `next_payment_date` + one period amount when future months remain; one-off awaiting checkout uses `total_price`.
 */
export function computeRenterBookingFinance(
  booking: {
    booking_unit: string | null;
    total_price: number | null;
    status: string | null;
    payment_status: string | null;
    monthly_rent?: number | null;
    months_total?: number | null;
    months_paid?: number | null;
    deposit_amount?: number | null;
    initial_payment_amount?: number | null;
    next_payment_date?: string | null;
  },
  charges: BookingChargeLite[]
): RenterBookingFinance {
  const paidSum = charges.reduce(
    (s, c) =>
      s +
      (isChargeLinePaidForReporting(c.status) ? Number(c.amount || 0) : 0),
    0
  );
  const pendingSum = charges.reduce(
    (s, c) =>
      s +
      (isChargeLinePendingForReporting(c.status) ? Number(c.amount || 0) : 0),
    0
  );

  const snap = getMonthlyContractSnapshot(booking);

  let amountPaid = round2(paidSum);
  if (
    charges.length === 0 &&
    isPaymentSettledForReporting(booking.payment_status) &&
    isBookingStatusEligibleForPaidReporting(booking.status)
  ) {
    amountPaid = round2(Number(booking.total_price || 0));
  }

  let amountOutstanding = round2(pendingSum);
  if (snap && snap.monthsTotal > 0 && snap.monthlyRent > 0) {
    amountOutstanding = round2(
      pendingSum + snap.committedFutureIncomeGross
    );
  } else {
    const st = (booking.status || "").toLowerCase();
    const ps = (booking.payment_status || "").toLowerCase();
    if (
      charges.length === 0 &&
      st === "accepted_awaiting_payment" &&
      ps === "awaiting_payment"
    ) {
      amountOutstanding = round2(Number(booking.total_price || 0));
    }
  }

  let nextPaymentDate: string | null = null;
  let nextPaymentAmount: number | null = null;

  if (snap && snap.monthsTotal > 0 && snap.monthlyRent > 0) {
    if (snap.futureRentMonths > 0 && snap.nextPaymentDate) {
      nextPaymentDate = snap.nextPaymentDate;
      nextPaymentAmount = round2(snap.nextRentAmount);
    }
  } else {
    const st = (booking.status || "").toLowerCase();
    const ps = (booking.payment_status || "").toLowerCase();
    if (st === "accepted_awaiting_payment" && ps === "awaiting_payment") {
      nextPaymentAmount = round2(Number(booking.total_price || 0));
    }
  }

  return {
    amountPaid,
    amountOutstanding,
    nextPaymentDate,
    nextPaymentAmount,
  };
}

export type RenterBookingsPageMetrics = {
  totalSpent: number;
  activeBookingsCount: number;
  outstandingTotal: number;
  /** Soonest next payment among bookings that have a scheduled date. */
  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
  /** Largest checkout amount still awaiting payment (one-off / first payment). */
  checkoutDueAmount: number | null;
};

export function aggregateRenterPageMetrics(
  bookings: Array<{
    id: string;
    status: string | null;
    payment_status: string | null;
    booking_unit: string | null;
    total_price: number | null;
    monthly_rent?: number | null;
    months_total?: number | null;
    months_paid?: number | null;
    deposit_amount?: number | null;
    initial_payment_amount?: number | null;
    next_payment_date?: string | null;
  }>,
  chargesByBookingId: Record<string, BookingChargeLite[]>
): RenterBookingsPageMetrics {
  let totalSpent = 0;
  let activeBookingsCount = 0;
  let outstandingTotal = 0;
  let earliest: { t: number; date: string; amount: number } | null = null;
  let checkoutDueAmount: number | null = null;

  for (const b of bookings) {
    const st = (b.status || "").toLowerCase();
    if (st === "declined" || st === "expired") continue;

    const charges = chargesByBookingId[b.id] ?? [];
    const fin = computeRenterBookingFinance(
      {
        booking_unit: b.booking_unit,
        total_price: b.total_price,
        status: b.status,
        payment_status: b.payment_status,
        monthly_rent: b.monthly_rent,
        months_total: b.months_total,
        months_paid: b.months_paid,
        deposit_amount: b.deposit_amount,
        initial_payment_amount: b.initial_payment_amount,
        next_payment_date: b.next_payment_date,
      },
      charges
    );

    if (
      st === "pending_owner" ||
      st === "accepted_awaiting_payment" ||
      st === "paid_confirmed" ||
      st === "confirmed" ||
      st === "completed"
    ) {
      activeBookingsCount += 1;
    }

    if (
      isPaymentSettledForReporting(b.payment_status) ||
      st === "paid_confirmed" ||
      st === "confirmed" ||
      st === "completed"
    ) {
      totalSpent += fin.amountPaid;
    }

    outstandingTotal += fin.amountOutstanding;

    if (fin.nextPaymentDate && fin.nextPaymentAmount != null) {
      const t = new Date(fin.nextPaymentDate).getTime();
      if (!Number.isNaN(t) && (!earliest || t < earliest.t)) {
        earliest = {
          t,
          date: fin.nextPaymentDate,
          amount: fin.nextPaymentAmount,
        };
      }
    }

    const ps = (b.payment_status || "").toLowerCase();
    if (
      st === "accepted_awaiting_payment" &&
      ps === "awaiting_payment" &&
      fin.nextPaymentAmount != null &&
      fin.nextPaymentAmount > 0
    ) {
      checkoutDueAmount =
        checkoutDueAmount === null
          ? fin.nextPaymentAmount
          : Math.max(checkoutDueAmount, fin.nextPaymentAmount);
    }
  }

  return {
    totalSpent: round2(totalSpent),
    activeBookingsCount,
    outstandingTotal: round2(outstandingTotal),
    nextPaymentDate: earliest?.date ?? null,
    nextPaymentAmount: earliest ? round2(earliest.amount) : null,
    checkoutDueAmount:
      checkoutDueAmount !== null ? round2(checkoutDueAmount) : null,
  };
}
