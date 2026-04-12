/**
 * Shared invoice / booking charge helpers (client-safe).
 */

export function generateInvoiceNumber(bookingId: string): string {
  const compact = bookingId.replace(/-/g, "").slice(0, 12).toUpperCase();
  return `FMS-${compact}`;
}

function addOneMonthIso(iso: string): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export type InitialBookingChargeRow = {
  booking_id: string;
  charge_type: string;
  description: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  amount: number;
  currency: string;
  status: string;
};

/**
 * Line items for a new booking request. PayFast / sync-paid marks them paid together.
 */
export function buildInitialBookingCharges(opts: {
  bookingId: string;
  bookingUnit: string;
  totalPrice: number;
  monthlyRent?: number;
  depositAmount?: number;
  startAt: string;
  endAt: string;
}): InitialBookingChargeRow[] {
  const {
    bookingId,
    bookingUnit,
    totalPrice,
    monthlyRent = 0,
    depositAmount = 0,
    startAt,
    endAt,
  } = opts;

  const base = {
    booking_id: bookingId,
    currency: "ZAR",
    status: "pending",
  };

  if (bookingUnit === "month") {
    const rows: InitialBookingChargeRow[] = [
      {
        ...base,
        charge_type: "first_month_rent",
        description: "First month rent",
        billing_period_start: startAt,
        billing_period_end: addOneMonthIso(startAt),
        amount: Number(Number(monthlyRent).toFixed(2)),
      },
    ];

    if (depositAmount > 0) {
      rows.push({
        ...base,
        charge_type: "deposit",
        description: "Security deposit",
        billing_period_start: startAt,
        billing_period_end: null,
        amount: Number(Number(depositAmount).toFixed(2)),
      });
    }

    return rows;
  }

  return [
    {
      ...base,
      charge_type: "booking_total",
      description: "Booking total",
      billing_period_start: startAt,
      billing_period_end: endAt,
      amount: Number(Number(totalPrice).toFixed(2)),
    },
  ];
}
