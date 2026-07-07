#!/usr/bin/env node
/**
 * Post-db-push audit — read-only checks against remote Supabase.
 * Run: node --env-file=.env.local scripts/audit-supabase-migration-push.mjs
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
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
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const projectRef = new URL(url).hostname.split(".")[0];

const localMigrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log("=== AUDIT EVIDENCE ===");
console.log("repository:", process.cwd());
console.log("project_ref:", projectRef);
console.log("linked_project:", existsSync("supabase/.temp/linked-project.json") ? projectRef : "missing");
console.log("local_migration_count:", localMigrations.length);
console.log("local_has_051:", localMigrations.some((f) => f.startsWith("051_")));
console.log("local_has_052:", localMigrations.some((f) => f.startsWith("052_")));

async function querySql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.message || `HTTP ${res.status}` };
  }
  return { ok: true, rows: body };
}

async function main() {
  if (accessToken) {
    const history = await querySql(
      "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"
    );
    if (history.ok) {
      const rows = Array.isArray(history.rows) ? history.rows : history.rows?.result || [];
      console.log("\n=== REMOTE schema_migrations ===");
      console.log("remote_migration_count:", rows.length);
      const versions = rows.map((r) => String(r.version));
      for (const key of ["051", "052", "20260420203310", "20260420205225"]) {
        const match = versions.filter((v) => v === key || v.startsWith(`${key}_`) || v.includes(key));
        console.log(`recorded_${key}:`, match.length ? match.join(", ") : "NOT RECORDED");
      }
      console.log("remote_versions_sample:", versions.slice(0, 10).join(", "), versions.length > 10 ? "..." : "");
      console.log("remote_versions_tail:", versions.slice(-5).join(", "));
    } else {
      console.log("\n=== REMOTE schema_migrations ===");
      console.log("query_failed:", history.error);
    }
  } else {
    console.log("\nSUPABASE_ACCESS_TOKEN not set — cannot query schema_migrations via Management API");
  }

  try {
    const listOut = execSync("npx supabase@latest migration list", {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken || "" },
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log("\n=== supabase migration list ===");
    const lines = listOut.split("\n");
    for (const line of lines) {
      if (/051|052|20260420203310|20260420205225/.test(line)) console.log(line.trim());
    }
    const remoteOnly = lines.filter((l) => l.includes("|") && l.trim().startsWith("|") === false && /^\s+\|\s+`?\d/.test(l) === false);
    void remoteOnly;
  } catch (e) {
    console.log("\n=== supabase migration list ===");
    console.log("failed:", e.stderr?.toString?.() || e.message);
  }

  const admin = createClient(url, serviceKey);

  console.log("\n=== MARKETING SCHEMA HEALTH ===");
  const marketingTables = [
    "crm_marketing_contacts",
    "crm_marketing_lists",
    "crm_marketing_list_members",
    "crm_marketing_audits",
    "crm_marketing_campaigns",
    "crm_pipeline_close_operations",
  ];
  for (const table of marketingTables) {
    const { count, error } = await admin.from(table).select("id", { head: true, count: "exact" });
    console.log(`${table}:`, error ? `ERROR ${error.message}` : `ok rows=${count ?? 0}`);
  }

  const { data: lists } = await admin
    .from("crm_marketing_lists")
    .select("slug, name, is_system")
    .eq("is_system", true)
    .order("slug");
  const slugCounts = {};
  for (const row of lists || []) {
    slugCounts[row.slug] = (slugCounts[row.slug] || 0) + 1;
  }
  const dupSlugs = Object.entries(slugCounts).filter(([, c]) => c > 1);
  console.log("system_list_count:", lists?.length ?? 0);
  console.log("duplicate_system_list_slugs:", dupSlugs.length ? dupSlugs.map(([s, c]) => `${s}x${c}`).join(", ") : "none");

  const { error: rpcError } = await admin.rpc("crm_close_organisation_pipeline_lost", {
    p_idempotency_key: "__audit__",
    p_organisation_id: "00000000-0000-0000-0000-000000000000",
    p_profile_id: "00000000-0000-0000-0000-000000000000",
    p_previous_stage: "prospect",
    p_lost_reason: "",
    p_outcome_category: "other",
    p_marketing_audience_mode: "none",
    p_selected_contact_ids: [],
    p_create_follow_up_task: false,
  });
  console.log(
    "crm_close_organisation_pipeline_lost:",
    rpcError && /could not find the function/i.test(rpcError.message) ? "MISSING" : "callable"
  );

  console.log("\n=== CORE CRM / MARKETPLACE READS ===");
  const coreTables = [
    "crm_organisations",
    "crm_contacts",
    "crm_profiles",
    "spaces",
    "properties",
    "bookings",
    "profiles",
  ];
  for (const table of coreTables) {
    const { count, error } = await admin.from(table).select("id", { head: true, count: "exact" });
    console.log(`${table}:`, error ? `ERROR ${error.message}` : `ok rows=${count ?? 0}`);
  }

  if (accessToken) {
    const rpcCheck = await querySql(`
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'crm_close_organisation_pipeline_lost';
    `);
    if (rpcCheck.ok) {
      const rows = Array.isArray(rpcCheck.rows) ? rpcCheck.rows : rpcCheck.rows?.result || [];
      console.log("\n=== RPC DEFINITION ===");
      console.log("function_count:", rows.length);
      for (const row of rows) console.log("-", row.proname, row.args);
    }

    const marketingTableCheck = await querySql(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'crm_marketing%'
      ORDER BY table_name;
    `);
    if (marketingTableCheck.ok) {
      const rows = Array.isArray(marketingTableCheck.rows)
        ? marketingTableCheck.rows
        : marketingTableCheck.rows?.result || [];
      console.log("\n=== information_schema marketing tables ===");
      console.log(rows.map((r) => r.table_name).join(", "));
    }
  }

  console.log("\n=== AUDIT COMPLETE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
