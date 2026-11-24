/**
 * Phase 1 availability regression. Database cases use a local Postgres
 * instance and never connect to the FindMySpace project.
 *
 * Run: npm run test:availability-phase1
 */

import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import {
  RESERVING_BOOKING_STATUSES,
  availabilityLockKey,
  bookingStatusIsPending,
  bookingStatusReservesAvailability,
  intervalsOverlap,
} from "../lib/availability/intervals";
import { publicAvailabilityMessage } from "../lib/availability/messages";
import { computeBookingTotals } from "../lib/booking-pricing";
import { calculateBookingQuantity } from "../lib/booking-request-server";
import { isAwaitingGatewayPayment } from "../lib/finance-status";

const migration = readFileSync(
  "supabase/migrations/081_20261124_space_availability_guard.sql",
  "utf8"
);
const calendar = readFileSync("app/dashboard/calendar/page.tsx", "utf8");
const notify = readFileSync("app/api/payfast/notify/route.ts", "utf8");
const route = readFileSync(
  "app/api/host/spaces/[spaceId]/blocked-dates/route.ts",
  "utf8"
);

const ORG = "org-pgh";
const PROP = "prop-school";
const OTHER_PROP = "prop-other";
const SPACE = "space-hall";
const OTHER_SPACE = "space-field";
const USER = "user-host";

function grant(
  partial: Partial<OrganisationAccessGrant> &
    Pick<OrganisationAccessGrant, "role" | "status">
): OrganisationAccessGrant {
  return {
    organisationId: partial.organisationId ?? ORG,
    role: partial.role,
    propertyId: partial.propertyId ?? null,
    spaceId: partial.spaceId ?? null,
    status: partial.status,
  };
}

function ctx(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: USER,
    spaceId: SPACE,
    propertyId: PROP,
    organisationId: ORG,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "user",
    adminAccessDisabled: false,
    grants: [],
    ...overrides,
  };
}

function at(iso: string): Date {
  return new Date(iso);
}

assert.equal(
  intervalsOverlap(
    at("2026-06-01T08:00:00+02:00"),
    at("2026-06-01T11:00:00+02:00"),
    at("2026-06-01T11:00:00+02:00"),
    at("2026-06-01T12:00:00+02:00")
  ),
  false
);
assert.equal(
  intervalsOverlap(
    at("2026-06-01T08:00:00+02:00"),
    at("2026-06-01T11:00:00+02:00"),
    at("2026-06-01T10:00:00+02:00"),
    at("2026-06-01T10:30:00+02:00")
  ),
  true
);
assert.equal(
  intervalsOverlap(
    at("2026-06-02T23:00:00+02:00"),
    at("2026-06-03T01:00:00+02:00"),
    at("2026-06-03T00:30:00+02:00"),
    at("2026-06-03T02:00:00+02:00")
  ),
  true
);
assert.equal(
  intervalsOverlap(
    at("2026-06-02T23:00:00+02:00"),
    at("2026-06-03T01:00:00+02:00"),
    at("2026-06-03T01:00:00+02:00"),
    at("2026-06-03T02:00:00+02:00")
  ),
  false
);

for (const status of RESERVING_BOOKING_STATUSES) {
  assert.equal(bookingStatusReservesAvailability(status), true);
  assert.equal(bookingStatusIsPending(status), false);
  assert.match(migration, new RegExp(`'${status}'`));
}
assert.equal(bookingStatusReservesAvailability("pending_owner"), false);
assert.equal(bookingStatusReservesAvailability("pending"), false);
assert.equal(bookingStatusReservesAvailability("expired"), false);
assert.equal(bookingStatusReservesAvailability("declined"), false);
assert.equal(availabilityLockKey(SPACE), `booking-space:${SPACE}`);

const cleaned = publicAvailabilityMessage(
  "space_unavailable: Those dates or times are not available. Confirmed booking from 2026-06-01 08:00 to 2026-06-01 11:00 SAST."
);
assert.match(cleaned, /Confirmed booking from 2026-06-01 08:00/);
assert.equal(cleaned.includes("space_unavailable"), false);

const hourQty = calculateBookingQuantity(
  "hour",
  "2026-06-01T12:00:00.000Z",
  "2026-06-01T14:00:00.000Z"
);
assert.equal(hourQty, 2);
const hourTotals = computeBookingTotals(
  {
    price_amount: 250,
    price_unit: "hour",
    booking_unit: "hour",
    price_per_hour: 250,
    platform_fee_percent: 15,
  },
  "hour",
  hourQty,
  "2026-06-01T12:00:00.000Z"
);
assert.ok(hourTotals);
assert.equal(hourTotals.totalPrice, 500);
assert.equal(hourTotals.platformFee, 75);
assert.equal(hourTotals.ownerAmount, 425);

const dayQty = calculateBookingQuantity(
  "day",
  "2026-06-01T00:00:00.000Z",
  "2026-06-03T00:00:00.000Z"
);
assert.equal(dayQty, 2);
const dayTotals = computeBookingTotals(
  {
    price_amount: 1500,
    price_unit: "day",
    booking_unit: "day",
    price_per_day: 1500,
    platform_fee_percent: 15,
  },
  "day",
  dayQty,
  "2026-06-01T00:00:00.000Z"
);
assert.ok(dayTotals);
assert.equal(dayTotals.totalPrice, 3000);

