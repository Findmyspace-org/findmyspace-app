#!/usr/bin/env node
/**
 * Public price display tests (mirrors lib/space-pricing.ts).
 * Run: npm run test:space-price-display
 */

import assert from "node:assert/strict";

const PRICE_UNIT_DISPLAY = {
  hour: "per hour",
  day: "per day",
  event: "per event",
  month: "per month",
};

const PRICE_UNIT_SET = new Set(["hour", "day", "event", "month", "on_request"]);

function isSpacePriceUnit(value) {
  return Boolean(value && PRICE_UNIT_SET.has(value));
}

function normalizeCanonicalPriceUnit(value) {
  if (value == null || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "per_event" || normalized === "per-event") return "event";
  if (isSpacePriceUnit(normalized)) return normalized;
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
  if (space.price_amount != null && space.price_amount >= 0) {
    return space.price_amount;
  }

  const unit = resolveSpacePriceUnit(space);
  if (!unit || unit === "on_request") return null;
  if (unit === "hour") return space.price_per_hour ?? null;
  if (unit === "month") return space.price_per_month ?? null;
  if (unit === "day") return space.price_per_day ?? null;
  if (unit === "event") return null;
  return null;
}

function formatPriceAmount(amount) {
  const rounded = Math.round(amount);
  return `R${rounded.toLocaleString("en-ZA")}`;
}

function formatSpacePriceDisplay(space) {
  const unit = resolveSpacePriceUnit(space);
  if (unit === "on_request") return "Price on request";

  const amount = resolveSpacePriceAmount(space);
  if (amount != null && amount >= 0) {
    if (unit) {
      return `${formatPriceAmount(amount)} ${PRICE_UNIT_DISPLAY[unit]}`;
    }
    return formatPriceAmount(amount);
  }

  return "Price not set";
}

// Perdeberg: hourly rental + per-event price
const perdeberg = {
  price_amount: 49500,
  price_unit: "event",
  booking_unit: "hour",
  price_per_hour: null,
  price_per_day: null,
  price_per_month: null,
};
assert.equal(formatSpacePriceDisplay(perdeberg), "R49 500 per event");

// Whitespace / alias on price_unit
assert.equal(
  formatSpacePriceDisplay({ ...perdeberg, price_unit: "  EVENT  " }),
  "R49 500 per event"
);
assert.equal(
  formatSpacePriceDisplay({ ...perdeberg, price_unit: "per_event" }),
  "R49 500 per event"
);

// Daily pricing unchanged
assert.equal(
  formatSpacePriceDisplay({
    price_amount: 38000,
    price_unit: "day",
    booking_unit: "day",
    price_per_day: 38000,
  }),
  "R38 000 per day"
);

// Hourly pricing unchanged
assert.equal(
  formatSpacePriceDisplay({
    price_amount: 500,
    price_unit: "hour",
    booking_unit: "hour",
    price_per_hour: 500,
  }),
  "R500 per hour"
);

// Canonical price_unit must not be overridden by booking_unit
assert.equal(resolveSpacePriceUnit(perdeberg), "event");
assert.notEqual(resolveSpacePriceUnit(perdeberg), "hour");

// Drifted hourly: price_unit hour wins over booking_unit day
const driftedHourly = {
  price_amount: 500,
  price_unit: "hour",
  booking_unit: "day",
  price_per_hour: 500,
};
assert.equal(formatSpacePriceDisplay(driftedHourly), "R500 per hour");

// Canonical amount without price_unit: no wrong "per hour" from booking_unit
const amountOnly = {
  price_amount: 49500,
  price_unit: null,
  booking_unit: "hour",
  price_per_hour: null,
  price_per_day: null,
  price_per_month: null,
};
assert.equal(formatSpacePriceDisplay(amountOnly), "R49 500");
assert.equal(resolveSpacePriceUnit(amountOnly), null);

// Legacy-only hourly still works
assert.equal(
  formatSpacePriceDisplay({
    price_amount: null,
    price_unit: null,
    booking_unit: "hour",
    price_per_hour: 750,
  }),
  "R750 per hour"
);

// Price on request
assert.equal(
  formatSpacePriceDisplay({ price_unit: "on_request", price_amount: null }),
  "Price on request"
);

console.log("test-space-price-display: all assertions passed");
