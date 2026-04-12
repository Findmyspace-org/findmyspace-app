import { getDisplayName } from "@/lib/utils";

export type BookingChargeRow = {
  id: string;
  charge_type: string;
  description: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  amount: number | string | null;
  status: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  statement_month: string | null;
};

export type FinanceBookingInput = {
  id: string;
  space_id: string;
  total_price: number | null;
  platform_fee: number | null;
  owner_earnings: number | null;
  status: string | null;
  payment_status: string | null;
  created_at: string | null;
  renter: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  /** Present on admin queries; optional for owner-only views. */
  owner?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  space: { title: string | null } | null;
  booking_charges: BookingChargeRow[] | null;
};

export type FinanceLineItem = {
  id: string;
  bookingId: string;
  propertyTitle: string;
  ownerLabel: string;
  renterLabel: string;
  chargeType: string;
  billingPeriodLabel: string;
  gross: number;
  platformFee: number;
  netOwner: number;
  status: string;
  paidAt: string | null;
  paymentRef: string | null;
  isSynthetic: boolean;
};

export function formatChargePeriod(c: BookingChargeRow): string {
  if (c.billing_period_start && c.billing_period_end) {
    const a = new Date(c.billing_period_start).toLocaleDateString();
    const b = new Date(c.billing_period_end).toLocaleDateString();
    return `${a} – ${b}`;
  }
  if (c.billing_period_start) {
    return new Date(c.billing_period_start).toLocaleDateString();
  }
  return "—";
}

export function allocateFees(
  chargeAmount: number,
  bookingTotal: number,
  platformFee: number,
  ownerEarnings: number
) {
  const tp = bookingTotal > 0 ? bookingTotal : 0;
  if (tp <= 0) {
    return { platformAlloc: 0, netAlloc: 0 };
  }
  const share = chargeAmount / tp;
  return {
    platformAlloc: share * (platformFee || 0),
    netAlloc: share * (ownerEarnings || 0),
  };
}

/**
 * Flatten bookings + charges into finance line items (owner + renter labels).
 */
export function buildFinanceLineItems(bookings: FinanceBookingInput[]): FinanceLineItem[] {
  const rows: FinanceLineItem[] = [];

  for (const b of bookings) {
    const tp = Number(b.total_price || 0);
    const pf = Number(b.platform_fee || 0);
    const oe = Number(b.owner_earnings ?? 0);
    const charges = b.booking_charges || [];
    const propertyTitle = b.space?.title || "Listing";
    const renterLabel = getDisplayName(b.renter);
    const ownerLabel = getDisplayName(b.owner ?? null);

    if (charges.length > 0) {
      for (const c of charges) {
        const gross = Number(c.amount || 0);
        const { platformAlloc, netAlloc } = allocateFees(gross, tp, pf, oe);
        rows.push({
          id: c.id,
          bookingId: b.id,
          propertyTitle,
          ownerLabel,
          renterLabel,
          chargeType: c.charge_type,
          billingPeriodLabel: formatChargePeriod(c),
          gross,
          platformFee: platformAlloc,
          netOwner: netAlloc,
          status: c.status || "pending",
          paidAt: c.paid_at,
          paymentRef: c.payment_reference,
          isSynthetic: false,
        });
      }
    } else if (
      b.status === "paid_confirmed" &&
      (b.payment_status === "paid" || b.payment_status === "paid_confirmed") &&
      tp > 0
    ) {
      rows.push({
        id: `legacy-${b.id}`,
        bookingId: b.id,
        propertyTitle,
        ownerLabel,
        renterLabel,
        chargeType: "booking_total",
        billingPeriodLabel: "—",
        gross: tp,
        platformFee: pf,
        netOwner: oe,
        status: "paid",
        paidAt: null,
        paymentRef: null,
        isSynthetic: true,
      });
    }
  }

  return rows;
}

export function monthKeyFromPaidAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromKey(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}
