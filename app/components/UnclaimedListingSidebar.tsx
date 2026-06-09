"use client";

import { ListingEnquiryForm } from "@/app/components/ListingEnquiryForm";
import { UnclaimedListingClaimSection } from "@/app/components/UnclaimedListingClaimSection";
import { UnclaimedListingEnquirySocialProof } from "@/app/components/UnclaimedListingEnquirySocialProof";
import { UnclaimedListingPricingSection } from "@/app/components/UnclaimedListingPricingSection";
import { UNCLAIMED_REQUEST_INTRO } from "@/lib/listing-lifecycle";

type UnclaimedListingSidebarProps = {
  listingId: string;
  listingTitle: string;
  enquiryCount?: number;
};

export function UnclaimedListingSidebar({
  listingId,
  listingTitle,
  enquiryCount = 0,
}: UnclaimedListingSidebarProps) {
  return (
    <aside className="hidden space-y-4 lg:block lg:sticky lg:top-24">
      <UnclaimedListingPricingSection />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-[#192a3a]">Request this space</h3>
        <p className="mt-1 text-sm text-gray-600">{UNCLAIMED_REQUEST_INTRO}</p>
        {enquiryCount > 0 ? (
          <div className="mt-3">
            <UnclaimedListingEnquirySocialProof count={enquiryCount} />
          </div>
        ) : null}
        <div className="mt-4">
          <ListingEnquiryForm listingId={listingId} listingTitle={listingTitle} />
        </div>
      </section>

      <UnclaimedListingClaimSection
        listingId={listingId}
        listingTitle={listingTitle}
      />
    </aside>
  );
}
