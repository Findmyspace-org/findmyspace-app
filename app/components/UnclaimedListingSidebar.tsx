"use client";

import { ListingEnquiryForm } from "@/app/components/ListingEnquiryForm";
import { UNCLAIMED_PRICING_LABEL } from "@/lib/listing-lifecycle";

type UnclaimedListingSidebarProps = {
  listingId: string;
  listingTitle: string;
};

export function UnclaimedListingSidebar({
  listingId,
  listingTitle,
}: UnclaimedListingSidebarProps) {
  return (
    <aside className="hidden space-y-4 lg:block lg:sticky lg:top-24">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.10)]">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
          Pricing
        </p>
        <p className="mt-2 text-2xl font-semibold text-[#192a3a]">
          {UNCLAIMED_PRICING_LABEL}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Rates will be confirmed once the space owner completes verification.
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-[#192a3a]">Request this space</h3>
        <p className="mt-1 text-sm text-gray-600">
          Tell us what you need and FindMySpace will confirm availability.
        </p>
        <div className="mt-4">
          <ListingEnquiryForm listingId={listingId} listingTitle={listingTitle} />
        </div>
      </section>
    </aside>
  );
}
