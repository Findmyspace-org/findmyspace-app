#!/usr/bin/env node
/**
 * Booking approval discount math (no DB).
 * Run: npm run test:booking-approval-discount
 */

import assert from "node:assert/strict";
import {
  computeBookingDiscount,
  feesFromFinalAmount,
  monthlySplitAfterDiscount,
  parseApproverDiscountBody,
  redistributePendingChargesToFinal,
  resolveOriginalBookingAmount,
  roundMoney,
} from "../lib/booking-discount";
import { buildPaymentNeededCopy } from "../lib/communication-copy";
import { validateBookingForPayFastInitiate } from "../lib/payfast-initiate-shared";

function expectComputed(
  label: string,
  input: Parameters<typeof computeBookingDiscount>[0],
  expected: { original: number; discount: number; final: number }
) {
  const result = computeBookingDiscount(input);
  assert.ok(!("error" in result), `${label}: unexpected error ${JSON.stringify(result)}`);
  if ("error" in result) return;
  assert.equal(result.originalAmount, expected.original, `${label}: original`);
  assert.equal(result.discountAmount, expected.discount, `${label}: discount`);
  assert.equal(result.finalAmount, expected.final, `${label}: final`);
}

// TEST 1 — no discount
expectComputed("TEST 1 no discount", { originalAmount: 5000, type: null, value: null }, {
  original: 5000,
  discount: 0,
  final: 5000,
});

// TEST 2 — 10%
expectComputed("TEST 2 10%", { originalAmount: 5000, type: "percent", value: 10 }, {
  original: 5000,
  discount: 500,
  final: 4500,
});

// TEST 3 — fixed R1000
expectComputed("TEST 3 fixed R1000", { originalAmount: 5000, type: "fixed", value: 1000 }, {
  original: 5000,
  discount: 1000,
  final: 4000,
});

// TEST 4 — negotiated R3500
expectComputed(
  "TEST 4 negotiated R3500",
  { originalAmount: 5000, type: "negotiated", value: 3500 },
  { original: 5000, discount: 1500, final: 3500 }
);

// TEST 8 — 100%
expectComputed("TEST 8 100%", { originalAmount: 5000, type: "percent", value: 100 }, {
  original: 5000,
  discount: 5000,
  final: 0,
});

const fullDiscount = computeBookingDiscount({
  originalAmount: 5000,
  type: "percent",
  value: 100,
});
assert.ok(!("error" in fullDiscount));
if (!("error" in fullDiscount)) {
  assert.equal(fullDiscount.finalAmount, 0);
  const payfast = validateBookingForPayFastInitiate({
    id: "x",
    renter_id: "r",
    owner_id: "o",
    status: "accepted_awaiting_payment",
    payment_status: "awaiting_payment",
    total_price: fullDiscount.finalAmount,
    space_id: "s",
  });
  assert.equal(payfast.ok, false, "TEST 8: PayFast must reject R0");
}

// TEST 9 — historical null original_total_price
assert.equal(
  resolveOriginalBookingAmount({ original_total_price: null, total_price: 5000 }),
  5000,
  "TEST 9 historical original"
);
expectComputed(
  "TEST 9 historical then 10%",
  {
    originalAmount: resolveOriginalBookingAmount({
      original_total_price: null,
      total_price: 5000,
    }),
    type: "percent",
    value: 10,
  },
  { original: 5000, discount: 500, final: 4500 }
);

// TEST 10 — tampered client amounts ignored
const parsedTampered = parseApproverDiscountBody({
  discountType: "percent",
  discountValue: 10,
  original_amount: 1,
  originalAmount: 1,
  final_amount: 1,
  finalAmount: 1,
  discount_amount: 9999,
  discountAmount: 9999,
});
assert.equal(parsedTampered.ok, true);
if (parsedTampered.ok) {
  assert.equal(parsedTampered.type, "percent");
  assert.equal(parsedTampered.value, 10);
  const computed = computeBookingDiscount({
    originalAmount: 5000,
    type: parsedTampered.type,
    value: parsedTampered.value,
  });
  assert.ok(!("error" in computed));
  if (!("error" in computed)) {
    assert.equal(computed.finalAmount, 4500);
    assert.equal(computed.discountAmount, 500);
  }
}

