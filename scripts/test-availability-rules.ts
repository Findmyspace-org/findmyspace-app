import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import {
  describeAvailabilityRule,
  expandAvailabilityRule,
  parseAvailabilityRuleDraft,
  ruleOverlapsInterval,
  type AvailabilityRule,
} from "../lib/availability-rules";
import { johannesburgLocalToUtc, parseCivilDate } from "../lib/booking-periods";
import { resolveFlexibleBooking } from "../lib/flexible-booking";

const classroom: AvailabilityRule = {
  id: "rule-classroom",
  spaceId: "space-classroom",
  reason: "School day",
  weekdays: [1, 2, 3, 4, 5],
  wholeDay: false,
  localStart: "08:00",
  localEnd: "15:00",
  startsOn: "2027-01-01",
  endsOn: null,
};

assert.equal(
  describeAvailabilityRule(classroom),
  "Every Monday to Friday, 08:00–15:00, starting 1 January 2027, with no end date."
);

const during = ruleOverlapsInterval(
  classroom,
  johannesburgLocalToUtc(parseCivilDate("2027-01-04")!, 10, 0),
  johannesburgLocalToUtc(parseCivilDate("2027-01-04")!, 11, 0)
);
assert.equal(during.overlaps, true);

const before = ruleOverlapsInterval(
  classroom,
  johannesburgLocalToUtc(parseCivilDate("2027-01-04")!, 7, 0),
  johannesburgLocalToUtc(parseCivilDate("2027-01-04")!, 8, 0)
);
assert.equal(before.overlaps, false);

const after = ruleOverlapsInterval(
  classroom,
  johannesburgLocalToUtc(parseCivilDate("2027-01-04")!, 15, 0),
  johannesburgLocalToUtc(parseCivilDate("2027-01-04")!, 16, 0)
);
assert.equal(after.overlaps, false);

const saturday = ruleOverlapsInterval(
  classroom,
  johannesburgLocalToUtc(parseCivilDate("2027-01-09")!, 10, 0),
  johannesburgLocalToUtc(parseCivilDate("2027-01-09")!, 11, 0)
);
assert.equal(saturday.overlaps, false);

const quarter = ruleOverlapsInterval(
  classroom,
  johannesburgLocalToUtc(parseCivilDate("2027-01-04")!, 0, 0),
  johannesburgLocalToUtc(parseCivilDate("2027-04-04")!, 0, 0)
);
assert.equal(quarter.overlaps, true);

const future = ruleOverlapsInterval(
  classroom,
  johannesburgLocalToUtc(parseCivilDate("2030-01-07")!, 10, 0),
  johannesburgLocalToUtc(parseCivilDate("2030-01-07")!, 11, 0)
);
assert.equal(future.overlaps, true);
assert.equal(
  expandAvailabilityRule(
    classroom,
    johannesburgLocalToUtc(parseCivilDate("2030-01-01")!, 0, 0),
    johannesburgLocalToUtc(parseCivilDate("2030-02-01")!, 0, 0)
  ).length > 15,
  true
);

const weekend = parseAvailabilityRuleDraft(
  {
    reason: "Closed",
    weekdays: [6, 7],
    wholeDay: true,
    localStart: "",
    localEnd: "",
    startsOn: "2027-01-01",
    endsOn: "",
    noEnd: true,
  },
  "space"
);
assert.equal(weekend.ok, true);
if (weekend.ok) {
  assert.match(describeAvailabilityRule(weekend.rule), /Saturday and Sunday, all day/);
}

const migration = readFileSync(
  "supabase/migrations/083_20261126_recurring_availability_rules.sql",
  "utf8"
);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.availability_rules/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.save_availability_rule/);
assert.match(migration, /SET search_path = pg_catalog, public/);
assert.doesNotMatch(migration, /CREATE TABLE public\.booking_series/);
assert.doesNotMatch(migration, /UPDATE public\.bookings/);
assert.doesNotMatch(migration, /DELETE FROM public\.blocked_dates/);

const calendar = readFileSync("app/dashboard/calendar/page.tsx", "utf8");
const route = readFileSync("app/api/host/spaces/[spaceId]/availability-rules/route.ts", "utf8");
const bookingForm = readFileSync("app/components/BookingRequestForm.tsx", "utf8");
assert.match(calendar, /AvailabilityBlockDialog/);
assert.match(calendar, /expandAvailabilityRule/);
assert.match(route, /requireManagedListingApi/);
assert.match(route, /save_availability_rule/);
assert.match(bookingForm, /ruleOverlapsInterval/);

const year = resolveFlexibleBooking({
  rates: [{ period: "year", amount: 65000 }],
  ratePeriod: "year",
  startDate: "2026-01-31",
  quantity: 1,
});
assert.equal(year.ok, true);
if (year.ok) assert.equal(year.quote.totalPrice, 65000);

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

function ctx(spaceId: string, grants: OrganisationAccessGrant[], propertyId = PGH_PROPERTY): AccessContext {
  return {
    userId: "tester",
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

for (const spaceId of PGH_SPACES) {
  assert.equal(
    computeAccess(ctx(spaceId, [{ organisationId: PGH_ORG, role: "org_admin", propertyId: null, spaceId: null, status: "active" }])).canEditSpace,
    true
  );
}
assert.equal(
  computeAccess(
    ctx(PGH_SPACES[0], [{
      organisationId: PGH_ORG,
      role: "property_manager",
      propertyId: PGH_PROPERTY,
      spaceId: null,
      status: "active",
    }])
  ).canEditSpace,
  true
);
assert.equal(
  computeAccess(
    ctx(PGH_SPACES[0], [{
      organisationId: PGH_ORG,
      role: "property_manager",
      propertyId: "11111111-1111-4111-8111-111111111111",
      spaceId: null,
      status: "active",
    }])
  ).canEditSpace,
  false
);
assert.equal(
  computeAccess(
    ctx(PGH_SPACES[1], [{
      organisationId: PGH_ORG,
      role: "space_manager",
      propertyId: PGH_PROPERTY,
      spaceId: PGH_SPACES[0],
      status: "active",
    }])
  ).canEditSpace,
  false
);
assert.equal(computeAccess(ctx(PGH_SPACES[0], [])).canEditSpace, false);

execFileSync("bash", ["scripts/test-phase3-availability-db.sh"], { stdio: "inherit" });
console.log("availability rule checks passed");
