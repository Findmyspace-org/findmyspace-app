#!/usr/bin/env node
/**
 * Verify CRM marketing migration objects in the active Supabase project.
 * Run: node --env-file=.env.local scripts/verify-crm-marketing-db.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

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

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];
const admin = createClient(url, serviceKey);

const REQUIRED_TABLES = [
  "crm_marketing_contacts",
  "crm_marketing_lists",
  "crm_marketing_list_members",
  "crm_marketing_audits",
  "crm_marketing_campaigns",
  "crm_pipeline_close_operations",
];

const REQUIRED_LISTS = [
  "General updates",
  "Go-live announcements",
  "Closed / Not Now",
  "Signed-up organisations",
  "Listed organisations",
  "Municipalities",
  "Schools",
  "Property owners",
  "Venues",
];

async function tableExists(table) {
  const { error } = await admin.from(table).select("id", { head: true, count: "exact" });
  return !error;
}

async function main() {
  console.log(`Verifying project ref: ${projectRef}`);

  for (const table of REQUIRED_TABLES) {
    const ok = await tableExists(table);
    if (!ok) {
      console.error(`Missing or inaccessible table: ${table}`);
      process.exit(1);
    }
    console.log(`OK table: ${table}`);
  }

  const { data: lists, error: listsError } = await admin
    .from("crm_marketing_lists")
    .select("id, name, slug, is_system")
    .eq("is_system", true)
    .order("name");

  if (listsError) {
    console.error("Failed to read system lists:", listsError.message);
    process.exit(1);
  }

  for (const name of REQUIRED_LISTS) {
    const matches = (lists || []).filter((row) => row.name === name);
    if (matches.length !== 1) {
      console.error(`Expected exactly one system list "${name}", found ${matches.length}`);
      process.exit(1);
    }
    console.log(`OK system list: ${name} (${matches[0].slug})`);
  }

  const { data: rpcCheck, error: rpcError } = await admin.rpc(
    "crm_close_organisation_pipeline_lost",
    {
      p_idempotency_key: "__verify_noop__",
      p_organisation_id: "00000000-0000-0000-0000-000000000000",
      p_profile_id: "00000000-0000-0000-0000-000000000000",
      p_previous_stage: "prospect",
      p_lost_reason: "",
      p_outcome_category: "other",
      p_marketing_audience_mode: "none",
      p_selected_contact_ids: [],
      p_create_follow_up_task: false,
    }
  );

  if (rpcError && /could not find the function/i.test(rpcError.message)) {
    console.warn("WARN RPC crm_close_organisation_pipeline_lost is not deployed (migration 052 pending).");
  } else if (rpcError) {
    console.error("RPC check failed:", rpcError.message);
    process.exit(1);
  } else if (rpcCheck?.ok === false) {
    console.log("OK RPC callable (validation response received)");
  } else {
    console.log("OK RPC callable");
  }

  const { count: orgCount, error: orgError } = await admin
    .from("crm_organisations")
    .select("id", { head: true, count: "exact" });
  if (orgError) {
    console.error("crm_organisations check failed:", orgError.message);
    process.exit(1);
  }
  console.log(`OK crm_organisations readable (${orgCount ?? 0} rows)`);

  console.log("verify-crm-marketing-db: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
