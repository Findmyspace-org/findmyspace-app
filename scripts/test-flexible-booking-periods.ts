/**
 * Phase 2 flexible booking periods. Local checks only.
 * Run: npm run test:flexible-booking
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { computeAccess } from "../lib/access/compute-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import { intervalsOverlap } from "../lib/availability/intervals";
import {
  addCalendarMonths,
  exclusiveEndDate,
  johannesburgLocalToUtc,
  parseCivilDate,
  storedBookingUnitForPeriod,
} from "../lib/booking-periods";
import { computeBookingTotals } from "../lib/booking-pricing";
import { calculateBookingCommercials } from "../lib/commercial-calculator";
import { legacyCombinedCommercialTerms } from "../lib/commercial-terms";
import { resolveFlexibleBooking } from "../lib/flexible-booking";

const migration = readFileSync(
  "supabase/migrations/082_20261125_space_booking_rates.sql",
  "utf8"
);
const createForm = readFileSync("app/components/SpaceForm.tsx", "utf8");
const editPage = readFileSync("app/spaces/[id]/edit/page.tsx", "utf8");
const renterForm = readFileSync("app/components/BookingRequestForm.tsx", "utf8");
const requestServer = readFileSync("lib/booking-request-server.ts", "utf8");

const exampleRates = [
  { period: "hour" as const, amount: 250 },
  { period: "day" as const, amount: 1500 },
  { period: "week" as const, amount: 6000 },
  { period: "month" as const, amount: 8000 },
  { period: "quarter" as const, amount: 20000 },
  { period: "year" as const, amount: 65000 },
];

function quote(
  period: (typeof exampleRates)[number]["period"],
  rates = exampleRates,
  extra: { quantity?: number; startDate?: string; startAt?: string; endAt?: string } = {}
) {
  const resolved = resolveFlexibleBooking({
    rates,
    ratePeriod: period,
    quantity: extra.quantity ?? 1,
    startDate: extra.startDate ?? "2026-03-15",
    startAt: extra.startAt,
    endAt: extra.endAt,
  });
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.quote;
}

const hourOnly = quote("hour", [{ period: "hour", amount: 250 }], {
  startAt: "2026-06-01T06:00:00.000Z",
  endAt: "2026-06-01T08:00:00.000Z",
});
assert.equal(hourOnly.quantity, 2);
assert.equal(hourOnly.totalPrice, 500);
assert.equal(hourOnly.storedBookingUnit, "hour");

const dayOnly = quote("day", [{ period: "day", amount: 1500 }], {
  quantity: 2,
  startDate: "2026-06-01",
});
assert.equal(dayOnly.totalPrice, 3000);
assert.equal(dayOnly.endLabel.startsWith("2026-06-03"), true);
assert.equal(dayOnly.storedBookingUnit, "flex_day");

const week = quote("week", [{ period: "week", amount: 6000 }], {
  quantity: 1,
  startDate: "2026-06-01",
});
assert.equal(week.totalPrice, 6000);
assert.equal(week.endLabel.startsWith("2026-06-08"), true);

const flexibleMonth = quote("month", [{ period: "month", amount: 8000 }], {
  quantity: 1,
  startDate: "2026-01-31",
});
assert.equal(flexibleMonth.totalPrice, 8000);
assert.equal(flexibleMonth.storedBookingUnit, "flex_month");
assert.equal(flexibleMonth.endLabel.startsWith("2026-02-28"), true);
assert.equal(flexibleMonth.unitPrice, 8000);

const leapMonth = exclusiveEndDate("month", parseCivilDate("2024-01-31")!, 1);
assert.equal(leapMonth.year, 2024);
assert.equal(leapMonth.month, 2);
assert.equal(leapMonth.day, 29);

const leapYear = exclusiveEndDate("year", parseCivilDate("2024-02-29")!, 1);
assert.equal(leapYear.year, 2025);
assert.equal(leapYear.month, 2);
assert.equal(leapYear.day, 28);

const quarter = quote("quarter", [{ period: "quarter", amount: 20000 }], {
  quantity: 1,
  startDate: "2026-01-31",
});
assert.equal(quarter.totalPrice, 20000);
assert.equal(quarter.endLabel.startsWith("2026-04-30"), true);
assert.equal(addCalendarMonths(parseCivilDate("2026-01-31")!, 3).day, 30);

const year = quote("year", [{ period: "year", amount: 65000 }], {
  quantity: 1,
  startDate: "2026-03-15",
});
assert.equal(year.totalPrice, 65000);
assert.equal(year.endLabel.startsWith("2027-03-15"), true);

for (const rate of exampleRates) {
  const one = quote(rate.period, exampleRates, {
    quantity: 1,
    startDate: "2026-03-15",
    startAt: "2026-06-01T06:00:00.000Z",
    endAt: "2026-06-01T07:00:00.000Z",
  });
  assert.equal(one.unitPrice, rate.amount);
  assert.equal(one.totalPrice, rate.amount);
}

const disabled = resolveFlexibleBooking({
  rates: [{ period: "day", amount: 1500 }],
  ratePeriod: "week",
  quantity: 1,
  startDate: "2026-06-01",
});
assert.equal(disabled.ok, false);

const legacyMonth = computeBookingTotals(
  {
    price_amount: 8000,
    price_unit: "month",
    booking_unit: "month",
    deposit_months: 1,
    monthly_payment_day: 1,
    platform_fee_percent: 15,
  },
  "month",
  1,
  "2026-01-31T00:00:00.000Z"
);
assert.ok(legacyMonth);
assert.equal(legacyMonth.totalPrice, 16000);
assert.equal(legacyMonth.depositAmount, 8000);
assert.equal(legacyMonth.monthsPaid, 1);

const terms = legacyCombinedCommercialTerms(15);
const yearFees = calculateBookingCommercials(year.totalPrice, {
  model: terms.model,
  commissionPercent: terms.commissionPercent,
  transactionFeePercent: terms.transactionFeePercent,
  accountingMode: terms.accountingMode,
});
assert.equal(yearFees.grossAmount, 65000);
assert.equal(yearFees.totalFindmyspaceFee, 9750);
assert.equal(yearFees.hostEarnings, 55250);

const longStart = johannesburgLocalToUtc(parseCivilDate("2026-01-31")!);
const longEnd = johannesburgLocalToUtc(exclusiveEndDate("quarter", parseCivilDate("2026-01-31")!, 1));
assert.equal(
  intervalsOverlap(
    longStart,
    longEnd,
    johannesburgLocalToUtc(parseCivilDate("2026-03-01")!),
    johannesburgLocalToUtc(parseCivilDate("2026-03-02")!)
  ),
  true
);
assert.equal(
  intervalsOverlap(
    longStart,
    longEnd,
    longEnd,
    johannesburgLocalToUtc(parseCivilDate("2026-05-01")!)
  ),
  false
);

assert.equal(storedBookingUnitForPeriod("month"), "flex_month");
assert.equal(storedBookingUnitForPeriod("day"), "flex_day");
assert.match(requestServer, /pricing_mode: flexibleSnapshot\.pricing_mode/);
assert.match(requestServer, /flex_month|storedBookingUnit/);
assert.match(requestServer, /This listing does not offer that booking period/);
assert.doesNotMatch(requestServer, /payload\.unitPrice|payload\.totalPrice/);

assert.match(createForm, /FlexibleBookingRatesEditor/);
assert.match(editPage, /FlexibleBookingRatesEditor/);
assert.match(renterForm, /flexibleRates/);
assert.match(migration, /space_booking_rates/);
assert.match(migration, /pricing_mode/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.replace_space_booking_rates/);
assert.match(migration, /SET search_path = pg_catalog, public/);
assert.doesNotMatch(migration, /21cf12c3-3235-4cd3-8106-801d120dc7b5/);
assert.doesNotMatch(migration, /CREATE TABLE public\.booking_series/i);

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

function grant(
  partial: Partial<OrganisationAccessGrant> &
    Pick<OrganisationAccessGrant, "role" | "status">
): OrganisationAccessGrant {
  return {
    organisationId: partial.organisationId ?? PGH_ORG,
    role: partial.role,
    propertyId: partial.propertyId ?? null,
    spaceId: partial.spaceId ?? null,
    status: partial.status,
  };
}

function ctx(spaceId: string, grants: OrganisationAccessGrant[], propertyId = PGH_PROPERTY): AccessContext {
  return {
    userId: "pgh-admin",
    spaceId,
    propertyId,
    organisationId: PGH_ORG,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "user",
    adminAccessDisabled: false,
    grants,
  };
}

const orgGrant = [grant({ role: "org_admin", status: "active" })];
for (const spaceId of PGH_SPACES) {
  assert.equal(computeAccess(ctx(spaceId, orgGrant)).canEditSpace, true);
}

const managerGrant = [
  grant({
    role: "space_manager",
    status: "active",
    propertyId: PGH_PROPERTY,
    spaceId: PGH_SPACES[0],
  }),
];
assert.equal(computeAccess(ctx(PGH_SPACES[0], managerGrant)).canEditSpace, true);
for (const spaceId of PGH_SPACES.slice(1)) {
  assert.equal(computeAccess(ctx(spaceId, managerGrant)).canEditSpace, false);
}

const propertyGrant = [
  grant({
    role: "property_manager",
    status: "active",
    propertyId: PGH_PROPERTY,
  }),
];
for (const spaceId of PGH_SPACES) {
  assert.equal(computeAccess(ctx(spaceId, propertyGrant)).canEditSpace, true);
}
assert.equal(
  computeAccess(
    ctx(PGH_SPACES[0], propertyGrant, "11111111-1111-1111-1111-111111111111")
  ).canEditSpace,
  false
);

const legacyOwner = computeAccess({
  ...ctx(PGH_SPACES[3], []),
  spaceOwnerId: "legacy-owner",
  userId: "legacy-owner",
});
assert.equal(legacyOwner.canEditSpace, true);

execFileSync("bash", ["scripts/test-flexible-booking-db.sh"], { stdio: "inherit" });
console.log("flexible booking period checks passed");
