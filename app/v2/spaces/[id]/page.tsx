import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import MarkdownDescriptionDisplay from "@/app/components/MarkdownDescriptionDisplay";
import SpaceAttributesDisplay from "@/app/components/SpaceAttributesDisplay";
import {
  formatSpaceTypeLabel,
  getSectionCheckboxLabels,
  getSportTypeBadgeLabels,
} from "@/app/data/spaceFeatureConfig";
import V2SpaceGallery from "@/app/components/v2/V2SpaceGallery";
import V2SpaceLocationMap from "@/app/components/v2/V2SpaceLocationMap";
import { V2Container } from "@/app/components/v2/V2Primitives";
import { formatGroupSizePublic } from "@/lib/group-size";
import {
  acceptsListingEnquiries,
  ENQUIRY_PRICING_LABEL,
  isBookableListingStatus,
  shouldHideListingPricing,
} from "@/lib/listing-lifecycle";
import {
  formatSpaceDepositDetail,
  formatSpacePriceDisplay,
} from "@/lib/space-pricing";
import { formatMinBookingDuration } from "@/lib/space-min-booking";
import {
  getV2PublicSpaceDetail,
  type V2PublicSpaceDetail,
} from "@/lib/v2/public-space-detail";
import { buildV2BookHref, V2_BROWSE_HREF } from "@/lib/v2/ui-version";
import { formatListingAddress } from "@/lib/za-provinces";

type DetailFact = {
  label: string;
  value: string;
  icon: typeof Building2;
};

function buildDetailFacts(space: V2PublicSpaceDetail): DetailFact[] {
  const facts: DetailFact[] = [
    {
      label: "Space type",
      value: formatSpaceTypeLabel(space.space_type),
      icon: Building2,
    },
  ];

  const capacity = formatGroupSizePublic(
    space.min_group_size,
    space.max_group_size
  );
  if (capacity) {
    facts.push({ label: "Capacity", value: capacity, icon: Users });
  }

  const minimum = formatMinBookingDuration(space);
  if (minimum) {
    facts.push({ label: "Minimum booking", value: minimum, icon: Clock3 });
  }

  const deposit = formatSpaceDepositDetail(space);
  if (deposit) {
    facts.push({ label: "Deposit", value: deposit, icon: ShieldCheck });
  }

  return facts.slice(0, 4);
}

