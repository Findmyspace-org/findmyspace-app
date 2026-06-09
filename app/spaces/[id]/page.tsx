import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import BookingSheetBootstrap from "./booking-sheet-bootstrap";
import { supabase } from "@/lib/supabase";
import BookingRequestForm from "@/app/components/BookingRequestForm";
import SpaceAssistant from "@/app/components/SpaceAssistant";
import SpaceAttributesDisplay from "@/app/components/SpaceAttributesDisplay";
import SpaceGallerySection from "./space-gallery-section";
import SpaceMapSection from "./space-map-section";
import {
  formatSpaceTypeLabel,
  getSectionCheckboxLabels,
} from "@/app/data/spaceFeatureConfig";
import { formatListingAddress } from "@/lib/za-provinces";
import {
  isPublicListingStatus,
  isBookableListingStatus,
  isUnclaimedListing,
  UNCLAIMED_LISTING_BADGE,
} from "@/lib/listing-lifecycle";
import { UnclaimedListingClaimSection } from "@/app/components/UnclaimedListingClaimSection";
import { UnclaimedListingEnquirySocialProof } from "@/app/components/UnclaimedListingEnquirySocialProof";
import { UnclaimedListingMobileSheet } from "@/app/components/UnclaimedListingMobileSheet";
import { UnclaimedListingPricingSection } from "@/app/components/UnclaimedListingPricingSection";
import { UnclaimedListingSidebar } from "@/app/components/UnclaimedListingSidebar";
import { getListingEnquiryCount } from "@/lib/listing-enquiry-count";
import { PUBLIC_SPACE_SELECT } from "@/lib/public-space-columns";

import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  MessageCircle,
  MapPin,
  ChevronDown,
  Map,
  ShieldCheck,
  X,
} from "lucide-react";

type Space = {
  id: string;
  owner_id: string | null;
  title: string;
  description: string | null;
  status: string | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
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

type HostProfile = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  created_at?: string | null;
  owner_verification_status?: string | null;
};

