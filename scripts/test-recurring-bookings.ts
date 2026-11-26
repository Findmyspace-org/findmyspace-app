import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { calculateBookingCommercials } from "../lib/commercial-calculator";
import { buildInitialBookingCharges } from "../lib/invoice";
import { validatePayFastPayableAmount } from "../lib/payfast-amount";
import { computeAccess } from "../lib/access/compute-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import {
  quoteRecurringBooking,
  resolveRecurringHourlyRate,
  sessionHours,
} from "../lib/recurring-bookings";

const weekly = quoteRecurringBooking({
  hourlyRate: 250,
  pattern: {
    frequency: "weekly",
    weekdays: [1],
    localStart: "14:00",
    localEnd: "16:00",
    startsOn: "2027-01-04",
    endsOn: "2027-03-22",
    excludedDates: [],
  },
});
assert.equal(weekly.ok, true);
if (!weekly.ok) throw new Error(weekly.error);
assert.equal(weekly.quote.includedCount, 12);
assert.equal(weekly.quote.hoursPerSession, 2);
assert.equal(weekly.quote.totalHours, 24);
assert.equal(weekly.quote.sessionPrice, 500);
assert.equal(weekly.quote.rentalSubtotal, 6000);
assert.equal(weekly.quote.sessions[0].date, "2027-01-04");
assert.equal(weekly.quote.sessions.at(-1)?.date, "2027-03-22");
assert.equal(
  weekly.quote.sessions.some((session) => session.date === "2027-01-05"),
  false
);

const excluded = quoteRecurringBooking({
  hourlyRate: 250,
  pattern: { ...weekly.quote.pattern, excludedDates: ["2027-02-01"] },
});
assert.equal(excluded.ok, true);
if (!excluded.ok) throw new Error(excluded.error);
assert.equal(excluded.quote.includedCount, 11);
assert.equal(excluded.quote.rentalSubtotal, 5500);

const fortnightly = quoteRecurringBooking({
  hourlyRate: 100,
  pattern: {
    frequency: "fortnightly",
    weekdays: [2, 4],
    localStart: "09:00",
    localEnd: "12:00",
    startsOn: "2027-01-07",
    endsOn: "2027-02-04",
    excludedDates: [],
  },
});
assert.equal(fortnightly.ok, true);
if (!fortnightly.ok) throw new Error(fortnightly.error);
assert.deepEqual(
  fortnightly.quote.sessions.map((session) => session.date),
  ["2027-01-07", "2027-01-19", "2027-01-21", "2027-02-02", "2027-02-04"]
);

const daily = quoteRecurringBooking({
  hourlyRate: 100,
  pattern: {
    frequency: "daily",
    weekdays: [],
    localStart: "08:00",
    localEnd: "10:00",
    startsOn: "2027-01-04",
    endsOn: "2027-01-08",
    excludedDates: [],
  },
});
assert.equal(daily.ok, true);
if (!daily.ok) throw new Error(daily.error);
assert.equal(daily.quote.includedCount, 5);

assert.equal(
  quoteRecurringBooking({
    hourlyRate: 250,
    pattern: { ...weekly.quote.pattern, endsOn: "2029-01-05" },
  }).ok,
  false
);
assert.equal(
  quoteRecurringBooking({
    hourlyRate: 250,
    pattern: { ...weekly.quote.pattern, endsOn: "2029-01-04" },
  }).ok,
  true
);
assert.equal(sessionHours("14:15", "16:15"), null);
assert.equal(sessionHours("08:00", "21:00"), 13);
assert.equal(
  quoteRecurringBooking({
    hourlyRate: 250,
    pattern: { ...weekly.quote.pattern, localStart: "08:00", localEnd: "21:00", endsOn: "2027-01-04" },
  }).ok,
  false
);
assert.equal(
  quoteRecurringBooking({
    hourlyRate: 250,
    minHours: 2,
    pattern: { ...weekly.quote.pattern, localEnd: "15:00", endsOn: "2027-01-04" },
  }).ok,
  false
);
assert.equal(
  quoteRecurringBooking({
    hourlyRate: 250,
    maxOccurrences: 2,
    pattern: { ...weekly.quote.pattern, endsOn: "2027-01-25" },
  }).ok,
  false
);

const tampered = quoteRecurringBooking({
  hourlyRate: 250,
  pattern: { ...weekly.quote.pattern, excludedDates: ["2027-01-06"] },
});
assert.equal(tampered.ok, false);

