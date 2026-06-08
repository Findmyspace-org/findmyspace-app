"use client";

import Image from "next/image";
import { MapPin } from "lucide-react";
import SpaceAttributesDisplay from "@/app/components/SpaceAttributesDisplay";
import { UnclaimedListingClaimSection } from "@/app/components/UnclaimedListingClaimSection";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import { formatListingAddress } from "@/lib/za-provinces";
import {
  UNCLAIMED_LISTING_BADGE,
  UNCLAIMED_PRICING_LABEL,
  UNCLAIMED_REQUEST_INTRO,
} from "@/lib/listing-lifecycle";

export type AdminUnclaimedPreviewData = {
  id: string;
  title: string;
  description: string | null;
  space_type: string | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  image_urls: string[];
  attributes: Record<string, string[]>;
  isDraftPreview?: boolean;
};

export function AdminUnclaimedListingPreview({
  listing,
}: {
  listing: AdminUnclaimedPreviewData;
}) {
  const address = formatListingAddress({
    street_address: listing.street_address,
    suburb: listing.suburb,
    city: listing.city,
    province: listing.province,
    postal_code: listing.postal_code,
    country: listing.country,
    address_line_1: listing.street_address,
  });

  const cover = listing.image_urls[0] ?? null;
  const extras = listing.image_urls.slice(1, 5);

  return (
    <div className="mx-auto max-w-7xl">
      {listing.isDraftPreview ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>Admin preview only.</strong> Draft listings are not visible publicly.
          Publish as unclaimed to show this page at{" "}
          <code className="text-xs">/spaces/{listing.id}</code>.
        </p>
      ) : null}

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="inline-flex rounded-full bg-[#eef2f6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#334155]">
                {formatSpaceTypeLabel(listing.space_type)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {[listing.suburb, listing.city].filter(Boolean).join(", ") || address}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#192a3a] md:text-4xl">
              {listing.title || "Untitled listing"}
            </h1>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-950">
              {UNCLAIMED_LISTING_BADGE}
            </p>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {cover ? (
              <div className="relative aspect-[16/9] bg-gray-100">
                <Image
                  src={cover}
                  alt=""
                  fill
                  className="object-cover"
                  unoptimized
                  priority
                />
              </div>
            ) : (
              <div className="flex aspect-[16/9] items-center justify-center bg-gray-100 text-sm text-gray-500">
                No photos yet
              </div>
            )}
            {extras.length > 0 ? (
              <div className="grid grid-cols-2 gap-1 border-t border-gray-200 p-1 sm:grid-cols-4">
                {extras.map((url) => (
                  <div key={url} className="relative aspect-[4/3] bg-gray-100">
                    <Image src={url} alt="" fill className="object-cover" unoptimized />
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-[#192a3a]">About this space</h2>
            <p className="mt-3 text-base leading-relaxed text-gray-700">
              {listing.description || "No description added yet."}
            </p>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="mb-3 text-lg font-semibold text-[#192a3a] sm:text-xl">
              Features &amp; amenities
            </h2>
            <SpaceAttributesDisplay
              spaceType={listing.space_type}
              attributes={listing.attributes}
            />
          </section>

          <div className="lg:hidden">
            <UnclaimedListingClaimSection
              listingId={listing.id}
              listingTitle={listing.title || "Untitled listing"}
              previewOnly
            />
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
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
            <p className="mt-1 text-sm text-gray-600">{UNCLAIMED_REQUEST_INTRO}</p>
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
              Request form (preview only — no contact fields shown to visitors)
            </div>
          </section>

          <UnclaimedListingClaimSection
            listingId={listing.id}
            listingTitle={listing.title || "Untitled listing"}
            previewOnly
          />
        </aside>
      </div>
    </div>
  );
}
