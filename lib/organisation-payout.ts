import {
  resolveOrganisationPayoutReadiness,
  type OrganisationPayoutReadiness,
} from "@/lib/access/organisation-payout-readiness";
import type { MaskedOrganisationBankDto } from "@/lib/organisation-commercial-dto";
import { isInvoiceEligibleBooking } from "@/lib/finance-status";

export const ORGANISATION_PAYOUT_AUDIT = {
  recorded: "organisation.payout.recorded",
} as const;

export const ORGANISATION_PAYOUT_CURRENCY = "ZAR";

const FORBIDDEN_PAYOUT_WRITE_KEYS = [
  "amount_gross",
  "amount_platform_fee",
  "amount_net",
  "platform_fee",
  "owner_earnings",
  "total_price",
  "bank_account_id",
  "organisation_id",
  "commercial_beneficiary_type",
  "commercial_beneficiary_organisation_id",
  "commercial_beneficiary_user_id",
  "created_by",
  "paid_by",
  "actor_id",
  "user_id",
  "owner_id",
  "status",
  "currency",
] as const;

export type OrganisationPayoutEligibleBooking = {
  id: string;
  space_id: string | null;
  space_title: string | null;
  renter_label: string | null;
  status: string | null;
  payment_status: string | null;
  payout_status: string | null;
  total_price: number;
  platform_fee: number;
  owner_earnings: number;
  paid_at: string | null;
  created_at: string | null;
};

export type OrganisationPayoutHistoryRow = {
  id: string;
  organisation_id: string;
  bank_account_id: string;
  bank_version_number: number | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number_last4: string | null;
  account_number_display: string;
  status: "paid";
  currency: string;
  amount_gross: number;
  amount_platform_fee: number;
  amount_net: number;
  reference: string;
  notes: string | null;
  paid_at: string;
  paid_by: string | null;
  booking_count: number;
};

export type RecordOrganisationPayoutInput = {
  bookingIds: string[];
  reference: string;
  paidAt: string | null;
  notes: string | null;
};

export type OrganisationPayoutMoneyTotals = {
  gross: number;
  fee: number;
  net: number;
  count: number;
};

export type OrganisationPayoutBundle = {
  organisation: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
  };
  payout_readiness: OrganisationPayoutReadiness;
  current_bank: MaskedOrganisationBankDto | null;
  eligible: OrganisationPayoutEligibleBooking[];
  history: OrganisationPayoutHistoryRow[];
  totals: {
    awaiting: OrganisationPayoutMoneyTotals;
    paid_out: OrganisationPayoutMoneyTotals;
  };
  can_record?: boolean;
};

export function roundPayoutMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

export function payoutMoneyEquals(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
}

export function isOrganisationPayoutBeneficiary(booking: {
  commercial_beneficiary_type?: string | null;
  commercial_beneficiary_organisation_id?: string | null;
}, organisationId: string): boolean {
  return (
    booking.commercial_beneficiary_type === "organisation" &&
    booking.commercial_beneficiary_organisation_id === organisationId
  );
}

export function isOrganisationBookingPayoutEligible(input: {
  organisationId: string;
  booking: {
    id: string;
    commercial_beneficiary_type?: string | null;
    commercial_beneficiary_organisation_id?: string | null;
    status: string | null;
    payment_status: string | null;
    payout_status?: string | null;
    payout_paid_at?: string | null;
    total_price: number | null;
    platform_fee: number | null;
    owner_earnings: number | null;
  };
  pendingChargeCount: number;
  paidChargeCount: number;
  alreadyInPayout: boolean;
}): boolean {
  const booking = input.booking;
  if (!isOrganisationPayoutBeneficiary(booking, input.organisationId)) return false;
  if (!isInvoiceEligibleBooking(booking.status, booking.payment_status)) return false;
  if ((booking.payout_status || "unpaid_to_owner") === "paid") return false;
  if (booking.payout_paid_at) return false;
  if (input.alreadyInPayout) return false;
  if (input.pendingChargeCount > 0) return false;
  if (input.paidChargeCount === 0 && input.pendingChargeCount === 0) {
    // legacy paid booking with no charge rows — still eligible
  } else if (input.paidChargeCount < 1) {
    return false;
  }

  const gross = roundPayoutMoney(booking.total_price);
  const fee = roundPayoutMoney(booking.platform_fee);
  const net = roundPayoutMoney(booking.owner_earnings);
  if (gross == null || fee == null || net == null) return false;
  if (gross <= 0 || fee < 0 || net < 0) return false;
  return payoutMoneyEquals(gross, fee + net);
}

