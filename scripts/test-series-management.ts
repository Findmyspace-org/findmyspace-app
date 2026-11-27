import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const server = readFileSync("lib/booking-request-server.ts", "utf8");
assert.match(server, /create_recurring_booking/);
assert.doesNotMatch(server, /attach_recurring_series/);
assert.doesNotMatch(server, /payload\.totalPrice/);
assert.doesNotMatch(server, /payload\.occurrences/);

const form = readFileSync("app/components/BookingRequestForm.tsx", "utf8");
assert.match(form, /\/api\/bookings\/recurring-quote/);
assert.match(form, /quoteRequest\.current/);
assert.match(form, /This preview calculates the schedule only/);

const requests = readFileSync("app/dashboard/requests/page.tsx", "utf8");
assert.match(requests, /booking_occurrences/);
assert.match(requests, /recurring_hour/);

const calendar = readFileSync("app/dashboard/calendar/page.tsx", "utf8");
assert.doesNotMatch(calendar, /unitMatches/);
assert.match(calendar, /propertyFilter/);
assert.match(calendar, /parentBookingId/);

const devPages = [
  "app/dev/layout.tsx",
  "app/dev/series-management-preview/page.tsx",
  "app/dev/recurring-booking-preview/page.tsx",
];
for (const path of devPages) {
  const source = readFileSync(path, "utf8");
  assert.doesNotMatch(source, /from "@\/lib\/supabase"/);
  assert.doesNotMatch(source, /\/api\/bookings\/request/);
  assert.doesNotMatch(source, /payfast/i);
}
assert.match(readFileSync("app/dev/layout.tsx", "utf8"), /VERCEL_ENV === "production"/);

execFileSync("bash", ["scripts/test-phase5-series-db.sh"], { stdio: "inherit" });
console.log("series management checks passed");
