#!/usr/bin/env node
/**
 * Server-side booking + payment total tests for per-event pricing (no DB).
 * Mirrors lib/booking-pricing.ts + lib/booking-request-server.ts quantity rules.
 * Run: npm run test:booking-event-pricing
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

function resolveBookingUnitPrice(space, bookingUnit) {
  const priceUnit = resolveSpacePriceUnit(space);
  if (priceUnit === "on_request") return 0;
  if (priceUnit === "event") return resolveSpacePriceAmount(space) ?? 0;
  const canonical = resolveSpacePriceAmount(space);
  if (canonical != null && canonical >= 0 && priceUnit) return canonical;
  if (bookingUnit === "hour") return Number(space.price_per_hour || 0);
  if (bookingUnit === "month") return Number(space.price_per_month || 0);
  return Number(space.price_per_day || 0);
}

function isFlatEventBookingPrice(space) {
  return resolveSpacePriceUnit(space) === "event";
}

function calculateBookingQuantity(bookingUnit, startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  if (bookingUnit === "hour") return Math.max(0.5, diffMs / (1000 * 60 * 60));
  if (bookingUnit === "month") {
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonthExclusive = new Date(end.getFullYear(), end.getMonth(), 1);
    return Math.max(
      1,
      (endMonthExclusive.getFullYear() - startMonth.getFullYear()) * 12 +
        (endMonthExclusive.getMonth() - startMonth.getMonth())
    );
  }
  const days = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(days));
}

function computeBookingTotals(space, bookingUnit, quantity, startAt) {
  const unit = bookingUnit || space.booking_unit || "day";
  const unitPrice = resolveBookingUnitPrice(space, unit);
  if (unitPrice <= 0) return null;

  const platformFeePercent = Number(space.platform_fee_percent ?? 15);
  const depositMonths = Number(space.deposit_months ?? 0);
  const monthlyPaymentDay = Number(space.monthly_payment_day ?? 1);

  let totalPrice;
  let depositAmount = 0;
  let monthlyRent = 0;
  let initialPaymentAmount;
  let billedQuantity = quantity;

  if (isFlatEventBookingPrice(space)) {
    totalPrice = Number(unitPrice.toFixed(2));
    initialPaymentAmount = totalPrice;
    billedQuantity = 1;
  } else if (unit === "month") {
    monthlyRent = unitPrice;
    const monthsTotal = quantity;
    depositAmount = Number((monthlyRent * depositMonths).toFixed(2));
    initialPaymentAmount = Number((monthlyRent + depositAmount).toFixed(2));
    totalPrice = initialPaymentAmount;
  } else {
    totalPrice = Number((quantity * unitPrice).toFixed(2));
    initialPaymentAmount = totalPrice;
  }

  const platformFee = Number((totalPrice * (platformFeePercent / 100)).toFixed(2));
  const ownerAmount = Number((totalPrice - platformFee).toFixed(2));

  return {
    unitPrice,
    quantity: billedQuantity,
    totalPrice,
    depositAmount,
    monthlyRent,
    initialPaymentAmount,
    platformFee,
    ownerAmount,
  };
}

const eventSpace = {
  price_amount: 49500,
  price_unit: "event",
  booking_unit: "day",
  price_per_hour: null,
  price_per_day: null,
  price_per_month: null,
  platform_fee_percent: 15,
};

// 8-hour event window on a single day — still flat event price
const startAt = "2026-08-15T10:00:00.000Z";
const endAt = "2026-08-15T18:00:00.000Z";
const dayQuantity = calculateBookingQuantity("day", startAt, endAt);
assert.ok(dayQuantity >= 1, "calendar duration is computed for availability");

const eventTotals = computeBookingTotals(eventSpace, "day", dayQuantity, startAt);
assert.equal(eventTotals.totalPrice, 49500);
assert.equal(eventTotals.quantity, 1, "billed quantity is 1 for per-event");
assert.equal(eventTotals.platformFee, 7425);
assert.equal(eventTotals.ownerAmount, 42075);

// PayFast uses booking.total_price — same flat amount
const payfastAmount = Number(eventTotals.totalPrice.toFixed(2));
assert.equal(payfastAmount, 49500);

// Hourly rental period + per-event price
const hourlyEventSpace = { ...eventSpace, booking_unit: "hour" };
const hourQuantity = calculateBookingQuantity("hour", startAt, endAt);
assert.equal(hourQuantity, 8);
const hourlyEventTotals = computeBookingTotals(
  hourlyEventSpace,
  "hour",
  hourQuantity,
  startAt
);
assert.equal(hourlyEventTotals.totalPrice, 49500);

// Hourly pricing still multiplies
const hourly = {
  price_amount: 500,
  price_unit: "hour",
  booking_unit: "hour",
  price_per_hour: 500,
  platform_fee_percent: 15,
};
const hourlyTotals = computeBookingTotals(hourly, "hour", 4, startAt);
assert.equal(hourlyTotals.totalPrice, 2000);

// Daily pricing still multiplies
const daily = {
  price_amount: 1000,
  price_unit: "day",
  booking_unit: "day",
  price_per_day: 1000,
  platform_fee_percent: 15,
};
const multiDayTotals = computeBookingTotals(daily, "day", 3, startAt);
assert.equal(multiDayTotals.totalPrice, 3000);

// Event with null legacy prices still resolves from price_amount
assert.equal(resolveBookingUnitPrice(eventSpace, "day"), 49500);

console.log("test-booking-event-pricing: all assertions passed");
