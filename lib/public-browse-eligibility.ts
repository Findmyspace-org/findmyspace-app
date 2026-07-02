import { isArchivedSpace } from "@/lib/space-archive";
import {
  isEnquiryOnlyListing,
  isSpacePubliclyVisible,
} from "@/lib/listing-lifecycle";
import {
  hasValidPublicPrice,
  isSpacePriceUnit,
  resolveSpacePriceAmount,
  resolveSpacePriceUnit,
  type SpacePricingInput,
} from "@/lib/space-pricing";
import type { SpaceListingModeFields } from "@/lib/public-listing-mode";

export type PublicBrowseEligibilityInput = SpaceListingModeFields &
  SpacePricingInput & {
    status?: string | null;
    archived_at?: string | null;
    image_count?: number;
  };

export type PublicBrowseEligibilityResult = {
  eligible: boolean;
  reasons: string[];
};

/** Canonical rules for appearing on /spaces (before search/category/location filters). */
export function getPublicBrowseEligibility(
  space: PublicBrowseEligibilityInput | null | undefined
): PublicBrowseEligibilityResult {
  const reasons: string[] = [];

  if (!space) {
    return { eligible: false, reasons: ["Listing not found."] };
  }

  if (isArchivedSpace(space.status) || space.archived_at) {
    reasons.push("Listing is archived.");
  }

  if (!isSpacePubliclyVisible(space)) {
    reasons.push("Public listing mode is hidden (not enquiry or live).");
  }

  if (isEnquiryOnlyListing(space)) {
    return { eligible: reasons.length === 0, reasons };
  }

  const priceUnit = resolveSpacePriceUnit(space);
  if (priceUnit === "on_request") {
    return { eligible: reasons.length === 0, reasons };
  }

  if (!hasValidPublicPrice(space)) {
    reasons.push(
      "Live listing has no resolvable public price (check price amount, unit, and legacy price fields)."
    );
  }

  return { eligible: reasons.length === 0, reasons };
}

export function isPublicBrowseEligible(
  space: PublicBrowseEligibilityInput | null | undefined
): boolean {
  return getPublicBrowseEligibility(space).eligible;
}

export function formatPublicBrowseExclusionReason(
  result: PublicBrowseEligibilityResult
): string | null {
  if (result.eligible || result.reasons.length === 0) return null;
  return result.reasons[0] ?? null;
}

export type BrowsePriceRangeInput = SpacePricingInput & SpaceListingModeFields;

/**
 * Price used by /spaces default filters. Uses canonical price_amount + price_unit
 * so listings stay visible when legacy price_per_* columns drift from booking_unit.
 */
export function resolveBrowsePriceFilterAmount(
  space: BrowsePriceRangeInput,
  bookingUnitFilter: "all" | "hour" | "day" | "month" | string = "all"
): number | null | "on_request" {
  if (isEnquiryOnlyListing(space)) return "on_request";

  const priceUnit = resolveSpacePriceUnit(space);
  if (priceUnit === "on_request") return "on_request";

  if (bookingUnitFilter !== "all") {
    const rentalUnit =
      priceUnit === "event" ? "day" : priceUnit && isSpacePriceUnit(priceUnit) ? priceUnit : null;
    if (rentalUnit && rentalUnit !== bookingUnitFilter) {
      return null;
    }
  }

  return resolveSpacePriceAmount(space);
}

export function spaceMatchesBrowsePriceRange(
  space: BrowsePriceRangeInput,
  minPrice: number,
  maxPrice: number,
  bookingUnitFilter: "all" | "hour" | "day" | "month" | string = "all"
): boolean {
  const price = resolveBrowsePriceFilterAmount(space, bookingUnitFilter);
  if (price === "on_request") return true;
  if (price == null) return false;
  return price >= minPrice && price <= maxPrice;
}

/** True when the user has applied a price refinement (not the default browse view). */
export function isExplicitBrowsePriceFilter(input: {
  minPrice: number;
  maxPrice: number;
  bookingUnitFilter: string;
  defaultMaxPrice: number;
  /** Set when the user applies the price modal or URL contains min/max. */
  priceFilterApplied?: boolean;
  searchParams?: { get(name: string): string | null };
}): boolean {
  if (input.priceFilterApplied) return true;
  if (input.searchParams) {
    if (input.searchParams.get("min") !== null) return true;
    if (input.searchParams.get("max") !== null) return true;
  }
  return false;
}

/** Browse listing gate: public visibility + valid price for live listings. */
export function passesPublicBrowseListingGate(
  space: PublicBrowseEligibilityInput | null | undefined
): boolean {
  return isPublicBrowseEligible(space);
}
