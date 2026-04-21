"use client";

import Link from "next/link";
import Image from "next/image";
import {
  MapPin,
  Tag,
  CalendarDays,
  Wallet,
  ArrowRight,
} from "lucide-react";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import type { CardAvailabilityHint } from "@/lib/browse-availability-signals";

type Space = {
  id: string;
  title: string;
  description?: string | null;
  city: string | null;
  suburb: string | null;
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
};

export default function SpaceCard({ space, availabilityHint }: Props) {
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

  function getPriceLabel() {
    const price = getPriceValue();
    return price ? `R${price}` : "Price not set";
  }

  function getShortDescription() {
    if (!space.description) return "No description added yet.";
    if (space.description.length <= 140) return space.description;
    return `${space.description.slice(0, 140)}...`;
  }

  function formatSpaceType(value?: string | null) {
    return formatSpaceTypeLabel(value);
  }

  function formatBookingUnit(value?: string | null) {
    if (value === "hour") return "By hour";
    if (value === "month") return "By month";
    return "By day";
  }

  const coverImage = space.image_urls?.[0] || null;
  const photoCount = space.image_urls?.length || 0;
  const locationLine =
    [space.address_line_1, space.suburb, space.city].filter(Boolean).join(", ") ||
    "Address not set";

  return (
    <Link
      href={`/spaces/${space.id}`}
      className="block overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="grid md:grid-cols-[380px_1fr]">
        <div className="relative min-h-[260px] bg-gray-100">
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
              No image yet
            </div>
          )}

          {photoCount > 1 && (
            <div className="absolute left-4 top-4">
              <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-800 shadow-sm">
                {photoCount} photos
              </span>
            </div>
          )}
        </div>

        <div className="flex min-h-[260px] flex-col justify-between p-6">
          <div>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold leading-tight text-[#192a3a]">
                  {space.title}
                </h2>

                <div className="mt-3 flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  <p>{locationLine}</p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Wallet className="h-4 w-4 text-gray-500" />
                  <p className="text-2xl font-semibold leading-none text-[#192a3a]">
                    {getPriceLabel()}
                  </p>
                </div>
                <p className="mt-1 text-sm text-gray-500">{getPriceSuffix()}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-[#f8fafb] px-3 py-1 text-xs font-medium text-gray-700">
                <Tag className="h-3.5 w-3.5 text-gray-500" />
                {formatSpaceType(space.space_type)}
              </span>

              <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-[#f8fafb] px-3 py-1 text-xs font-medium text-gray-700">
                <CalendarDays className="h-3.5 w-3.5 text-gray-500" />
                {formatBookingUnit(space.booking_unit)}
              </span>

              {availabilityHint ? (
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {availabilityHint.text}
                </span>
              ) : null}
            </div>

            <p className="text-sm leading-7 text-gray-700">
              {getShortDescription()}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="text-sm text-gray-500">
              View details and request booking
            </span>

            <span className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-[#192a3a]">
              Open listing
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}