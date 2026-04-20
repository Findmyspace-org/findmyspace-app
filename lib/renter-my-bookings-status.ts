/**
 * Single source of truth for My Bookings (renter) list rows:
 * labels, lifecycle, primary action kind, and badge styling.
 *
 * Backend `bookings.status` values observed in this codebase:
 * pending_owner, pending, accepted_awaiting_payment, paid_confirmed,
 * confirmed, completed, declined, expired, approved
 *
 * Payment-related behavior for checkout uses `isAwaitingGatewayPayment`
 * (accepted_awaiting_payment + payment_status awaiting_payment).
 *
 * Optional future/legacy statuses are handled with safe fallbacks.
 */

import { isAwaitingGatewayPayment } from "@/lib/finance-status";

export type RenterBookingLifecyclePhase = "waiting" | "open" | "active" | "closed";

/** What the card renders as the single primary control (expand chevron is separate). */
export type RenterMyBookingsPrimaryKind =
  | "none"
  | "pay_now"
  | "retry_payment"
  | "view_booking"
  | "book_again"
  | "continue_booking"
  | "view_details";

export type ResolvedRenterMyBookingsUi = {
  /** Status chip */
  label: string;
  /** Optional short hint (e.g. tooltips); keep sparse */
  helperText?: string;
  lifecycle: RenterBookingLifecyclePhase;
  primary: {
    kind: RenterMyBookingsPrimaryKind;
    /** Copy for the one primary button/link, or the non-clickable waiting control */
    actionLabel: string;
  };
  badgeClassName: string;
};

const BADGE = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-900",
  blue: "bg-blue-100 text-blue-800",
  red: "bg-red-100 text-red-800",
  gray: "bg-gray-200 text-gray-700",
  neutral: "bg-gray-100 text-gray-800",
} as const;

/** Documented backend booking.status strings used across the app (not exhaustive of DB enum). */
export const KNOWN_BOOKING_STATUSES_IN_CODEBASE = [
  "pending_owner",
  "pending",
  "accepted_awaiting_payment",
  "paid_confirmed",
  "confirmed",
  "completed",
  "declined",
  "expired",
  "approved",
] as const;

type BookingLike = {
  status: string | null;
  payment_status: string | null;
};

/**
 * Resolve label, lifecycle, primary action, and badge for one renter booking row.
 */
export function resolveRenterMyBookingsUi(booking: BookingLike): ResolvedRenterMyBookingsUi {
  if (isAwaitingGatewayPayment(booking)) {
    return {
      label: "Awaiting payment",
      lifecycle: "open",
      primary: { kind: "pay_now", actionLabel: "Pay now" },
      badgeClassName: BADGE.amber,
    };
  }

  const st = (booking.status || "").trim();

  if (st === "accepted_awaiting_payment") {
    return {
      label: "Awaiting payment",
      lifecycle: "open",
      primary: {
        kind: "retry_payment",
        actionLabel: "Retry payment",
      },
      badgeClassName: BADGE.amber,
    };
  }

  if (st === "pending_owner" || st === "pending") {
    return {
      label: "Awaiting host",
      lifecycle: "waiting",
      primary: { kind: "none", actionLabel: "Waiting for approval" },
      badgeClassName: BADGE.blue,
    };
  }

  if (st === "paid_confirmed") {
    return {
      label: "Paid",
      lifecycle: "active",
      primary: { kind: "view_booking", actionLabel: "View booking" },
      badgeClassName: BADGE.green,
    };
  }

  if (st === "confirmed") {
    return {
      label: "Confirmed",
      lifecycle: "active",
      primary: { kind: "view_booking", actionLabel: "View booking" },
      badgeClassName: BADGE.green,
    };
  }

  if (st === "completed") {
    return {
      label: "Completed",
      lifecycle: "closed",
      primary: { kind: "book_again", actionLabel: "Book again" },
      badgeClassName: BADGE.green,
    };
  }

  if (st === "expired") {
    return {
      label: "Expired",
      lifecycle: "closed",
      primary: { kind: "book_again", actionLabel: "Book again" },
      badgeClassName: BADGE.gray,
    };
  }

  if (st === "declined") {
    return {
      label: "Declined",
      lifecycle: "closed",
      primary: { kind: "book_again", actionLabel: "Book again" },
      badgeClassName: BADGE.red,
    };
  }

  if (st === "approved") {
    return {
      label: "Approved",
      lifecycle: "active",
      primary: { kind: "view_booking", actionLabel: "View booking" },
      badgeClassName: BADGE.green,
    };
  }

  const extended: Record<
    string,
    Pick<ResolvedRenterMyBookingsUi, "label" | "lifecycle" | "primary" | "badgeClassName">
  > = {
    cancelled: {
      label: "Cancelled",
      lifecycle: "closed",
      primary: { kind: "book_again", actionLabel: "Book again" },
      badgeClassName: BADGE.gray,
    },
    cancelled_by_user: {
      label: "Cancelled",
      lifecycle: "closed",
      primary: { kind: "book_again", actionLabel: "Book again" },
      badgeClassName: BADGE.gray,
    },
    cancelled_by_owner: {
      label: "Cancelled by owner",
      lifecycle: "closed",
      primary: { kind: "book_again", actionLabel: "Book again" },
      badgeClassName: BADGE.gray,
    },
    refunded: {
      label: "Refunded",
      lifecycle: "closed",
      primary: { kind: "view_details", actionLabel: "View details" },
      badgeClassName: BADGE.neutral,
    },
    draft: {
      label: "Incomplete booking",
      lifecycle: "open",
      primary: { kind: "continue_booking", actionLabel: "Continue booking" },
      badgeClassName: BADGE.neutral,
    },
    failed_payment: {
      label: "Payment failed",
      lifecycle: "open",
      primary: { kind: "retry_payment", actionLabel: "Retry payment" },
      badgeClassName: BADGE.amber,
    },
  };

  const hit = extended[st];
  if (hit) {
    return { ...hit };
  }

  const pretty = st
    ? st.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "In progress";

  return {
    label: pretty,
    lifecycle: "open",
    primary: { kind: "view_details", actionLabel: "View details" },
    badgeClassName: BADGE.neutral,
  };
}
