#!/usr/bin/env node
/**
 * Booking expiry cron auth, business-rule contract, and vercel.json tests (no DB).
 * Does not call expire_unpaid_bookings against a live database.
 * Run: npm run test:expire-bookings-cron
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET } from "../app/api/cron/expire-bookings/route";
import {
  isVercelCronAuthorized,
  unauthorizedCronResponse,
} from "../lib/cron-auth";

const TEST_SECRET = "findmyspace-test-cron-secret";

type ExpiryBooking = {
  status: string;
  payment_status: string;
  owner_response_at: string | null;
  created_at: string;
};

/** Mirrors public.expire_unpaid_bookings() WHERE clause. Keep in lockstep with SQL. */
function bookingMatchesExpireUnpaidRules(
  booking: ExpiryBooking,
  now: Date
): boolean {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const anchor = new Date(booking.owner_response_at ?? booking.created_at);
  return (
    booking.status === "accepted_awaiting_payment" &&
    booking.payment_status === "awaiting_payment" &&
    anchor.getTime() <= cutoff.getTime()
  );
}

function applyExpireUnpaidBooking(
  booking: ExpiryBooking,
  now: Date
): ExpiryBooking {
  if (!bookingMatchesExpireUnpaidRules(booking, now)) return booking;
  return { ...booking, status: "expired", payment_status: "unpaid" };
}