export default async function V2SpaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const space = await getV2PublicSpaceDetail(id);
  if (!space) notFound();

  const enquiryMode = acceptsListingEnquiries(space);
  const bookable = isBookableListingStatus(space);
  const hidePricing = shouldHideListingPricing(space);
  const price = hidePricing
    ? ENQUIRY_PRICING_LABEL
    : formatSpacePriceDisplay(space);
  const detailFacts = buildDetailFacts(space);
  const suitableFor = getSectionCheckboxLabels(
    space.space_type,
    space.attributes,
    "suitable_for"
  );
  const sports = getSportTypeBadgeLabels(
    space.space_type,
    space.attributes
  );
  const hasAmenities = Object.values(space.attributes).some(
    (values) => values.length > 0
  );
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
  const classicDetailHref = `/spaces/${space.id}`;
  const action = bookable
    ? {
        href: buildV2BookHref(space.id),
        label: "Request to book",
        note: "Choose your dates and send the host a request.",
      }
    : enquiryMode
      ? {
          href: classicDetailHref,
          label: "Enquire about this space",
          note: "Continue to the existing enquiry form to confirm availability.",
        }
      : null;

  const hostName = space.host
    ? [space.host.first_name, space.host.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      space.host.full_name ||
      "Host"
    : null;
  const hostJoined = space.host?.created_at
    ? new Date(space.host.created_at).toLocaleDateString("en-ZA", {
        month: "short",
        year: "numeric",
      })
    : null;
  const hostVerified =
    space.host?.owner_verification_status === "approved" ||
    space.host?.owner_verification_status === "verified";

  return (
    <>
      <V2Container>
        <article className="fms-v2-detail">
          <Link href={V2_BROWSE_HREF} className="fms-v2-detail-back">
            <ArrowLeft aria-hidden />
            Browse spaces
          </Link>

          <V2SpaceGallery title={space.title} imageUrls={space.image_urls} />

          <div className="fms-v2-detail-layout">
            <div className="fms-v2-detail-content">
              <header className="fms-v2-detail-identity">
                <div className="fms-v2-detail-meta">
                  <span>{formatSpaceTypeLabel(space.space_type)}</span>
                  <span>
                    <MapPin aria-hidden />
                    {locationLabel}
                  </span>
                </div>
                <h1>{space.title}</h1>
                {enquiryMode ? (
                  <p className="fms-v2-detail-status">
                    Availability to be confirmed
                  </p>
                ) : hostVerified ? (
                  <p className="fms-v2-detail-status">
                    <BadgeCheck aria-hidden />
                    Verified space
                  </p>
                ) : null}
              </header>

              <section
                className="fms-v2-detail-section"
                aria-labelledby="about-space"
              >
                <h2 id="about-space">About this space</h2>
                <MarkdownDescriptionDisplay content={space.description} />
              </section>

              {detailFacts.length > 0 ? (
                <section
                  className="fms-v2-detail-section"
                  aria-labelledby="space-facts"
                >
                  <h2 id="space-facts">At a glance</h2>
                  <div className="fms-v2-detail-facts">
                    {detailFacts.map((fact) => {
                      const Icon = fact.icon;
                      return (
                        <div key={fact.label}>
                          <Icon aria-hidden />
                          <span>
                            <small>{fact.label}</small>
                            <strong>{fact.value}</strong>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {suitableFor.length > 0 || sports.length > 0 ? (
                <section
                  className="fms-v2-detail-section"
                  aria-labelledby="space-suited"
                >
                  <h2 id="space-suited">Good for</h2>
                  <div className="fms-v2-detail-chips">
                    {[...sports, ...suitableFor].slice(0, 8).map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </section>
              ) : null}

              {hasAmenities ? (
                <details className="fms-v2-detail-amenities">
                  <summary>Show all amenities</summary>
                  <div>
                    <SpaceAttributesDisplay
                      spaceType={space.space_type}
                      attributes={space.attributes}
                      excludeSectionIds={
                        space.space_type === "event_space"
                          ? ["suitable_for"]
                          : []
                      }
                    />
                  </div>
                </details>
              ) : null}

              <section
                className="fms-v2-detail-section"
                aria-labelledby="space-location"
              >
                <h2 id="space-location">Where you&apos;ll be</h2>
                <p className="fms-v2-detail-address">
                  <MapPin aria-hidden />
                  {address || locationLabel}
                </p>
                <V2SpaceLocationMap
                  id={space.id}
                  title={space.title}
                  description={space.description}
                  city={space.city}
                  suburb={space.suburb}
                  address_line_1={space.address_line_1}
                  price_amount={space.price_amount}
                  price_unit={space.price_unit}
                  price_per_hour={space.price_per_hour}
                  price_per_day={space.price_per_day}
                  price_per_month={space.price_per_month}
                  booking_unit={space.booking_unit}
                  space_type={space.space_type}
                  latitude={space.latitude}
                  longitude={space.longitude}
                />
              </section>

              {space.host && hostName ? (
                <section
                  className="fms-v2-detail-section fms-v2-detail-host"
                  aria-labelledby="space-host"
                >
                  <h2 id="space-host">Hosted by</h2>
                  <div>
                    <span className="fms-v2-detail-host-avatar">
                      {hostName.charAt(0).toUpperCase()}
                    </span>
                    <p>
                      <strong>{hostName}</strong>
                      <small>
                        {hostJoined ? `Joined ${hostJoined}` : "Member"}
                        {hostVerified ? " · Verified" : ""}
                      </small>
                    </p>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="fms-v2-detail-booking-card">
              <p className="fms-v2-detail-price-label">
                {hidePricing ? "Pricing" : "From"}
              </p>
              <p className="fms-v2-detail-price">{price}</p>
              {action ? (
                <>
                  <p className="fms-v2-detail-action-note">{action.note}</p>
                  <Link href={action.href} className="fms-v2-detail-primary-action">
                    {action.label}
                  </Link>
                </>
              ) : (
                <div className="fms-v2-detail-unavailable">
                  Booking is not currently available.
                </div>
              )}
              <ul>
                <li>
                  <ShieldCheck aria-hidden />
                  Existing secure request flow
                </li>
                <li>
                  <CheckCircle2 aria-hidden />
                  Nothing is charged before approval
                </li>
                <li>
                  <MessageCircle aria-hidden />
                  Questions continue in the current listing experience
                </li>
              </ul>
            </aside>
          </div>
        </article>
      </V2Container>

      <div className="fms-v2-detail-mobile-action">
        <div>
          <small>{hidePricing ? "Pricing" : "From"}</small>
          <strong>{price}</strong>
        </div>
        {action ? (
          <Link href={action.href}>{action.label}</Link>
        ) : (
          <span>Unavailable</span>
        )}
      </div>
    </>
  );
}
