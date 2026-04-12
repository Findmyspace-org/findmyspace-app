import Image from "next/image";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BookingRequestForm from "@/app/components/BookingRequestForm";
import SpaceAttributesDisplay from "@/app/components/SpaceAttributesDisplay";
import SpaceGallerySection from "./space-gallery-section";
import SpaceMapSection from "./space-map-section";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";

import {
  MapPin,
  Tag,
  CalendarDays,
  ChevronDown,
  Map,
  X,
} from "lucide-react";

type Space = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  latitude: number | null;
  longitude: number | null;
  image_urls: string[];
  attributes: Record<string, string[]>;
};


async function getSpace(id: string) {
  const { data: rawSpace, error } = await supabase
    .from("spaces")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !rawSpace) {
    return { space: null, errorMessage: error?.message };
  }

  const { data: images } = await supabase
    .from("space_images")
    .select("image_url, sort_order")
    .eq("space_id", id)
    .order("sort_order", { ascending: true });

  const { data: attributes } = await supabase
    .from("space_attributes")
    .select("attribute_key, attribute_value")
    .eq("space_id", id);

  const grouped: Record<string, string[]> = {};

  (attributes || []).forEach(
    (row: { attribute_key: string; attribute_value: string | null }) => {
      if (!row.attribute_value) return;
      if (!grouped[row.attribute_key]) grouped[row.attribute_key] = [];
      grouped[row.attribute_key].push(row.attribute_value);
    }
  );

  return {
    space: {
      ...(rawSpace as Omit<Space, "image_urls" | "attributes">),
      image_urls: (images || []).map((i: { image_url: string }) => i.image_url),
      attributes: grouped,
    },
    errorMessage: null,
  };
}

function formatLabel(value: string | null) {
  if (!value) return "Not set";
  return formatSpaceTypeLabel(value);
}

