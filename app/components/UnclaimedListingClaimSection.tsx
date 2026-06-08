"use client";

import { ListingClaimInterestForm } from "@/app/components/ListingClaimInterestForm";

type UnclaimedListingClaimSectionProps = {
  listingId: string;
  listingTitle: string;
  previewOnly?: boolean;
};

export function UnclaimedListingClaimSection({
  listingId,
  listingTitle,
  previewOnly = false,
}: UnclaimedListingClaimSectionProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#192a3a]">Own or manage this space?</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        Verify your ownership to take control of this listing. Once verified, you can
        update photos and details, set pricing, respond to enquiries, and start accepting
        bookings on FindMySpace.
      </p>
      {previewOnly ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          Claim interest form (preview only — disabled in admin preview)
        </div>
      ) : (
        <ListingClaimInterestForm listingId={listingId} listingTitle={listingTitle} />
      )}
    </section>
  );
}
