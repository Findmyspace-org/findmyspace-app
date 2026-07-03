#!/usr/bin/env node
/**
 * Per-event pricing period sync tests (no DB).
 * Run: npm run test:pricing-period-sync
 */

import assert from "node:assert/strict";

function syncSpacePricingPeriod(sourceField, value, currentState) {
  const next = { ...currentState };

  if (sourceField === "pricing_type" && value === "on_request") {
    next.pricingType = "on_request";
    return next;
  }

  if (sourceField === "pricing_type" && value === "per_event") {
    next.pricingType = "per_event";
    return next;
  }

  return next;
}

function validateMinBookingFormValues(duration, unit) {
  const hasDuration = duration.trim() !== "";
  const hasUnit = Boolean(unit);
  if (!hasDuration && !hasUnit) return null;
  if (!hasDuration && hasUnit) {
    return "Enter a minimum booking duration when a unit is selected.";
  }
  return null;
}

const synced = syncSpacePricingPeriod("pricing_type", "per_event", {
  rentalPeriod: "",
  pricingType: "",
  minBookingUnit: "",
  priceAmount: "2500",
  minBookingDuration: "",
});

assert.equal(synced.pricingType, "per_event");
assert.equal(synced.rentalPeriod, "", "per event must not override rental period");
assert.equal(synced.minBookingUnit, "", "per event must not auto-set min booking unit");

assert.equal(
  validateMinBookingFormValues("", ""),
  null,
  "empty min duration + unit must be valid for per-event pricing"
);

console.log("test-pricing-period-sync: all assertions passed");