function formatBookingUnit(value: string | null) {
  if (value === "hour") return "By hour";
  if (value === "month") return "By month";
  return "By day";
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { space, errorMessage } = await getSpace(id);

  if (!space) {
    if (!errorMessage) notFound();

    return (
      <main className="min-h-screen bg-[#f8fafb] px-6 py-8 text-[#192a3a]">
        <div className="mx-auto max-w-3xl rounded-md border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Error loading space</h1>
          <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
        </div>
      </main>
    );
  }

  const price =
    space.booking_unit === "hour"
      ? space.price_per_hour
      : space.booking_unit === "month"
      ? space.price_per_month
      : space.price_per_day;

  const suffix =
    space.booking_unit === "hour"
      ? "/ hour"
      : space.booking_unit === "month"
      ? "/ month"
      : "/ day";

  const address = [space.address_line_1, space.suburb, space.city]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="min-h-screen bg-[#f8fafb] px-6 py-8 text-[#192a3a]">
      <div className="mx-auto max-w-7xl">

        {/* 🔹 TOP SECTION */}
        <section className="mb-4 rounded-md border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

            {/* LEFT */}
            <div className="max-w-4xl">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {space.title}
              </h1>

              <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                <MapPin size={16} />
                <span>{address}</span>
              </div>

              <p className="mt-3 max-w-3xl text-base leading-6 text-gray-700">
                {space.description || "No description added yet."}
              </p>
            </div>

            {/* RIGHT PRICE */}
            <div className="relative w-full rounded-md border border-gray-200 bg-[#f8fafb] p-5 lg:max-w-sm">
              <input id="space-map-toggle" type="checkbox" className="peer sr-only" />
              <div className="absolute right-4 top-4 flex flex-col items-center gap-3">
                <label
                  htmlFor="space-map-toggle"
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-[#192a3a] shadow-sm hover:bg-[#f8fafb]"
                  aria-label="Open map view"
                >
                  <Map className="h-4 w-4" />
                </label>

                <label
                  htmlFor="space-map-toggle"
                  className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm hover:opacity-95"
                  aria-label="Open map view"
                >
                  <Image
                    src="/map-preview.png"
                    alt="Map preview"
                    width={116}
                    height={76}
                    className="block h-[76px] w-[116px] object-cover"
                  />
                </label>
              </div>

              <div className="pointer-events-none fixed inset-0 z-40 bg-black/30 opacity-0 transition peer-checked:pointer-events-auto peer-checked:opacity-100">
                <label htmlFor="space-map-toggle" className="absolute inset-0 cursor-pointer" aria-label="Close map view" />
              </div>

              <div className="pointer-events-none fixed left-1/2 top-1/2 z-50 w-[min(92vw,980px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white opacity-0 shadow-2xl transition peer-checked:pointer-events-auto peer-checked:opacity-100">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                      Location
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-[#192a3a]">
                      Map View
                    </h2>
                  </div>

                  <label
                    htmlFor="space-map-toggle"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                    aria-label="Close map view"
                  >
                    <X className="h-4 w-4" />
                  </label>
                </div>

                <div className="grid gap-0 lg:grid-cols-[1.5fr_0.9fr]">
                  <div className="border-b border-gray-200 lg:border-b-0 lg:border-r">
                    <SpaceMapSection {...space} />
                  </div>

                  <div className="space-y-3 p-5">
                    <div>
                      <h3 className="text-base font-semibold text-[#192a3a]">
                        Similar spaces nearby
                      </h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Nearby space suggestions will appear here as this feature expands.
                      </p>
                    </div>

                    <div className="rounded-md border border-dashed border-gray-300 bg-[#f8fafb] p-4 text-sm text-gray-500">
                      No similar nearby spaces to show yet.
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">Rate</p>

              <p className="mt-2 text-4xl font-semibold leading-none text-[#192a3a]">
                {price ? `R${price}` : "Not set"}
              </p>

              <p className="mt-2 text-sm text-gray-500">{suffix}</p>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Tag size={16} />
                  <span>
                    <span className="font-medium text-[#192a3a]">Space type:</span>{" "}
                    {formatLabel(space.space_type)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <CalendarDays size={16} />
                  <span>
                    <span className="font-medium text-[#192a3a]">Booking type:</span>{" "}
                    {formatBookingUnit(space.booking_unit)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 🔹 GALLERY */}
        <SpaceGallerySection
          title={space.title}
          imageUrls={space.image_urls}
        />

        {/* 🔹 SPACE DETAILS */}
        <section className="mt-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm [&_h2]:hidden">
          <SpaceAttributesDisplay
            spaceType={space.space_type}
            attributes={space.attributes}
          />
        </section>

        {/* 🔹 MAIN GRID */}
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr]">
        </div>
      </div>

      <input id="space-booking-toggle" type="checkbox" className="peer sr-only" />
      <label
        htmlFor="space-booking-toggle"
        className="fixed bottom-4 left-1/2 z-30 flex w-fit -translate-x-1/2 cursor-pointer items-center justify-center rounded-xl bg-[#0f2740] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-95"
      >
        Book this space
      </label>

      <div className="pointer-events-none fixed inset-0 z-30 bg-black/20 opacity-0 transition peer-checked:pointer-events-auto peer-checked:opacity-100">
        <label htmlFor="space-booking-toggle" className="absolute inset-0 cursor-pointer" aria-label="Close booking panel" />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[82vh] w-full max-w-7xl translate-y-full overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl transition peer-checked:pointer-events-auto peer-checked:translate-y-0">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              Booking
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[#192a3a]">
              {space.title}
            </h2>
          </div>

          <label
            htmlFor="space-booking-toggle"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
            aria-label="Close booking panel"
          >
            <X className="h-4 w-4" />
          </label>
        </div>

        <div className="max-h-[calc(82vh-74px)] overflow-y-auto px-5 py-5">
          <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
            <BookingRequestForm
              spaceId={space.id}
              ownerId={space.owner_id}
              bookingUnit={space.booking_unit}
              pricePerHour={space.price_per_hour}
              pricePerDay={space.price_per_day}
              pricePerMonth={space.price_per_month}
              minHours={space.min_booking_hours}
              minDays={space.min_booking_days}
              minMonths={space.min_booking_months}
            />

            <section className="mt-3 rounded-md border border-gray-200 bg-[#f8fafb] p-3">
              <h3 className="mb-2 text-lg font-semibold">Terms</h3>
              <p className="mb-3 text-sm text-gray-600">
                Please review the booking and cancellation terms before sending your request.
              </p>

              <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
                <li>Hourly bookings: Free cancellation up to 24 hours before the booking start time. Within 24 hours, no refund applies.</li>
                <li>Daily bookings: Free cancellation more than 7 days before the booking start date. Within 7 days, no refund applies.</li>
                <li>Monthly bookings: A non-refundable deposit equal to one month’s rental may apply before the booking start date. After the booking start date, no refunds apply.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}