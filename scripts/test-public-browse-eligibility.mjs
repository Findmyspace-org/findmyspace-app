#!/usr/bin/env node
/**
 * Public browse eligibility + price filter tests (no DB).
 * Run: npm run test:public-browse
 */

import assert from "node:assert/strict";

function normalizeCanonicalPriceUnit(value) {
  if (value == null || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "per_event" || normalized === "per-event") return "event";
  const units = new Set(["hour", "day", "event", "month", "on_request"]);
  if (units.has(normalized)) return normalized;
  return null;
}

function resolveSpacePriceUnit(space) {
  const canonical = normalizeCanonicalPriceUnit(space.price_unit);
  if (canonical) return canonical;

  const hasCanonicalAmount =
    space.price_amount != null && space.price_amount >= 0;

  if (space.price_per_hour != null && space.price_per_hour > 0) return "hour";
  if (space.price_per_month != null && space.price_per_month > 0) return "month";
  if (space.price_per_day != null && space.price_per_day > 0) return "day";

  if (hasCanonicalAmount) return null;

  const rental = space.booking_unit?.trim().toLowerCase();
  if (rental === "hour") return "hour";
  if (rental === "month") return "month";
  if (rental === "day") return "day";

  return null;
}

function resolveSpacePriceAmount(space) {
  if (space.price_amount != null && space.price_amount >= 0) return space.price_amount;
  const unit = resolveSpacePriceUnit(space);
  if (!unit || unit === "on_request") return null;
  if (unit === "hour") return space.price_per_hour ?? null;
  if (unit === "month") return space.price_per_month ?? null;
  if (unit === "day") return space.price_per_day ?? null;
  if (unit === "event") return null;
  return null;
}

function isEnquiryOnlyListing(space) {
  return space.public_listing_mode === "enquiry";
}

function resolveBrowsePriceFilterAmount(space, bookingUnitFilter = "all") {
  if (isEnquiryOnlyListing(space)) return "on_request";
  const priceUnit = resolveSpacePriceUnit(space);
  if (priceUnit === "on_request") return "on_request";
  if (bookingUnitFilter !== "all") {
    const rentalUnit = priceUnit === "event" ? "day" : priceUnit;
    if (rentalUnit && rentalUnit !== bookingUnitFilter) return null;
  }
  return resolveSpacePriceAmount(space);
}

function spaceMatchesBrowsePriceRange(space, minPrice, maxPrice, bookingUnitFilter = "all") {
  const price = resolveBrowsePriceFilterAmount(space, bookingUnitFilter);
  if (price === "on_request") return true;
  if (price == null) return false;
  return price >= minPrice && price <= maxPrice;
}

function getPublicBrowseEligibility(space) {
  const reasons = [];
  if (!space) return { eligible: false, reasons: ["Listing not found."] };
  if (space.status === "archived") reasons.push("Listing is archived.");
  if (space.public_listing_mode !== "enquiry" && space.public_listing_mode !== "live") {
    reasons.push("Public listing mode is hidden (not enquiry or live).");
  }
  if (space.public_listing_mode === "enquiry") {
    return { eligible: reasons.length === 0, reasons };
  }
  const priceUnit = resolveSpacePriceUnit(space);
  if (priceUnit === "on_request") {
    return { eligible: reasons.length === 0, reasons };
  }
  const amount = resolveSpacePriceAmount(space);
  if (amount == null || amount < 0) {
    reasons.push("Live listing has no resolvable public price.");
  }
  return { eligible: reasons.length === 0, reasons };
}

function isExplicitBrowsePriceFilter(input) {
  if (input.priceFilterApplied) return true;
  if (input.searchParams) {
    if (input.searchParams.get("min") !== null) return true;
    if (input.searchParams.get("max") !== null) return true;
  }
  return false;
}

// Live hourly listing with drifted booking_unit (regression: price save bug)
const driftedHourly = {
  public_listing_mode: "live",
  status: "active",
  price_amount: 500,
  price_unit: "hour",
  booking_unit: "day",
  price_per_hour: 500,
  price_per_day: null,
  price_per_month: null,
};