function requestWithAuth(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new NextRequest("https://findmyspace.co.za/api/cron/expire-bookings", {
    method: "GET",
    headers,
  });
}

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void
) {
  const keys = Object.keys(env);
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function main() {
  await withEnv({ CRON_SECRET: TEST_SECRET }, async () => {
    assert.equal(
      isVercelCronAuthorized(requestWithAuth()),
      false,
      "no Authorization header → rejected"
    );
    assert.equal(
      isVercelCronAuthorized(requestWithAuth("Bearer wrong-token")),
      false,
      "incorrect bearer token → rejected"
    );
    assert.equal(
      isVercelCronAuthorized(requestWithAuth(`Bearer ${TEST_SECRET}`)),
      true,
      "correct bearer token → allowed"
    );
  });

  await withEnv({ CRON_SECRET: undefined }, () => {
    assert.equal(
      isVercelCronAuthorized(requestWithAuth(`Bearer ${TEST_SECRET}`)),
      false,
      "CRON_SECRET missing → fail closed"
    );
  });

  await withEnv({ CRON_SECRET: "" }, () => {
    assert.equal(
      isVercelCronAuthorized(requestWithAuth("Bearer ")),
      false,
      "empty CRON_SECRET → fail closed"
    );
  });

  const unauthorized = unauthorizedCronResponse();
  assert.equal(unauthorized.status, 401);
  const unauthorizedBody = await unauthorized.text();
  assert.equal(unauthorizedBody, "Unauthorized");
  assert.equal(unauthorizedBody.includes(TEST_SECRET), false);

  await withEnv(
    {
      CRON_SECRET: TEST_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    async () => {
      const missingHeader = await GET(requestWithAuth());
      assert.equal(missingHeader.status, 401);

      const wrongToken = await GET(requestWithAuth("Bearer not-the-secret"));
      assert.equal(wrongToken.status, 401);

      const allowed = await GET(requestWithAuth(`Bearer ${TEST_SECRET}`));
      assert.equal(allowed.status, 500, "auth passed; supabase config missing");
      const allowedJson = await allowed.json();
      assert.equal(allowedJson.error, "Missing server configuration");
    }
  );

  await withEnv(
    { CRON_SECRET: undefined, NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
    async () => {
      const res = await GET(requestWithAuth(`Bearer ${TEST_SECRET}`));
      assert.equal(res.status, 401, "missing CRON_SECRET fails closed even with supabase url set");
    }
  );

  const now = new Date("2026-09-21T12:00:00.000Z");
  const hoursAgo = (hours: number) =>
    new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  assert.equal(
    bookingMatchesExpireUnpaidRules(
      {
        status: "accepted_awaiting_payment",
        payment_status: "awaiting_payment",
        owner_response_at: hoursAgo(24),
        created_at: hoursAgo(30),
      },
      now
    ),
    true,
    "24h unpaid accepted booking expires"
  );
  assert.equal(
    bookingMatchesExpireUnpaidRules(
      {
        status: "accepted_awaiting_payment",
        payment_status: "awaiting_payment",
        owner_response_at: hoursAgo(23.9),
        created_at: hoursAgo(48),
      },
      now
    ),
    false,
    "under 24h does not expire"
  );
  assert.equal(
    bookingMatchesExpireUnpaidRules(
      {
        status: "paid_confirmed",
        payment_status: "paid",
        owner_response_at: hoursAgo(48),
        created_at: hoursAgo(48),
      },
      now
    ),
    false,
    "paid bookings do not expire"
  );
  assert.equal(
    bookingMatchesExpireUnpaidRules(
      {
        status: "pending_owner",
        payment_status: "unpaid",
        owner_response_at: null,
        created_at: hoursAgo(48),
      },
      now
    ),
    false,
    "pending owner bookings do not expire"
  );
  assert.equal(
    bookingMatchesExpireUnpaidRules(
      {
        status: "accepted_awaiting_payment",
        payment_status: "awaiting_payment",
        owner_response_at: null,
        created_at: hoursAgo(24),
      },
      now
    ),
    true,
    "falls back to created_at when owner_response_at is null"
  );

  const eligible: ExpiryBooking = {
    status: "accepted_awaiting_payment",
    payment_status: "awaiting_payment",
    owner_response_at: hoursAgo(25),
    created_at: hoursAgo(30),
  };
  const first = applyExpireUnpaidBooking(eligible, now);
  assert.deepEqual(first, {
    ...eligible,
    status: "expired",
    payment_status: "unpaid",
  });
  const second = applyExpireUnpaidBooking(first, now);
  assert.deepEqual(second, first, "repeated expiry is idempotent");

  const phase1Sql = readFileSync(
    "supabase/migrations/20260412120000_phase1_expiry_payment_reference.sql",
    "utf8"
  );
  assert.match(phase1Sql, /status = 'accepted_awaiting_payment'/);
  assert.match(phase1Sql, /payment_status = 'awaiting_payment'/);
  assert.match(phase1Sql, /interval '24 hours'/);
  assert.match(phase1Sql, /status = 'expired'/);
  assert.match(phase1Sql, /payment_status = 'unpaid'/);

  const migration062 = readFileSync(
    "supabase/migrations/062_20260921_expire_unpaid_bookings_revoke_public_execute.sql",
    "utf8"
  );
  assert.equal(
    /CREATE OR REPLACE FUNCTION/i.test(migration062),
    false,
    "062 must not replace the expiry function body"
  );
  assert.match(migration062, /REVOKE ALL ON FUNCTION public\.expire_unpaid_bookings\(\) FROM PUBLIC/);
  assert.match(migration062, /REVOKE ALL ON FUNCTION public\.expire_unpaid_bookings\(\) FROM anon/);
  assert.match(
    migration062,
    /REVOKE ALL ON FUNCTION public\.expire_unpaid_bookings\(\) FROM authenticated/
  );
  assert.match(
    migration062,
    /GRANT EXECUTE ON FUNCTION public\.expire_unpaid_bookings\(\) TO service_role/
  );

  const cronSrc = readFileSync("app/api/cron/expire-bookings/route.ts", "utf8");
  assert.doesNotMatch(cronSrc, /if \(!renter_id \|\| !owner_id\)/);
  assert.match(cronSrc, /if \(!renter_id\)/);

  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.deepEqual(vercel, {
    crons: [
      {
        path: "/api/cron/expire-bookings",
        schedule: "0 0 * * *",
      },
    ],
  });

  console.log("expire-bookings cron tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
