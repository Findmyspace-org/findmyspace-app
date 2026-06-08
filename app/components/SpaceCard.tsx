"use client";

import Image from "next/image";
import {
  Heart,
  MapPin,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import type { CardAvailabilityHint } from "@/lib/browse-availability-signals";
import {
  isUnclaimedListing,
  UNCLAIMED_PRICING_LABEL,
} from "@/lib/listing-lifecycle";

type Space = {
  id: string;
  title: string;
  description?: string | null;
  city: string | null;
  suburb: string | null;
  street_address?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  image_urls?: string[];
  status?: string | null;
};

type Props = {
  space: Space;
  availabilityHint?: CardAvailabilityHint | null;
  isFavourite?: boolean;
  favouriteBusy?: boolean;
  onToggleFavourite?: (spaceId: string) => void;
};

export default function SpaceCard({
  space,
  availabilityHint,
  isFavourite = false,
  favouriteBusy = false,
  onToggleFavourite,
}: Props) {
  const router = useRouter();

  function getPriceValue() {
    if (space.booking_unit === "hour") return space.price_per_hour;
    if (space.booking_unit === "month") return space.price_per_month;
    return space.price_per_day;
  }

  function getPriceSuffix() {
    if (space.booking_unit === "hour") return "/ hour";
    if (space.booking_unit === "month") return "/ month";
    return "/ day";
  }

  const isUnclaimed = isUnclaimedListing(space.status);

  function getPriceLabel() {
    if (isUnclaimed) return UNCLAIMED_PRICING_LABEL;
    const price = getPriceValue();
    return price ? `R${price}` : "Price not set";
  }

  function formatSpaceType(value?: string | null) {
    return formatSpaceTypeLabel(value);
  }

  const coverImage = space.image_urls?.[0] || null;
  const locationLine = [space.suburb, space.city].filter(Boolean).join(", ") || "Location to be confirmed";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/spaces/${space.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(`/spaces/${space.id}`);
        }
      }}
      aria-label={`View listing: ${space.title}`}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_6px_24px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192a3a]/35 focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[16/10] bg-[#f4f5f7]">
        <button
          type="button"
          disabled={favouriteBusy}
          aria-label={isFavourite ? "Remove from favourites" : "Save to favourites"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavourite?.(space.id);
          }}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#334155] shadow-[0_8px_18px_rgba(15,23,42,0.18)] transition hover:bg-white disabled:opacity-70"
        >
          <Heart
            className={`h-4.5 w-4.5 ${isFavourite ? "fill-[#c1121f] text-[#c1121f]" : "text-[#334155]"}`}
          />
        </button>

        {coverImage ? (
          <Image
            src={coverImage}
            alt={space.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No image available
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748b]">
          <MapPin className="h-3.5 w-3.5" />
          {formatSpaceType(space.space_type)} · {locationLine}
        </p>

        <h3 className="mt-2 line-clamp-2 text-[17px] font-semibold leading-snug text-[#0f172a]">
          {space.title}
        </h3>

        {isUnclaimed ? (
          <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
            Availability to be confirmed
          </p>
        ) : null}

        <p className="mt-3 text-base font-semibold text-[#0f172a]">
          {getPriceLabel()}{" "}
          {!isUnclaimed ? (
            <span className="font-normal text-[#475569]">{getPriceSuffix()}</span>
          ) : null}
        </p>

        {availabilityHint ? (
          <p className="mt-2 text-xs text-slate-600">{availabilityHint.text}</p>
        ) : null}

        {/* TODO: Add rating/review summary once reviews are live. */}
      </div>
    </article>
  );
}