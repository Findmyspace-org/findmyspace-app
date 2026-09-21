#!/usr/bin/env node
/**
 * Targeted apply for migration 061 (claim clears live listing mode).
 * Run: node --env-file=.env.local scripts/apply-migration-061.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  assertFindmyspaceSupabaseTarget,
  linkFindmyspaceSupabaseCli,
} from "./lib/assert-findmyspace-supabase-target.mjs";

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
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const { projectRef } = assertFindmyspaceSupabaseTarget(env);
const VERSION = "061";
const MIGRATION_FILE =
  "supabase/migrations/061_20260814_claim_clears_live_listing_mode.sql";
const EXPECTED_COMMENT =
  "Syncs public_listing_mode on pause/resume/archive/claim; blocks JWT mode changes; live mode requires active status.";

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
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return Array.isArray(body) ? body : body?.result || [];
}

async function main() {
  console.log("repository:", process.cwd());
  console.log("project_ref:", projectRef);
  if (!accessToken) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exit(1);
  }

  const history = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '061' OR version LIKE '061_%'"
  );
  const recorded = history.length > 0;
  console.log("remote_061_recorded:", recorded, history);

  const fnRows = await querySql(`
    SELECT
      pg_get_functiondef(p.oid) AS def,
      obj_description(p.oid, 'pg_proc') AS comment
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'guard_spaces_public_listing_mode'
  `);
  const def = fnRows[0]?.def || "";
  const comment = fnRows[0]?.comment || "";
  const hasLiveGuard =
    /public_listing_mode = 'live' AND NEW\.status IS DISTINCT FROM 'active'/.test(
      def
    ) && /public_listing_mode := 'off'/.test(def);
  const commentMatches = comment === EXPECTED_COMMENT;
  const alreadyApplied = hasLiveGuard && commentMatches;
  console.log("function_present:", Boolean(def));
  console.log("has_live_guard:", hasLiveGuard);
  console.log("comment_matches_061:", commentMatches);

  if (!alreadyApplied) {
    console.log("Applying migration 061 SQL...");
    const sql = readFileSync(MIGRATION_FILE, "utf8");
    await querySql(sql);
    console.log("Migration SQL applied.");
  } else {
    console.log("Schema already matches 061 — skipping SQL apply.");
  }

  if (!recorded) {
    console.log("Recording migration 061 in schema_migrations...");
    linkFindmyspaceSupabaseCli(env, accessToken);
    execSync(`npx supabase@latest migration repair --status applied ${VERSION}`, {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      stdio: "inherit",
    });
  } else {
    console.log("Migration 061 already recorded.");
  }

  const historyAfter = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '061' OR version LIKE '061_%'"
  );
  console.log("remote history 061:", historyAfter);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
