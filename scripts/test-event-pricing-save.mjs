#!/usr/bin/env node
/**
 * Event pricing save payload tests (no DB).
 * Run: npm run test:event-pricing-save
 */

import assert from "node:assert/strict";

const BOOKING_UNITS = new Set(["hour", "day", "month"]);

function normalizeRentalBookingUnit(value) {
  if (value && BOOKING_UNITS.has(value)) return value;
  return null;
}

function syncLegacyPriceFields(priceAmount, priceUnit, options = {}) {
  const rentalUnit = normalizeRentalBookingUnit(options.rentalBookingUnit);

  if (!priceUnit || priceUnit === "on_request") {
    return {
      booking_unit: rentalUnit ?? "day",
      price_per_hour: null,
      price_per_day: null,
      price_per_month: null,
    };
  }

  if (priceUnit === "event") {
    return {
      booking_unit: rentalUnit ?? "day",
      price_per_hour: null,
      price_per_day: null,
      price_per_month: null,
    };
  }

  if (priceUnit === "hour") {
    return {
      booking_unit: "hour",
      price_per_hour: priceAmount,
      price_per_day: null,
      price_per_month: null,
    };
  }

  if (priceUnit === "month") {
    return {
      booking_unit: "month",
      price_per_hour: null,
      price_per_day: null,
      price_per_month: priceAmount,
    };
  }

  return {
    booking_unit: "day",
    price_per_hour: null,
    price_per_day: priceAmount,
    price_per_month: null,
  };
}

function parseBookingUnitField(raw) {
  let v = typeof raw === "string" ? raw.trim() : null;
  if (v === "event") v = "day";
  if (v && !BOOKING_UNITS.has(v)) return { ok: false, error: "Invalid booking unit." };
  return { ok: true, value: v };
}

function formatSpacePriceDisplay(space) {
  if (space.price_unit === "on_request") return "Price on request";
  if (space.price_unit === "event" && space.price_amount != null) {
    return `R${space.price_amount.toLocaleString("en-ZA")} per event`;
  }
  return "Price not set";
}

// Admin save: daily rental + per event + no minimum duration
const adminPayload = {
  booking_unit: "day",
  price_amount: 49500,
  price_unit: "event",
  min_booking_hours: null,
  min_booking_days: null,
  min_booking_months: null,
};

const parsedUnit = parseBookingUnitField(adminPayload.booking_unit);
assert.equal(parsedUnit.ok, true);
assert.equal(parsedUnit.value, "day");

const legacy = syncLegacyPriceFields(adminPayload.price_amount, "event", {
  rentalBookingUnit: adminPayload.booking_unit,
});
assert.equal(legacy.booking_unit, "day");
assert.equal(legacy.price_per_day, null, "event price must not copy into price_per_day");
assert.equal(legacy.price_per_hour, null);
assert.equal(legacy.price_per_month, null);

// Reject invalid booking_unit values
const invalid = parseBookingUnitField("event");
assert.equal(invalid.ok, true);
assert.equal(invalid.value, "day", "legacy event booking_unit normalizes to day");

const reallyInvalid = parseBookingUnitField("weekly");
assert.equal(reallyInvalid.ok, false);

// Display uses price_unit, not booking_unit
const display = formatSpacePriceDisplay({
  price_amount: 49500,
  price_unit: "event",
  booking_unit: "day",
});
assert.ok(display.includes("per event"));
assert.ok(display.includes("49500") || display.includes("49 500") || display.includes("49,500"));

// Hourly rental period + per event pricing
const hourlyEvent = syncLegacyPriceFields(49500, "event", { rentalBookingUnit: "hour" });
assert.equal(hourlyEvent.booking_unit, "hour");
assert.equal(hourlyEvent.price_per_hour, null);

// Hourly pricing unchanged
const hourly = syncLegacyPriceFields(500, "hour", { rentalBookingUnit: "hour" });
assert.equal(hourly.booking_unit, "hour");
assert.equal(hourly.price_per_hour, 500);

console.log("test-event-pricing-save: all assertions passed");