const legacyRate = resolveRecurringHourlyRate({
  flexibleRates: [],
  pricePerHour: 80,
  priceUnit: "month",
  priceAmount: 8000,
});
assert.equal(legacyRate.ok && legacyRate.amount, 80);
const flexibleRate = resolveRecurringHourlyRate({
  flexibleRates: [
    { period: "year", amount: 65000 },
    { period: "hour", amount: 250 },
  ],
});
assert.equal(flexibleRate.ok && flexibleRate.amount, 250);
assert.equal(
  resolveRecurringHourlyRate({
    flexibleRates: [{ period: "year", amount: 65000 }],
  }).ok,
  false
);
assert.equal(resolveRecurringHourlyRate({ flexibleRates: [] }).ok, false);

const commercials = calculateBookingCommercials(6000, {
  model: "commission",
  commissionPercent: 15,
  transactionFeePercent: 0,
  accountingMode: "legacy_combined",
});
assert.equal(commercials.grossAmount, 6000);
assert.equal(commercials.totalFindmyspaceFee, 900);
assert.equal(commercials.hostEarnings, 5100);
const charges = buildInitialBookingCharges({
  bookingId: "00000000-0000-4000-8000-000000000099",
  bookingUnit: "recurring_hour",
  totalPrice: 6000,
  startAt: "2027-01-04T12:00:00.000Z",
  endAt: "2027-03-22T14:00:00.000Z",
});
assert.equal(charges.length, 1);
assert.equal(charges[0].charge_type, "booking_total");
assert.equal(charges[0].amount, 6000);
assert.equal(validatePayFastPayableAmount(6000).ok, true);

const server = readFileSync("lib/booking-request-server.ts", "utf8");
assert.match(server, /attach_recurring_series/);
assert.match(server, /pricing_mode: "recurring"/);
assert.doesNotMatch(server, /payload\.totalPrice/);
assert.doesNotMatch(server, /payload\.occurrences/);
assert.match(readFileSync("app/dev/layout.tsx", "utf8"), /VERCEL_ENV === "production"/);

const PGH_ORG = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const PGH_PROPERTY = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";
const PGH_SPACES = [
  "9f9f8700-0fa2-4086-87d7-7a58e1b2ff18",
  "cd1ebdff-0259-4185-8a0c-ac2892f03778",
  "2add6853-3b32-450e-a4ba-42c0b6e5f47f",
  "d6eb8542-f89f-42a7-80b8-cebf15999e18",
  "a3fd1477-bb1d-4f2a-a42f-c36751c6e1ea",
  "c2196a2e-6432-4765-842f-8cff51aca88e",
  "070e8909-5e61-49ad-86d9-f6084a6ee2b9",
  "09c75d46-4eb0-4b6c-aaec-21f8b0cd9cd8",
];

function ctx(spaceId: string, grants: OrganisationAccessGrant[]): AccessContext {
  return {
    userId: "tester",
    spaceId,
    propertyId: PGH_PROPERTY,
    organisationId: PGH_ORG,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "user",
    adminAccessDisabled: false,
    grants,
  };
}

for (const spaceId of PGH_SPACES) {
  assert.equal(
    computeAccess(
      ctx(spaceId, [
        {
          organisationId: PGH_ORG,
          role: "org_admin",
          propertyId: null,
          spaceId: null,
          status: "active",
        },
      ])
    ).canEditSpace,
    true
  );
}
assert.equal(
  computeAccess(
    ctx(PGH_SPACES[0], [
      {
        organisationId: PGH_ORG,
        role: "property_manager",
        propertyId: PGH_PROPERTY,
        spaceId: null,
        status: "active",
      },
    ])
  ).canEditSpace,
  true
);
assert.equal(
  computeAccess(
    ctx(PGH_SPACES[0], [
      {
        organisationId: PGH_ORG,
        role: "property_manager",
        propertyId: "11111111-1111-4111-8111-111111111111",
        spaceId: null,
        status: "active",
      },
    ])
  ).canEditSpace,
  false
);
assert.equal(
  computeAccess(
    ctx(PGH_SPACES[1], [
      {
        organisationId: PGH_ORG,
        role: "space_manager",
        propertyId: PGH_PROPERTY,
        spaceId: PGH_SPACES[0],
        status: "active",
      },
    ])
  ).canEditSpace,
  false
);
assert.equal(
  computeAccess(
    ctx(PGH_SPACES[0], [
      {
        organisationId: PGH_ORG,
        role: "space_manager",
        propertyId: PGH_PROPERTY,
        spaceId: PGH_SPACES[0],
        status: "active",
      },
    ])
  ).canEditSpace,
  true
);
const legacyOwner = computeAccess({
  ...ctx(PGH_SPACES[0], []),
  userId: "owner",
  spaceOwnerId: "owner",
});
assert.equal(legacyOwner.canEditSpace, true);
assert.equal(computeAccess(ctx(PGH_SPACES[0], [])).canEditSpace, false);

execFileSync("bash", ["scripts/test-phase4-recurring-db.sh"], { stdio: "inherit" });
console.log("recurring booking checks passed");