assert.equal(resolveSpacePriceAmount(driftedHourly), 500);
assert.equal(
  spaceMatchesBrowsePriceRange(driftedHourly, 0, 10000, "all"),
  true,
  "canonical price_amount must keep listing in browse range filter"
);
assert.equal(getPublicBrowseEligibility(driftedHourly).eligible, true);

// Legacy-only browse filter would have failed (price_per_day null while booking_unit day)
const legacyBrowseWouldHide =
  driftedHourly.booking_unit === "day" ? driftedHourly.price_per_day : null;
assert.equal(legacyBrowseWouldHide, null);

// Enquiry listings skip price filter
const enquiry = {
  public_listing_mode: "enquiry",
  status: "active",
  price_amount: null,
  price_unit: null,
  booking_unit: "day",
  price_per_hour: null,
  price_per_day: null,
  price_per_month: null,
};
assert.equal(spaceMatchesBrowsePriceRange(enquiry, 100, 500, "all"), true);
assert.equal(getPublicBrowseEligibility(enquiry).eligible, true);

// Hidden listing
const hidden = {
  public_listing_mode: "off",
  status: "active",
  price_amount: 100,
  price_unit: "day",
  booking_unit: "day",
  price_per_day: 100,
};
assert.equal(getPublicBrowseEligibility(hidden).eligible, false);

// Dal Josephat - Athletics: live daily price above default slider max must still browse
const athleticsLive = {
  public_listing_mode: "live",
  status: "active",
  price_amount: 38000,
  price_unit: "day",
  booking_unit: "day",
  price_per_hour: null,
  price_per_day: 38000,
  price_per_month: null,
};
assert.equal(getPublicBrowseEligibility(athleticsLive).eligible, true);
assert.equal(
  spaceMatchesBrowsePriceRange(athleticsLive, 0, 20000, "all"),
  false,
  "explicit default max should exclude high-priced listing"
);
assert.equal(
  isExplicitBrowsePriceFilter({
    minPrice: 0,
    maxPrice: 20000,
    bookingUnitFilter: "all",
    defaultMaxPrice: 20000,
  }),
  false,
  "default browse view must not treat slider max as an active filter"
);

assert.equal(
  isExplicitBrowsePriceFilter({
    minPrice: 0,
    maxPrice: 10000,
    bookingUnitFilter: "day",
    defaultMaxPrice: 20000,
    searchParams: new URLSearchParams("whenUnit=day&bookingUnit=day"),
  }),
  false,
  "rental period filter must not implicitly enable price filtering"
);

assert.equal(
  isExplicitBrowsePriceFilter({
    minPrice: 0,
    maxPrice: 20000,
    bookingUnitFilter: "all",
    defaultMaxPrice: 20000,
    searchParams: new URLSearchParams("max=20000"),
  }),
  true,
  "explicit max URL param must enable price filtering"
);

// Event-priced live listing with only canonical fields (no legacy price_per_*)
const eventPriced = {
  public_listing_mode: "live",
  status: "active",
  price_amount: 2500,
  price_unit: "event",
  booking_unit: "day",
  price_per_hour: null,
  price_per_day: null,
  price_per_month: null,
};

assert.equal(resolveSpacePriceUnit(eventPriced), "event");
assert.equal(resolveSpacePriceAmount(eventPriced), 2500);
assert.equal(getPublicBrowseEligibility(eventPriced).eligible, true);
assert.equal(
  spaceMatchesBrowsePriceRange(eventPriced, 2000, 3000, "all"),
  true,
  "event price amount must participate in browse price range filter"
);
assert.equal(
  resolveBrowsePriceFilterAmount(eventPriced, "hour"),
  null,
  "hour filter excludes event-priced listings"
);

// Event-priced with hourly rental period (Perdeberg-style)
const eventHourlyRental = {
  public_listing_mode: "live",
  status: "active",
  price_amount: 49500,
  price_unit: "event",
  booking_unit: "hour",
  price_per_hour: null,
  price_per_day: null,
  price_per_month: null,
};
assert.equal(resolveSpacePriceUnit(eventHourlyRental), "event");
assert.equal(resolveSpacePriceAmount(eventHourlyRental), 49500);
assert.equal(getPublicBrowseEligibility(eventHourlyRental).eligible, true);

console.log("test-public-browse-eligibility: ok");
