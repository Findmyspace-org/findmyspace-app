#!/usr/bin/env node
/**
 * Repair Supabase migration history for CRM marketing migrations 051/052
 * when database objects already exist but CLI history is out of sync.
 *
 * Run after refreshing SUPABASE_ACCESS_TOKEN:
 *   node --env-file=.env.local scripts/repair-crm-migration-history.mjs
 *
 * Manual repair if CLI auth fails:
 *   npx supabase link --project-ref <PROJECT_REF>
 *   npx supabase migration repair --status applied 051_20260707_crm_marketing
 *   npx supabase migration repair --status applied 052_20260707_crm_close_pipeline_rpc
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  if (!existsSync(".env.local")) throw new Error(".env.local not found");
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

const env = { ...process.env, ...loadEnvLocal() };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = url ? new URL(url).hostname.split(".")[0] : "unknown";

const MIGRATIONS = [
  { version: "051_20260707_crm_marketing", table: "crm_marketing_contacts" },
  { version: "052_20260707_crm_close_pipeline_rpc", rpc: "crm_close_organisation_pipeline_lost" },
];

console.log(`Repository: ${process.cwd()}`);
console.log(`Project ref: ${projectRef}`);

const admin = createClient(url, serviceKey);

async function objectExists({ table, rpc }) {
  if (table) {
    const { error } = await admin.from(table).select("id", { head: true, count: "exact" });
    return !error;
  }
  if (rpc) {
    const { error } = await admin.rpc(rpc, {
      p_idempotency_key: "__repair_check__",
      p_organisation_id: "00000000-0000-0000-0000-000000000000",
      p_profile_id: "00000000-0000-0000-0000-000000000000",
      p_previous_stage: "prospect",
      p_lost_reason: "",
      p_outcome_category: "other",
      p_marketing_audience_mode: "none",
      p_selected_contact_ids: [],
      p_create_follow_up_task: false,
    });
    return !error || !/could not find the function/i.test(error.message);
  }
  return false;
}

for (const migration of MIGRATIONS) {
  const exists = await objectExists(migration);
  console.log(`${migration.version}: database objects ${exists ? "present" : "missing"}`);
}

if (!accessToken) {
  console.log("\nSUPABASE_ACCESS_TOKEN is not set. After refreshing it, run:");
  console.log(`  npx supabase link --project-ref ${projectRef}`);
  for (const migration of MIGRATIONS) {
    console.log(`  npx supabase migration repair --status applied ${migration.version}`);
  }
  process.exit(0);
}

try {
  execSync(`npx supabase@latest link --project-ref ${projectRef}`, {
    env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
    stdio: "inherit",
  });
} catch {
  console.warn("supabase link reported a non-fatal issue.");
}

for (const migration of MIGRATIONS) {
  const exists = await objectExists(migration);
  if (!exists) {
    console.warn(`Skipping repair for ${migration.version}: objects not present in database.`);
    continue;
  }
  console.log(`Repairing migration history: ${migration.version}`);
  execSync(`npx supabase@latest migration repair --status applied ${migration.version}`, {
    env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
    stdio: "inherit",
  });
}

console.log("Migration history repair completed.");
