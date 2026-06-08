"use client";

import { X } from "lucide-react";
import { ListingEnquiryForm } from "@/app/components/ListingEnquiryForm";

type UnclaimedListingMobileSheetProps = {
  listingId: string;
  listingTitle: string;
};

export function UnclaimedListingMobileSheet({
  listingId,
  listingTitle,
}: UnclaimedListingMobileSheetProps) {
  return (
    <>
      <input id="space-enquiry-toggle" type="checkbox" className="peer sr-only" />

      <label
        htmlFor="space-enquiry-toggle"
        className="fixed bottom-4 left-1/2 z-30 flex w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2 cursor-pointer items-center justify-center rounded-xl bg-[#0f2740] px-7 py-3.5 text-sm font-semibold text-white shadow-lg ring-1 ring-black/10 hover:opacity-95 lg:hidden"
      >
        Request this space
      </label>

      <div className="pointer-events-none fixed inset-0 z-30 bg-black/20 opacity-0 transition peer-checked:pointer-events-auto peer-checked:opacity-100 lg:hidden">
        <label
          htmlFor="space-enquiry-toggle"
          className="absolute inset-0 cursor-pointer"
          aria-label="Close request panel"
        />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[85vh] w-full max-w-7xl translate-y-full overflow-hidden rounded-t-2xl border border-gray-200 bg-[#f4f6f8] shadow-2xl ring-1 ring-black/5 transition peer-checked:pointer-events-auto peer-checked:translate-y-0 lg:hidden">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <div className="min-w-0 pr-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              Request this space
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-[#192a3a]">
              {listingTitle}
            </h2>
          </div>

          <label
            htmlFor="space-enquiry-toggle"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
            aria-label="Close request panel"
          >
            <X className="h-4 w-4" />
          </label>
        </div>

        <div className="max-h-[calc(85vh-74px)] overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <ListingEnquiryForm listingId={listingId} listingTitle={listingTitle} />
          </div>
        </div>
      </div>
    </>
  );
}