export function sumOrganisationPayoutItems(
  items: Array<{ gross: number; fee: number; net: number }>
): { gross: number; fee: number; net: number } {
  const gross = Number(items.reduce((sum, item) => sum + item.gross, 0).toFixed(2));
  const fee = Number(items.reduce((sum, item) => sum + item.fee, 0).toFixed(2));
  const net = Number(items.reduce((sum, item) => sum + item.net, 0).toFixed(2));
  return { gross, fee, net };
}

export function stripForbiddenOrganisationPayoutWriteKeys(
  body: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...body };
  for (const key of FORBIDDEN_PAYOUT_WRITE_KEYS) {
    delete next[key];
  }
  return next;
}

export function parseRecordOrganisationPayoutBody(
  body: Record<string, unknown>
): { ok: true; input: RecordOrganisationPayoutInput } | { ok: false; error: string } {
  const rawIds = Array.isArray(body.booking_ids) ? body.booking_ids : [];
  const bookingIds = Array.from(
    new Set(
      rawIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
        .map((id) => id.trim())
    )
  );
  if (bookingIds.length === 0) {
    return { ok: false, error: "Select at least one eligible booking." };
  }

  const reference =
    typeof body.reference === "string" ? body.reference.trim() : "";
  if (reference.length < 2 || reference.length > 80) {
    return {
      ok: false,
      error: "Enter the EFT/payment reference (2–80 characters).",
    };
  }

  let paidAt: string | null = null;
  if (typeof body.paid_at === "string" && body.paid_at.trim()) {
    const parsed = new Date(body.paid_at.trim());
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Paid date is invalid." };
    }
    const now = Date.now();
    if (parsed.getTime() > now + 60 * 60 * 1000) {
      return { ok: false, error: "Paid date cannot be in the future." };
    }
    if (parsed.getTime() < now - 30 * 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        error: "Paid date cannot be more than 30 days in the past.",
      };
    }
    paidAt = parsed.toISOString();
  }

  let notes: string | null = null;
  if (typeof body.notes === "string") {
    const trimmed = body.notes.trim();
    if (trimmed.length > 500) {
      return { ok: false, error: "Notes must be 500 characters or fewer." };
    }
    notes = trimmed || null;
  }

  return { ok: true, input: { bookingIds, reference, paidAt, notes } };
}

export function organisationPayoutCanRecord(input: {
  organisationStatus: string | null;
  organisationArchivedAt?: string | null;
  verificationStatus: string | null;
  currentBankStatus: string | null;
}): boolean {
  return resolveOrganisationPayoutReadiness(input).ready;
}

export function formatPayoutMoney(n: number): string {
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function hasForbiddenOrganisationPayoutWriteKeys(
  body: Record<string, unknown>
): boolean {
  return FORBIDDEN_PAYOUT_WRITE_KEYS.some((key) => key in body);
}

export function canShowOrganisationPayoutLedger(input: {
  showOrganisationCommercial: boolean;
  organisationId?: string | null;
}): boolean {
  return Boolean(input.showOrganisationCommercial && input.organisationId);
}

export function summariseOrganisationPayoutLedger(input: {
  eligible: Array<{
    total_price: number;
    platform_fee: number;
    owner_earnings: number;
  }>;
  history: Array<{
    amount_gross: number;
    amount_platform_fee: number;
    amount_net: number;
  }>;
}): {
  awaiting: OrganisationPayoutMoneyTotals;
  paid_out: OrganisationPayoutMoneyTotals;
} {
  const awaitingItems = sumOrganisationPayoutItems(
    input.eligible.map((row) => ({
      gross: row.total_price,
      fee: row.platform_fee,
      net: row.owner_earnings,
    }))
  );
  const paidItems = sumOrganisationPayoutItems(
    input.history.map((row) => ({
      gross: row.amount_gross,
      fee: row.amount_platform_fee,
      net: row.amount_net,
    }))
  );
  return {
    awaiting: {
      ...awaitingItems,
      count: input.eligible.length,
    },
    paid_out: {
      ...paidItems,
      count: input.history.length,
    },
  };
}

export function payoutHistoryExposesFullAccountNumber(
  row: Record<string, unknown>
): boolean {
  const raw = row.account_number;
  if (typeof raw !== "string") return false;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6;
}