async function getSpace(id: string) {
  const { data: rawSpace, error } = await supabase
    .from("spaces")
    .select(PUBLIC_SPACE_SELECT)
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

async function getHostProfile(ownerId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, full_name, created_at, owner_verification_status")
    .eq("id", ownerId)
    .single();

  return (data as HostProfile | null) ?? null;
}

function formatLabel(value: string | null) {
  if (!value) return "Not set";
  return formatSpaceTypeLabel(value);
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

  if (!isPublicListingStatus(space.status)) {
    notFound();
  }

  const unclaimed = isUnclaimedListing(space.status);
  const bookable = isBookableListingStatus(space.status);
  const enquiryCount = unclaimed ? await getListingEnquiryCount(space.id) : 0;
  const suitableForLabels =
    space.space_type === "event_space"
      ? getSectionCheckboxLabels(space.space_type, space.attributes, "suitable_for")
      : [];

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

  const address = formatListingAddress({
    street_address: space.street_address,
    suburb: space.suburb,
    city: space.city,
    province: space.province,
    postal_code: space.postal_code,
    country: space.country,
    address_line_1: space.address_line_1,
  });
  const hostProfile = space.owner_id
    ? await getHostProfile(space.owner_id)
    : null;
  const hostName =
    [hostProfile?.first_name, hostProfile?.last_name].filter(Boolean).join(" ").trim() ||
    hostProfile?.full_name ||
    "Host";
  const hostInitial = hostName.charAt(0).toUpperCase() || "H";
  const hostJoined = hostProfile?.created_at
    ? new Date(hostProfile.created_at).toLocaleDateString("en-ZA", { month: "short", year: "numeric" })
    : null;
  const isVerifiedSpace =
    hostProfile?.owner_verification_status === "approved" ||
    hostProfile?.owner_verification_status === "verified";

  return (
    <main className="min-h-screen bg-[#f8fafb] px-6 py-8 text-[#192a3a]">
      <Suspense fallback={null}>
        <BookingSheetBootstrap />
      </Suspense>

      <div className="mx-auto max-w-7xl">
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

        <div className="mb-5">
          <Link
            href="/spaces"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#334155] transition hover:text-[#0f172a]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to results
          </Link>
        </div>

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                    <span className="inline-flex rounded-full bg-[#eef2f6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#334155]">
                      {formatLabel(space.space_type)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {[space.suburb, space.city].filter(Boolean).join(", ") || address}
                    </span>
                  </div>

                  <h1 className="text-3xl font-semibold tracking-tight text-[#192a3a] md:text-4xl">
                    {space.title}
                  </h1>

                  {unclaimed ? (
                    <div className="mt-3 flex flex-col items-start gap-2">
                      <p className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-950">
                        {UNCLAIMED_LISTING_BADGE}
                      </p>
                      <UnclaimedListingEnquirySocialProof count={enquiryCount} />
                    </div>
                  ) : isVerifiedSpace ? (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#f0d5d8] bg-[#fff6f7] px-3 py-1 text-xs font-medium text-[#9f1239]">
                      <BadgeCheck className="h-4 w-4" />
                      Verified space
                    </p>
                  ) : null}
                </div>

                <label
                  htmlFor="space-map-toggle"
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm font-medium text-[#192a3a] shadow-sm transition hover:border-[#cbd5e1] hover:bg-[#f8fafb]"
                  aria-label="View on map"
                >
                  <Map className="h-4 w-4 shrink-0" aria-hidden />
                  View on map
                </label>
              </div>
            </section>

            <SpaceGallerySection
              spaceId={space.id}
              title={space.title}
              imageUrls={space.image_urls}
            />

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-[#192a3a]">About this space</h2>
              <p className="mt-3 text-base leading-relaxed text-gray-700">
                {space.description || "No description added yet."}
              </p>
            </section>

            {suitableForLabels.length > 0 ? (
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-semibold text-[#192a3a]">Suitable for</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suitableForLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center rounded-full border border-[#d7dde3] bg-white px-3 py-1.5 text-xs font-medium text-[#334155]"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-3 text-lg font-semibold text-[#192a3a] sm:mb-4 sm:text-xl">
                Features &amp; amenities
              </h2>
              <div className="[&_div[class*='grid']]:gap-2 [&_div[class*='grid']]:sm:gap-3 [&_div[class*='grid']]:sm:grid-cols-2 [&_div[class*='grid']]:lg:grid-cols-3 [&_div[class*='grid']_>_div]:rounded-xl [&_div[class*='grid']_>_div]:border [&_div[class*='grid']_>_div]:border-[#e2e8f0] [&_div[class*='grid']_>_div]:bg-[#fbfcfd] [&_div[class*='grid']_>_div]:p-2.5 [&_div[class*='grid']_>_div]:sm:p-3">
                <SpaceAttributesDisplay
                  spaceType={space.space_type}
                  attributes={space.attributes}
                  excludeSectionIds={
                    space.space_type === "event_space" ? ["suitable_for"] : []
                  }
                />
              </div>
            </section>

            {unclaimed ? (
              <div className="space-y-4 lg:hidden">
                <UnclaimedListingPricingSection className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" />
                <UnclaimedListingClaimSection
                  listingId={space.id}
                  listingTitle={space.title}
                />
              </div>
            ) : null}
          </div>

          {unclaimed ? (
            <UnclaimedListingSidebar
              listingId={space.id}
              listingTitle={space.title}
              enquiryCount={enquiryCount}
            />
          ) : (
          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.10)]">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                From
              </p>
              <p className="mt-2 text-4xl font-semibold leading-none text-[#192a3a]">
                {price ? `R${price}` : "Not set"}
              </p>
              <p className="mt-2 text-sm text-gray-600">{suffix}</p>

              <div className="mt-5 rounded-xl border border-[#e2e8f0] bg-[#fafbfc] p-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Cancellation policy
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
                  Cancellation policy will be confirmed before payment.
                </p>
              </div>

              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-gray-500" />
                  Secure booking
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-gray-500" />
                  Verified listing
                </li>
                <li className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-gray-500" />
                  Ask about this space before booking
                </li>
              </ul>

              <label
                htmlFor="space-booking-toggle"
                className="mt-5 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-[#0f2740] px-5 py-3 text-sm font-semibold text-white shadow-sm ring-1 ring-black/10 transition hover:opacity-95"
              >
                Book this space
              </label>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-[#192a3a]">Hosted by</h3>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e2e8f0] text-sm font-semibold text-[#192a3a]">
                  {hostInitial}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#192a3a]">{hostName}</p>
                  <p className="text-xs text-gray-500">
                    {hostJoined ? `Joined ${hostJoined}` : "Member"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gray-500">
                Tap{" "}
                <span className="font-medium text-[#192a3a]">Ask about this space</span>{" "}
                in the corner to get instant answers from the listing details, or send the
                host a yes/no question.
              </p>
            </section>
          </aside>
          )}
        </div>
      </div>

      {unclaimed ? (
        <UnclaimedListingMobileSheet
          listingId={space.id}
          listingTitle={space.title}
          enquiryCount={enquiryCount}
        />
      ) : bookable ? (
        <>
      <input id="space-booking-toggle" type="checkbox" className="peer sr-only" />
      <label
        htmlFor="space-booking-toggle"
        className="fixed bottom-4 left-1/2 z-30 flex w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2 cursor-pointer items-center justify-center rounded-xl bg-[#0f2740] px-7 py-3.5 text-sm font-semibold text-white shadow-lg ring-1 ring-black/10 hover:opacity-95 lg:hidden"
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
                ownerId={space.owner_id!}
                bookingUnit={space.booking_unit}
                pricePerHour={space.price_per_hour}
                pricePerDay={space.price_per_day}
                pricePerMonth={space.price_per_month}
                minHours={space.min_booking_hours}
                minDays={space.min_booking_days}
                minMonths={space.min_booking_months}
                spaceLocation={address}
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

      <SpaceAssistant
        spaceId={space.id}
        spaceTitle={space.title}
        spaceType={space.space_type}
        bookingUnit={space.booking_unit}
      />
        </>
      ) : null}
    </main>
  );
}