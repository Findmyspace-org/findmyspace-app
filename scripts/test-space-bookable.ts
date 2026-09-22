#!/usr/bin/env node
/**
 * Explicit spaces.is_bookable as the NEW-booking switch.
 * Does not write production data. Run: npm run test:space-bookable
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bookableSpaceError,
  isExplicitBookableFlag,
  isListingLiveForExistingBookings,
  isSpaceBookable,
  SPACE_NOT_ACCEPTING_BOOKINGS_ERROR,
} from "../lib/listing-lifecycle";
import { resolveOrganisationBookingReadiness } from "../lib/access/organisation-booking-readiness";
import { validateBookingForPayFastInitiate } from "../lib/payfast-initiate-shared";
import { assertSpaceBookableForPayment } from "../lib/booking-guards";

const PGH_ORG = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const PGH_PROPERTY = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";

function liveBookable(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    public_listing_mode: "live",
    is_bookable: true,
    ...overrides,
  };
}

const eligibleOrg = {
  organisationId: "org-1",
  organisationStatus: "active",
  organisationArchivedAt: null,
  verificationStatus: "verified",
  commercialProfileExists: true,
  beneficiary: {
    type: "organisation" as const,
    userId: null,
    organisationId: "org-1",
  },
};

function newBookingAllowed(space: Record<string, unknown>, orgReady: boolean) {
  return isSpaceBookable(space) && orgReady;
}

// A. active + live + is_bookable true + eligible org → allowed
{
  const space = liveBookable();
  assert.equal(isSpaceBookable(space), true);
  assert.equal(bookableSpaceError(space), null);
  assert.equal(resolveOrganisationBookingReadiness(eligibleOrg).ok, true);
  assert.equal(
    newBookingAllowed(space, resolveOrganisationBookingReadiness(eligibleOrg).ok),
    true
  );
}

// B. active + live + is_bookable false → denied
{
  const space = liveBookable({ is_bookable: false });
  assert.equal(isSpaceBookable(space), false);
  assert.equal(bookableSpaceError(space), SPACE_NOT_ACCEPTING_BOOKINGS_ERROR);
}

// C. missing / null / undefined is_bookable → fail closed
{
  assert.equal(isExplicitBookableFlag(true), true);
  assert.equal(isExplicitBookableFlag(false), false);
  assert.equal(isExplicitBookableFlag(null), false);
  assert.equal(isExplicitBookableFlag(undefined), false);
  assert.equal(isExplicitBookableFlag("true"), false);
  assert.equal(isSpaceBookable({ status: "active", public_listing_mode: "live" }), false);
  assert.equal(
    isSpaceBookable({
      status: "active",
      public_listing_mode: "live",
      is_bookable: null,
    }),
    false
  );
  assert.equal(isSpaceBookable("active"), false);
  assert.equal(isSpaceBookable(null), false);
  assert.equal(isSpaceBookable(undefined), false);
}

// D. enquiry + is_bookable true → paid booking denied
{
  assert.equal(
    isSpaceBookable(liveBookable({ public_listing_mode: "enquiry" })),
    false
  );
}

// E. off + is_bookable true → denied
{
  assert.equal(
    isSpaceBookable(liveBookable({ public_listing_mode: "off" })),
    false
  );
}

// F. non-active status + live + bookable → denied
{
  assert.equal(isSpaceBookable(liveBookable({ status: "paused" })), false);
  assert.equal(isSpaceBookable(liveBookable({ status: "draft" })), false);
}

// G. organisation verified, bank pending is not part of this helper — booking allowed
{
  const ready = resolveOrganisationBookingReadiness(eligibleOrg);
  assert.equal(ready.ok, true);
  assert.equal(isSpaceBookable(liveBookable()), true);
}

// H. unverified organisation → paid booking denied (separate commercial message)
{
  const unverified = resolveOrganisationBookingReadiness({
    ...eligibleOrg,
    verificationStatus: "pending",
  });
  assert.equal(unverified.ok, false);
  if (!unverified.ok) {
    assert.match(unverified.message, /verifies it/);
  }
}

// I. personal listing uses the same explicit is_bookable rule
{
  assert.equal(isSpaceBookable(liveBookable()), true);
  assert.equal(isSpaceBookable(liveBookable({ is_bookable: false })), false);
}

// J. existing approved booking may still pay after is_bookable=false
{
  const result = validateBookingForPayFastInitiate(
    {
      id: "booking-1",
      renter_id: "renter-1",
      owner_id: null,
      status: "accepted_awaiting_payment",
      payment_status: "awaiting_payment",
      total_price: 500,
      space_id: "space-1",
    },
    "paused"
  );
  assert.equal(result.ok, true);
  assert.equal(
    assertSpaceBookableForPayment({
      status: "active",
      public_listing_mode: "live",
      is_bookable: false,
    }).ok,
    true
  );
}

// K. existing-booking live check does not require is_bookable
{
  assert.equal(
    isListingLiveForExistingBookings({
      status: "active",
      public_listing_mode: "live",
    }),
    true
  );
  assert.equal(
    isListingLiveForExistingBookings({
      status: "paused",
      public_listing_mode: "off",
    }),
    false
  );
}

// L / M source: server create selects is_bookable; browser cannot supply authority
{
  const create = readFileSync("lib/booking-request-server.ts", "utf8");
  assert.match(create, /is_bookable/);
  assert.match(create, /bookableSpaceError\(space\)/);
  const lifecycle = readFileSync("lib/listing-lifecycle.ts", "utf8");
  assert.match(lifecycle, /This space is not currently accepting bookings/);
  const request = readFileSync("app/api/bookings/request/route.ts", "utf8");
  assert.match(request, /createBookingRequestServer/);
  assert.doesNotMatch(request, /from\("bookings"\)[\s\S]{0,200}\.insert\(/);
}

// N. toggle remains admin-matrix capability; host listing PATCH does not add is_bookable
{
  const statusApi = readFileSync("app/api/admin/spaces/[id]/status/route.ts", "utf8");
  assert.match(statusApi, /applyAdminMatrixBookableChange/);
  assert.match(statusApi, /requireAdminApi/);
  const hostListing = readFileSync("app/api/host/listings/[id]/route.ts", "utf8");
  assert.match(hostListing, /requireManagedListingApi/);
  assert.doesNotMatch(hostListing, /is_bookable/);
}

// O. public UI live + false → unavailable, not Book CTA
{
  const publicPage = readFileSync("app/spaces/[id]/page.tsx", "utf8");
  assert.match(publicPage, /Booking unavailable/);
  assert.match(publicPage, /Not currently accepting bookings/);
  assert.match(publicPage, /isBookableListingStatus\(space\)/);
  const columns = readFileSync("lib/public-space-columns.ts", "utf8");
  assert.match(columns, /is_bookable/);
  const form = readFileSync("app/components/BookingRequestForm.tsx", "utf8");
  assert.match(form, /is_bookable/);
}

// P. PGH fixture ids must not be mutated by this change
{
  const changed = [
    "lib/listing-lifecycle.ts",
    "lib/booking-request-server.ts",
    "lib/payfast-initiate-shared.ts",
    "app/api/payfast/initiate/route.ts",
  ];
  for (const file of changed) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, new RegExp(PGH_ORG));
    assert.doesNotMatch(source, new RegExp(PGH_PROPERTY));
    assert.doesNotMatch(source, /UPDATE public\.spaces SET is_bookable/);
  }
}

{
  const payfastShared = readFileSync("lib/payfast-initiate-shared.ts", "utf8");
  assert.match(payfastShared, /Intentionally does NOT re-check current/);
  assert.match(payfastShared, /spaces\.is_bookable/);
  const initiate = readFileSync("app/api/payfast/initiate/route.ts", "utf8");
  assert.doesNotMatch(initiate, /is_bookable/);
  assert.doesNotMatch(initiate, /assertSpaceBookableForPayment/);
}

{
  const hostResponse = readFileSync("lib/booking-host-response.ts", "utf8");
  assert.match(hostResponse, /isListingLiveForExistingBookings/);
  assert.doesNotMatch(hostResponse, /isSpaceBookable/);
}

console.log("test-space-bookable: ok");
