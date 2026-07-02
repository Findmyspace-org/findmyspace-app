#!/usr/bin/env node
/**
 * Public browse eligibility + price filter tests (no DB).
 * Run: npm run test:public-browse
 */

import assert from "node:assert/strict";

function resolveSpacePriceUnit(space) {
  if (space.price_unit === "hour" || space.price_unit === "day" || space.price_unit === "event" || space.price_unit === "month" || space.price_unit === "on_request") {
    return space.price_unit;
  }
  const unit = space.booking_unit || "day";
  if (unit === "hour") return "hour";
  if (unit === "month") return "month";
  if (unit === "day") return "day";
  return null;
}

function resolveSpacePriceAmount(space) {
  if (space.price_amount != null && space.price_amount >= 0) return space.price_amount;
  const unit = resolveSpacePriceUnit(space);
  if (unit === "hour") return space.price_per_hour ?? null;
  if (unit === "month") return space.price_per_month ?? null;
  if (unit === "day" || unit === "event") return space.price_per_day ?? null;
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

console.log("test-public-browse-eligibility: ok");
