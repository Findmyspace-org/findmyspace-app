import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { quoteApprovalDiscount } from "../lib/approval-discount";
import { publicOccupiedIntervals } from "../lib/public-availability";

const percent = quoteApprovalDiscount({
  originalRental: 6000,
  type: "percent",
  value: 20,
  platformFee: 900,
});
assert.equal(percent.ok, true);
if (percent.ok) {
  assert.equal(percent.discountAmount, 1200);
  assert.equal(percent.approvedRental, 4800);
  assert.equal(percent.platformFee, 720);
  assert.equal(percent.hostPayout, 4080);
}

const fixed = quoteApprovalDiscount({
  originalRental: 2000,
  type: "fixed",
  value: 500,
  platformFee: 300,
});
assert.equal(fixed.ok, true);
if (fixed.ok) {
  assert.equal(fixed.approvedRental, 1500);
  assert.equal(fixed.platformFee, 225);
}

for (const input of [
  { originalRental: 6000, type: "percent" as const, value: 100, platformFee: 900 },
  { originalRental: 6000, type: "fixed" as const, value: 5996, platformFee: 900 },
  { originalRental: 6000, type: "percent" as const, value: 101, platformFee: 900 },
  { originalRental: 6000, type: "fixed" as const, value: -10, platformFee: 900 },
  { originalRental: 0, type: "fixed" as const, value: 10, platformFee: 0 },
]) {
  const result = quoteApprovalDiscount(input);
  assert.equal(result.ok, false, JSON.stringify(input));
}

const intervals = publicOccupiedIntervals({
  bookings: [
    {
      id: "series",
      booking_unit: "recurring_hour",
      start_at: "2027-01-04T12:00:00.000Z",
      end_at: "2027-03-22T14:00:00.000Z",
      status: "confirmed",
      payment_status: "paid",
    },
  ],
  occurrences: [
    {
      id: "monday",
      booking_id: "series",
      start_at: "2027-01-04T12:00:00.000Z",
      end_at: "2027-01-04T14:00:00.000Z",
    },
  ],
  blocked: [],
  rules: [],
  exceptions: [],
  windowStart: new Date("2027-01-01T00:00:00.000Z"),
  windowEnd: new Date("2027-04-01T00:00:00.000Z"),
});
assert.equal(intervals.length, 1);
assert.equal(intervals[0].startAt, "2027-01-04T12:00:00.000Z");
assert.equal(intervals[0].endAt, "2027-01-04T14:00:00.000Z");

const form = readFileSync("app/components/BookingRequestForm.tsx", "utf8");
assert.match(form, /\/api\/spaces\/\$\{spaceId\}\/availability/);
assert.doesNotMatch(form, /describeAvailabilityRule/);
assert.match(form, /booking_unit !== "recurring_hour"/);

const approval = readFileSync("lib/booking-host-response.ts", "utf8");
assert.match(approval, /approve_booking_with_discount/);
assert.match(readFileSync("lib/booking-change-notice.ts", "utf8"), /BOOKING_EMAIL_MODE/);
assert.match(readFileSync("supabase/migrations/086_20261126_approval_discounts.sql", "utf8"), /exceptions_need_confirmation/);

execFileSync("bash", ["scripts/test-phase6-discounts-db.sh"], { stdio: "inherit" });
console.log("approval discount checks passed");
