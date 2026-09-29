import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import {
  ENQUIRY_PRICING_LABEL,
  shouldHideListingPricing,
} from "@/lib/listing-lifecycle";
import {
  formatSpacePriceDisplay,
  type SpacePricingInput,
} from "@/lib/space-pricing";
import { buildV2Href } from "@/lib/v2/ui-version";
import { V2MapMarker } from "./V2Brand";

export type V2PublicSpaceCardData = SpacePricingInput & {
  id: string;
  title: string;
  city: string | null;
  suburb: string | null;
  space_type: string | null;
  status?: string | null;
  public_listing_mode?: string | null;
  image_urls: string[];
};

export default function V2SpaceCard({
  space,
}: {
  space: V2PublicSpaceCardData;
}) {
  const imageUrl = space.image_urls[0] || null;
  const location =
    [space.suburb, space.city].filter(Boolean).join(", ") ||
    "Location to be confirmed";
  const price = shouldHideListingPricing(space)
    ? ENQUIRY_PRICING_LABEL
    : formatSpacePriceDisplay(space);

  return (
    <article className="fms-v2-space-card">
      <Link
        href={buildV2Href(`/v2/spaces/${space.id}`)}
        className="fms-v2-space-card-link"
        aria-label={`View ${space.title}`}
      >
        <div className="fms-v2-space-card-image">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={space.title}
              fill
              sizes="(max-width: 639px) 86vw, (max-width: 1023px) 44vw, 30vw"
              className="object-cover"
            />
          ) : (
            <div className="fms-v2-space-card-fallback" aria-hidden>
              <V2MapMarker size={52} />
            </div>
          )}
        </div>

        <div className="fms-v2-space-card-body">
          <h3>{space.title}</h3>
          <p className="fms-v2-space-card-meta">
            <MapPin aria-hidden />
            <span>
              {location} · {formatSpaceTypeLabel(space.space_type)}
            </span>
          </p>
          <p className="fms-v2-space-card-price">{price}</p>
        </div>
      </Link>
    </article>
  );
}
