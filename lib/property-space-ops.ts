import { adminListingStatusLabel } from "@/lib/admin-listing-status-display";
import {
  adminSpaceEditHref,
  adminSpacePublicViewHref,
  getAdminSpaceVisibilityInfo,
} from "@/lib/admin-space-visibility";
import {
  normalizePublicListingMode,
  type PublicListingMode,
} from "@/lib/public-listing-mode";
import {
  spaceHasCompletePricing,
  type SpacePricingInput,
} from "@/lib/space-pricing";
import { isArchivedSpace } from "@/lib/space-archive";

export type PropertySpaceHealthInput = {
  id: string;
  status: string | null;
  public_listing_mode: string | null;
  booking_unit: string | null;
  price_amount: number | null;
  price_unit: string | null;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  suburb: string | null;
  image_count: number;
  has_ai_information: boolean;
};

export type PropertySpacesSummary = {
  total: number;
  hidden: number;
  enquiry: number;
  live: number;
  archived: number;
};

export type PropertySpacesHealth = {
  withPhotos: number;
  missingPhotos: number;
  missingPricing: number;
  missingLocation: number;
  withAiInformation: number;
  missingAiInformation: number;
};

export type PropertySpaceHealthFilter =
  | "missing_photos"
  | "missing_pricing"
  | "missing_location"
  | "missing_ai_info"
  | null;

export type PropertySpaceRow = {
  id: string;
  title: string;
  status: string | null;
  status_label: string;
  public_listing_mode: string | null;
  space_type: string | null;
  updated_at: string | null;
  cover_image_url: string | null;
  admin_edit_url: string;
  view_href: string | null;
  has_photos: boolean;
  has_pricing: boolean;
  has_location: boolean;
  has_ai_information: boolean;
  visibility_label: string;
  bookability_label: string;
  is_archived: boolean;
};

export function spaceHasPricing(space: SpacePricingInput): boolean {
  return spaceHasCompletePricing(space);
}

export function spaceHasLocation(
  space: Pick<
    PropertySpaceHealthInput,
    "latitude" | "longitude" | "city" | "suburb"
  >
): boolean {
  const lat = space.latitude != null ? Number(space.latitude) : NaN;
  const lng = space.longitude != null ? Number(space.longitude) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const hasPlace = Boolean(space.city?.trim() || space.suburb?.trim());
  return hasCoords && hasPlace;
}

export function spaceHasPhotos(imageCount: number): boolean {
  return imageCount > 0;
}

export function computePropertySpacesSummary(
  spaces: { status: string | null; public_listing_mode: string | null }[]
): PropertySpacesSummary {
  let hidden = 0;
  let enquiry = 0;
  let live = 0;
  let archived = 0;

  for (const space of spaces) {
    if (isArchivedSpace(space.status)) {
      archived++;
      continue;
    }
    const mode = normalizePublicListingMode(space.public_listing_mode);
    if (mode === "live") live++;
    else if (mode === "enquiry") enquiry++;
    else hidden++;
  }

  return {
    total: spaces.length,
    hidden,
    enquiry,
    live,
    archived,
  };
}

export function computePropertySpacesHealth(
  spaces: PropertySpaceHealthInput[]
): PropertySpacesHealth {
  const active = spaces.filter((space) => !isArchivedSpace(space.status));
  let withPhotos = 0;
  let missingPhotos = 0;
  let missingPricing = 0;
  let missingLocation = 0;
  let withAiInformation = 0;
  let missingAiInformation = 0;

  for (const space of active) {
    if (spaceHasPhotos(space.image_count)) withPhotos++;
    else missingPhotos++;
    if (!spaceHasPricing(space)) missingPricing++;
    if (!spaceHasLocation(space)) missingLocation++;
    if (space.has_ai_information) withAiInformation++;
    else missingAiInformation++;
  }

  return {
    withPhotos,
    missingPhotos,
    missingPricing,
    missingLocation,
    withAiInformation,
    missingAiInformation,
  };
}

export function matchesPropertySpaceHealthFilter(
  space: Pick<
    PropertySpaceRow,
    "is_archived" | "has_photos" | "has_pricing" | "has_location" | "has_ai_information"
  >,
  filter: PropertySpaceHealthFilter
): boolean {
  if (!filter || space.is_archived) return !filter;
  if (filter === "missing_photos") return !space.has_photos;
  if (filter === "missing_pricing") return !space.has_pricing;
  if (filter === "missing_location") return !space.has_location;
  if (filter === "missing_ai_info") return !space.has_ai_information;
  return true;
}

export function summaryVisibilityBucket(
  space: { status: string | null; public_listing_mode: string | null }
): PublicListingMode | "archived" {
  if (isArchivedSpace(space.status)) return "archived";
  return normalizePublicListingMode(space.public_listing_mode);
}

type RawPropertySpace = {
  id: string;
  title: string | null;
  status: string | null;
  public_listing_mode: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_amount: number | null;
  price_unit: string | null;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  suburb: string | null;
  created_at: string | null;
  submitted_for_review_at: string | null;
  property_id: string | null;
};

export function buildPropertySpaceRow(
  space: RawPropertySpace,
  propertyId: string,
  coverImageUrl: string | null,
  imageCount: number,
  hasAiInformation = false
): PropertySpaceRow {
  const status = space.status;
  const publicListingMode = space.public_listing_mode;
  const visibility = getAdminSpaceVisibilityInfo({
    status,
    public_listing_mode: publicListingMode,
  });
  const archived = isArchivedSpace(status);

  return {
    id: space.id,
    title: space.title?.trim() || "Untitled space",
    status,
    status_label: adminListingStatusLabel(status),
    public_listing_mode: publicListingMode,
    space_type: space.space_type,
    updated_at:
      space.submitted_for_review_at || space.created_at || null,
    cover_image_url: coverImageUrl,
    admin_edit_url: adminSpaceEditHref({
      id: space.id,
      status,
      property_id: space.property_id ?? propertyId,
    }),
    view_href: archived
      ? null
      : adminSpacePublicViewHref({
          id: space.id,
          status,
          public_listing_mode: publicListingMode,
        }),
    has_photos: spaceHasPhotos(imageCount),
    has_pricing: spaceHasPricing(space),
    has_location: spaceHasLocation(space),
    has_ai_information: hasAiInformation,
    visibility_label: visibility.visibilityLabel,
    bookability_label: visibility.bookabilityLabel,
    is_archived: archived,
  };
}
