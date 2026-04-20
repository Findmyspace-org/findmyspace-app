import { Suspense } from "react";
import { notFound } from "next/navigation";
import BookingSheetBootstrap from "./booking-sheet-bootstrap";
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
      <Suspense fallback={null}>
        <BookingSheetBootstrap />
      </Suspense>

      <div className="mx-auto max-w-7xl">

        {/* 🔹 TOP SECTION — map toggle is peer for modal; kept first so layout stays predictable */}
        <section className="mb-4 rounded-md border border-gray-200 bg-white p-5 shadow-sm">
          <input id="space-map-toggle" type="checkbox" className="peer sr-only" />

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
                  Map view
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

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* LEFT */}
            <div className="min-w-0 max-w-4xl flex-1">
              <h1 className="text-3xl font-semibold tracking-tight text-[#192a3a] md:text-4xl">
                {space.title}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
                <span className="inline-flex items-center gap-2">
                  <MapPin size={16} className="shrink-0" aria-hidden />
                  <span>{address}</span>
                </span>
              </div>

              <div className="mt-3">
                <label
                  htmlFor="space-map-toggle"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-[#f8fafb] px-3 py-2 text-sm font-medium text-[#192a3a] shadow-sm transition hover:bg-white"
                >
                  <Map className="h-4 w-4 shrink-0" aria-hidden />
                  View on map
                </label>
              </div>

              <p className="mt-4 max-w-3xl text-base leading-relaxed text-gray-700">
                {space.description || "No description added yet."}
              </p>
            </div>

            {/* RIGHT — pricing only (trust anchor for booking) */}
            <div className="w-full shrink-0 rounded-lg border border-gray-200 bg-[#fbfcfd] p-5 lg:max-w-[min(100%,20rem)]">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                From
              </p>

              <p className="mt-2 text-4xl font-semibold leading-none text-[#192a3a]">
                {price ? `R${price}` : "Not set"}
              </p>

              <p className="mt-2 text-sm text-gray-600">{suffix}</p>

              <div className="mt-5 space-y-3 border-t border-gray-200/80 pt-4 text-sm">
                <div className="flex items-start gap-2">
                  <Tag size={16} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
                  <span className="text-gray-700">
                    <span className="font-medium text-[#192a3a]">Space type</span>
                    <span className="mt-0.5 block">{formatLabel(space.space_type)}</span>
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <CalendarDays size={16} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
                  <span className="text-gray-700">
                    <span className="font-medium text-[#192a3a]">Booking</span>
                    <span className="mt-0.5 block">{formatBookingUnit(space.booking_unit)}</span>
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
        <section className="mt-5 rounded-md border border-gray-200 bg-white p-4 shadow-sm sm:p-5 [&_h2]:hidden">
          <SpaceAttributesDisplay
            spaceType={space.space_type}
            attributes={space.attributes}
          />
        </section>
      </div>

      <input id="space-booking-toggle" type="checkbox" className="peer sr-only" />
      <label
        htmlFor="space-booking-toggle"
        className="fixed bottom-4 left-1/2 z-30 flex w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2 cursor-pointer items-center justify-center rounded-xl bg-[#0f2740] px-7 py-3.5 text-sm font-semibold text-white shadow-lg ring-1 ring-black/10 hover:opacity-95"
      >
        Book this space
      </label>

      <div className="pointer-events-none fixed inset-0 z-30 bg-black/20 opacity-0 transition peer-checked:pointer-events-auto peer-checked:opacity-100">
        <label htmlFor="space-booking-toggle" className="absolute inset-0 cursor-pointer" aria-label="Close booking panel" />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[85vh] w-full max-w-7xl translate-y-full overflow-hidden rounded-t-2xl border border-gray-200 bg-[#f4f6f8] shadow-2xl ring-1 ring-black/5 transition peer-checked:pointer-events-auto peer-checked:translate-y-0">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <div className="min-w-0 pr-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              Request a booking
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-[#192a3a]">
              {space.title}
            </h2>
          </div>

          <label
            htmlFor="space-booking-toggle"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
            aria-label="Close booking panel"
          >
            <X className="h-4 w-4" />
          </label>
        </div>

        <div className="max-h-[calc(85vh-74px)] overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
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
            </div>

            <details className="group mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm open:ring-1 open:ring-[#192a3a]/10">
              <summary className="cursor-pointer list-none text-sm font-semibold text-[#192a3a] [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  Terms &amp; cancellation
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition group-open:rotate-180" aria-hidden />
                </span>
              </summary>
              <p className="mt-3 text-sm text-gray-600">
                Review before you send your request. Nothing is charged until the host approves and you pay.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
                <li>Hourly: free cancellation up to 24 hours before the start; within 24 hours, no refund.</li>
                <li>Daily: free cancellation more than 7 days before the start; within 7 days, no refund.</li>
                <li>Monthly: a non-refundable deposit (e.g. one month) may apply before the start; after the start date, no refunds.</li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}