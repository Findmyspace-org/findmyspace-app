import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import V2BookingForm from "@/app/components/v2/V2BookingForm";
import { V2MapMarker } from "@/app/components/v2/V2Brand";
import { V2Container } from "@/app/components/v2/V2Primitives";
import {
  acceptsListingEnquiries,
  isBookableListingStatus,
} from "@/lib/listing-lifecycle";
import {
  formatSpaceDepositDetail,
  formatSpacePriceDisplay,
} from "@/lib/space-pricing";
import {
  formatMinBookingDuration,
  resolveRentalBookingUnit,
} from "@/lib/space-min-booking";
import { getV2PublicSpaceDetail } from "@/lib/v2/public-space-detail";
import { buildV2SpaceHref, V2_BROWSE_HREF } from "@/lib/v2/ui-version";
import { formatListingAddress } from "@/lib/za-provinces";

export default async function V2SpaceBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const space = await getV2PublicSpaceDetail(id);
  if (!space) notFound();

  const detailHref = buildV2SpaceHref(space.id);
  const enquiryMode = acceptsListingEnquiries(space);
  const bookable = isBookableListingStatus(space);
  const address = formatListingAddress({
    street_address: space.street_address,
    suburb: space.suburb,
    city: space.city,
    province: space.province,
    postal_code: space.postal_code,
    country: space.country,
    address_line_1: space.address_line_1,
  });
  const locationLabel =
    [space.suburb, space.city].filter(Boolean).join(", ") ||
    address ||
    "Location to be confirmed";
  const price = formatSpacePriceDisplay(space);
  const deposit = formatSpaceDepositDetail(space);
  const minimum = formatMinBookingDuration(space);
  const bookingUnit = resolveRentalBookingUnit(space);
  const coverImage = space.image_urls[0] || null;

  if (!bookable) {
    return (
      <V2Container>
        <article className="fms-v2-booking">
          <Link href={detailHref} className="fms-v2-detail-back">
            <ArrowLeft aria-hidden />
            Back to space
          </Link>
          <div className="fms-v2-booking-unavailable">
            <h1>Booking isn&apos;t available</h1>
            {enquiryMode ? (
              <>
                <p>
                  This listing takes enquiries instead of booking requests. The
                  existing enquiry form is unchanged.
                </p>
                <Link href={`/spaces/${space.id}`}>Continue to enquiry</Link>
              </>
            ) : (
              <>
                <p>This space is not currently accepting booking requests.</p>
                <Link href={V2_BROWSE_HREF}>Browse available spaces</Link>
              </>
            )}
          </div>
        </article>
      </V2Container>
    );
  }

  return (
    <V2Container>
      <article className="fms-v2-booking">
        <Link href={detailHref} className="fms-v2-detail-back">
          <ArrowLeft aria-hidden />
          Back to space
        </Link>

        <header className="fms-v2-booking-heading">
          <p>Request to book</p>
          <h1>{space.title}</h1>
          <p>
            Choose when you need the space. The host reviews your request before
            any payment is taken.
          </p>
        </header>

        <ol className="fms-v2-booking-steps">
          <li>
            <span>1</span>
            When do you need it?
          </li>
          <li>
            <span>2</span>
            Confirm the details
          </li>
          <li>
            <span>3</span>
            Send the request
          </li>
        </ol>

        <div className="fms-v2-booking-layout">
          <div className="fms-v2-booking-main">
            <V2BookingForm
              spaceId={space.id}
              ownerId={space.owner_id}
              bookingUnit={bookingUnit}
              priceAmount={space.price_amount}
              priceUnit={space.price_unit}
              pricePerHour={space.price_per_hour}
              pricePerDay={space.price_per_day}
              pricePerMonth={space.price_per_month}
              minHours={space.min_booking_hours}
              minDays={space.min_booking_days}
              minMonths={space.min_booking_months}
              spaceLocation={address || locationLabel}
            />

            <details className="fms-v2-booking-terms">
              <summary>Terms &amp; cancellation</summary>
              <p>
                Review before you send your request. Nothing is charged until
                the host approves and you pay.
              </p>
              <ul>
                <li>
                  Hourly: free cancellation up to 24 hours before the start;
                  within 24 hours, no refund.
                </li>
                <li>
                  Daily: free cancellation more than 7 days before the start;
                  within 7 days, no refund.
                </li>
                <li>
                  Monthly: a non-refundable deposit (e.g. one month) may apply
                  before the start; after the start date, no refunds.
                </li>
              </ul>
            </details>
          </div>

          <aside className="fms-v2-booking-summary">
            <div className="fms-v2-booking-summary-media">
              {coverImage ? (
                <Image
                  src={coverImage}
                  alt={space.title}
                  fill
                  sizes="(max-width: 1023px) 100vw, 22rem"
                  className="object-cover"
                />
              ) : (
                <div className="fms-v2-booking-summary-fallback" aria-hidden>
                  <V2MapMarker size={48} />
                </div>
              )}
            </div>
            <p className="fms-v2-booking-summary-type">
              {formatSpaceTypeLabel(space.space_type)}
            </p>
            <h2>{space.title}</h2>
            <p className="fms-v2-booking-summary-location">
              <MapPin aria-hidden />
              {locationLabel}
            </p>
            <p className="fms-v2-detail-price-label">From</p>
            <p className="fms-v2-detail-price">{price}</p>
            {minimum ? (
              <p className="fms-v2-booking-summary-note">
                <Clock3 aria-hidden />
                Minimum {minimum}
              </p>
            ) : null}
            {deposit ? (
              <p className="fms-v2-booking-summary-note">
                <ShieldCheck aria-hidden />
                {deposit}
              </p>
            ) : null}
            <ul>
              <li>
                <ShieldCheck aria-hidden />
                Existing secure request flow
              </li>
              <li>
                <CheckCircle2 aria-hidden />
                Nothing is charged before approval
              </li>
            </ul>
          </aside>
        </div>
      </article>
    </V2Container>
  );
}
