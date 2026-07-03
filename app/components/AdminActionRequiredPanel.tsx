"use client";

import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Inbox,
  Landmark,
  Link2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { formatOldestWaiting } from "@/lib/days-waiting";

export type AdminActionQueue = {
  newListingEnquiries: number;
  newClaimInterests: number;
  pendingListingReviews: number;
  pendingIdentityVerification: number;
  pendingBankVerification: number;
  pendingBookingPayments: number;
  oldestListingReviewDays?: number | null;
  oldestListingEnquiryDays?: number | null;
  oldestClaimInterestDays?: number | null;
  oldestIdentityVerificationDays?: number | null;
  oldestBankVerificationDays?: number | null;
  oldestVerificationDays?: number | null;
};

type ActionCard = {
  key: string;
  count: number;
  label: string;
  helper: string;
  href: string;
  cta: string;
  icon: typeof Inbox;
  oldestWaitingDays?: number | null;
};

export function AdminActionRequiredPanel({ queue }: { queue: AdminActionQueue }) {
  const cards: ActionCard[] = [
    {
      key: "enquiries",
      count: queue.newListingEnquiries,
      label: "New listing enquiries",
      helper: "Unclaimed space requests waiting for a response.",
      href: "/admin/listing-enquiries?status=new",
      cta: "Review enquiries",
      icon: Inbox,
      oldestWaitingDays: queue.oldestListingEnquiryDays,
    },
    {
      key: "claims",
      count: queue.newClaimInterests,
      label: "New claim interests",
      helper: "Owners or managers who want to claim a listing.",
      href: "/admin/listing-claim-interests?status=new",
      cta: "Review claims",
      icon: Link2,
      oldestWaitingDays: queue.oldestClaimInterestDays,
    },
    {
      key: "reviews",
      count: queue.pendingListingReviews,
      label: "Listing reviews pending",
      helper: "Owner-submitted listings awaiting admin review.",
      href: "/admin/listing-reviews",
      cta: "Open review queue",
      icon: ClipboardList,
      oldestWaitingDays: queue.oldestListingReviewDays,
    },
    {
      key: "identity",
      count: queue.pendingIdentityVerification,
      label: "Identity verification",
      helper: "Hosts with ID documents waiting for review.",
      href: "/admin/verification",
      cta: "Review verification",
      icon: ShieldCheck,
      oldestWaitingDays:
        queue.oldestIdentityVerificationDays ?? queue.oldestVerificationDays,
    },
    {
      key: "bank",
      count: queue.pendingBankVerification,
      label: "Bank verification",
      helper: "Hosts with bank details waiting for review.",
      href: "/admin/verification",
      cta: "Review bank details",
      icon: Landmark,
      oldestWaitingDays:
        queue.oldestBankVerificationDays ?? queue.oldestVerificationDays,
    },
  ];

  if (queue.pendingBookingPayments > 0) {
    cards.push({
      key: "bookings",
      count: queue.pendingBookingPayments,
      label: "Booking requests",
      helper: "Bookings waiting for host or payment action.",
      href: "/admin/bookings",
      cta: "Review bookings",
      icon: Wallet,
    });
  }

  const total = cards.reduce((sum, card) => sum + card.count, 0);

  return (
    <section className="mb-6 rounded-xl border border-[#192a3a]/15 bg-[#f8fafc] p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[#192a3a]">Action required</h2>
          <p className="mt-1 text-sm text-gray-600">
            Items that need your attention now — not historical totals.
          </p>
        </div>
        {total === 0 ? (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
            All caught up
          </span>
        ) : (
          <span className="rounded-full bg-[#192a3a] px-3 py-1 text-xs font-semibold text-white">
            {total} waiting
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-600">
          No urgent admin queues right now. Scout stats and user records are below.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            if (card.count === 0) return null;
            const Icon = card.icon;
            const oldestLabel = formatOldestWaiting(card.oldestWaitingDays);
            return (
              <div
                key={card.key}
                className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#192a3a]/10 text-[#192a3a]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-semibold text-[#192a3a]">{card.count}</p>
                    <p className="font-medium text-gray-900">{card.label}</p>
                    <p className="mt-1 text-xs text-gray-600">{card.helper}</p>
                    {oldestLabel ? (
                      <p className="mt-2 text-xs font-medium text-amber-800">
                        {oldestLabel}
                      </p>
                    ) : null}
                  </div>
                </div>
                <Link
                  href={card.href}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-[#192a3a] px-3 py-2 text-sm font-semibold text-white hover:bg-[#243a4f]"
                >
                  {card.cta}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {total > 0 ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          <Building2 className="h-3.5 w-3.5" />
          Acquisition pipeline stats are below — they show totals, not just new items.
        </p>
      ) : null}
    </section>
  );
}