assert.equal(parseApproverDiscountBody({ discountType: "nope" }).ok, false);
assert.ok("error" in computeBookingDiscount({ originalAmount: 5000, type: "percent", value: 101 }));
assert.ok("error" in computeBookingDiscount({ originalAmount: 5000, type: "fixed", value: 6000 }));
assert.ok("error" in computeBookingDiscount({ originalAmount: 5000, type: "negotiated", value: 6000 }));
assert.ok("error" in computeBookingDiscount({ originalAmount: 5000, type: "fixed", value: -1 }));

const zeroPercent = computeBookingDiscount({
  originalAmount: 5000,
  type: "percent",
  value: 0,
});
assert.ok(!("error" in zeroPercent));
if (!("error" in zeroPercent)) {
  assert.equal(zeroPercent.discountType, null);
  assert.equal(zeroPercent.discountAmount, 0);
  assert.equal(zeroPercent.finalAmount, 5000);
}

const fees = feesFromFinalAmount({
  originalAmount: 5000,
  finalAmount: 4000,
  storedPlatformFee: 750,
});
assert.equal(fees.platformFee, 600);
assert.equal(fees.ownerEarnings, 3400);

const monthSplit = monthlySplitAfterDiscount({
  monthlyRent: 4000,
  depositAmount: 1000,
  finalAmount: 3500,
});
assert.equal(monthSplit.monthlyRent, 3500);
assert.equal(monthSplit.depositAmount, 0);

const monthSplit2 = monthlySplitAfterDiscount({
  monthlyRent: 4000,
  depositAmount: 1000,
  finalAmount: 4500,
});
assert.equal(monthSplit2.monthlyRent, 4000);
assert.equal(monthSplit2.depositAmount, 500);

const chargePatches = redistributePendingChargesToFinal(
  [
    { id: "rent", charge_type: "first_month_rent", amount: 4000, status: "pending" },
    { id: "dep", charge_type: "deposit", amount: 1000, status: "pending" },
  ],
  3500
);
assert.equal(chargePatches.find((p) => p.id === "rent")?.amount, 3500);
assert.equal(chargePatches.find((p) => p.id === "dep")?.amount, 0);

const totalPatch = redistributePendingChargesToFinal(
  [{ id: "t", charge_type: "booking_total", amount: 5000, status: "pending" }],
  4500
);
assert.equal(totalPatch[0]?.amount, 4500);

assert.equal(roundMoney(10.1), 10.1);
assert.equal(roundMoney(10.129), 10.13);

const copyNoDiscount = buildPaymentNeededCopy({
  spaceTitle: "Hall",
  totalPrice: 5000,
});
const noDiscountHtml = copyNoDiscount.emailBodyLines
  .filter((line): line is { html: string } => typeof line === "object" && line != null && "html" in line)
  .map((line) => line.html)
  .join("\n");
assert.equal(noDiscountHtml.includes("Discount"), false);

const copyDiscount = buildPaymentNeededCopy({
  spaceTitle: "Hall",
  totalPrice: 4500,
  originalPrice: 5000,
  discountAmount: 500,
});
const discountHtml = copyDiscount.emailBodyLines
  .filter((line): line is { html: string } => typeof line === "object" && line != null && "html" in line)
  .map((line) => line.html)
  .join("\n");
assert.match(discountHtml, /Original amount: R5000.00/);
assert.match(discountHtml, /Discount: R500.00/);
assert.match(discountHtml, /Amount due: R4500.00/);
assert.equal(discountHtml.includes("School partner"), false);

console.log("booking-approval-discount tests passed");