const monthQty = calculateBookingQuantity(
  "month",
  "2026-06-01T00:00:00.000Z",
  "2026-07-01T00:00:00.000Z"
);
assert.equal(monthQty, 1);
const monthTotals = computeBookingTotals(
  {
    price_amount: 8000,
    price_unit: "month",
    booking_unit: "month",
    price_per_month: 8000,
    deposit_months: 1,
    monthly_payment_day: 1,
    platform_fee_percent: 15,
  },
  "month",
  monthQty,
  "2026-06-01T00:00:00.000Z"
);
assert.ok(monthTotals);
assert.equal(monthTotals.monthlyRent, 8000);
assert.equal(monthTotals.depositAmount, 8000);
assert.equal(monthTotals.totalPrice, 16000);
assert.equal(monthTotals.monthsTotal, 1);
assert.equal(monthTotals.monthsPaid, 1);

const eventTotals = computeBookingTotals(
  {
    price_amount: 5000,
    price_unit: "event",
    booking_unit: "day",
    platform_fee_percent: 15,
  },
  "day",
  3,
  "2026-06-01T00:00:00.000Z"
);
assert.ok(eventTotals);
assert.equal(eventTotals.quantity, 1);
assert.equal(eventTotals.totalPrice, 5000);

const onRequest = computeBookingTotals(
  {
    price_amount: null,
    price_unit: "on_request",
    booking_unit: "day",
  },
  "day",
  1,
  "2026-06-01T00:00:00.000Z"
);
assert.equal(onRequest, null);

assert.equal(
  isAwaitingGatewayPayment({
    status: "accepted_awaiting_payment",
    payment_status: "awaiting_payment",
  }),
  true
);
assert.equal(
  isAwaitingGatewayPayment({
    status: "expired",
    payment_status: "unpaid",
  }),
  false
);
assert.equal(
  isAwaitingGatewayPayment({
    status: "paid_confirmed",
    payment_status: "paid",
  }),
  false
);
assert.match(notify, /\.eq\("status", "accepted_awaiting_payment"\)/);
assert.match(notify, /\.eq\("payment_status", "awaiting_payment"\)/);
assert.doesNotMatch(migration, /payfast/i);

const orgAdmin = computeAccess(
  ctx({
    grants: [grant({ role: "org_admin", status: "active" })],
  })
);
assert.equal(orgAdmin.canEditSpace, true);
const otherSpace = computeAccess(
  ctx({
    spaceId: OTHER_SPACE,
    grants: [grant({ role: "org_admin", status: "active" })],
  })
);
assert.equal(otherSpace.canEditSpace, true);

const propertyManager = computeAccess(
  ctx({
    grants: [
      grant({
        role: "property_manager",
        status: "active",
        propertyId: PROP,
      }),
    ],
  })
);
assert.equal(propertyManager.canEditSpace, true);
const otherProperty = computeAccess(
  ctx({
    propertyId: OTHER_PROP,
    spaceId: OTHER_SPACE,
    grants: [
      grant({
        role: "property_manager",
        status: "active",
        propertyId: PROP,
      }),
    ],
  })
);
assert.equal(otherProperty.canEditSpace, false);

const spaceManager = computeAccess(
  ctx({
    grants: [
      grant({
        role: "space_manager",
        status: "active",
        propertyId: PROP,
        spaceId: SPACE,
      }),
    ],
  })
);
assert.equal(spaceManager.canEditSpace, true);
assert.equal(spaceManager.canManageBooking, true);
const otherManagedSpace = computeAccess(
  ctx({
    spaceId: OTHER_SPACE,
    grants: [
      grant({
        role: "space_manager",
        status: "active",
        propertyId: PROP,
        spaceId: SPACE,
      }),
    ],
  })
);
assert.equal(otherManagedSpace.canEditSpace, false);

const renter = computeAccess(ctx());
assert.equal(renter.canEditSpace, false);
assert.equal(renter.canManageBooking, false);

assert.match(route, /requireManagedListingApi/);
assert.match(route, /insert_blocked_date/);
assert.match(route, /delete_blocked_date/);
assert.match(calendar, /\/blocked-dates/);
assert.equal((calendar.match(/from\("blocked_dates"\)/g) || []).length, 1);

assert.match(
  migration,
  /pg_catalog\.hashtext\('booking-space:' \|\| p_space_id::text\)/
);
assert.match(
  migration,
  /pg_catalog\.hashtext\('booking-space:' \|\| b\.space_id::text\)/
);
assert.match(migration, /assert_space_interval_available/);
assert.doesNotMatch(migration, /21cf12c3-3235-4cd3-8106-801d120dc7b5/);
assert.doesNotMatch(migration, /b13d1be1-0bc6-437d-8deb-d43b881fe5cb/);
assert.doesNotMatch(migration, /mvandermerwe@paarlgirlshigh\.com/i);
assert.doesNotMatch(migration, /UPDATE public\.profiles/i);
assert.doesNotMatch(migration, /INSERT INTO public\.organisation_access/i);

const pghGrant = execSync(
  "git show cursor/pgh-org-admin-access-bc94:supabase/migrations/080_20261124_pgh_org_admin_grant.sql",
  { encoding: "utf8" }
);
assert.match(pghGrant, /mvandermerwe@paarlgirlshigh\.com/);
assert.match(pghGrant, /21cf12c3-3235-4cd3-8106-801d120dc7b5/);

execFileSync("bash", ["scripts/test-availability-phase1-db.sh"], {
  stdio: "inherit",
});

console.log("availability phase 1 checks passed");
