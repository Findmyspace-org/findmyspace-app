#!/usr/bin/env node
/**
 * Compare browse eligibility for listings (service role).
 * Run: node scripts/diagnose-browse-listings.mjs "dal"
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const query = process.argv[2] || "%dal%";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await admin
  .from("spaces")
  .select(
    "id, title, status, public_listing_mode, is_bookable, booking_unit, price_unit, price_amount, price_per_hour, price_per_day, price_per_month, min_booking_hours, min_booking_days, owner_id, updated_at"
  )
  .ilike("title", query.includes("%") ? query : `%${query}%`)
  .order("title");

if (error) {
  console.error(error);
  process.exit(1);
}

for (const row of data || []) {
  const mode = row.public_listing_mode;
  const amount = row.price_amount ?? row.price_per_hour ?? row.price_per_day ?? row.price_per_month;
  const enquiry = mode === "enquiry";
  const live = mode === "live";
  const defaultMax = 20000;
  const passesGate =
    (mode === "enquiry" || mode === "live") &&
    (enquiry || amount != null);
  const passesDefaultRange =
    enquiry || (amount != null && amount >= 0 && amount <= defaultMax);

  console.log("---");
  console.log(row.title);
  console.log({
    id: row.id,
    status: row.status,
    public_listing_mode: mode,
    is_bookable: row.is_bookable,
    booking_unit: row.booking_unit,
    price_unit: row.price_unit,
    price_amount: row.price_amount,
    price_per_hour: row.price_per_hour,
    price_per_day: row.price_per_day,
    price_per_month: row.price_per_month,
    passes_public_gate: passesGate,
    passes_old_default_max_filter: passesDefaultRange,
  });
}
