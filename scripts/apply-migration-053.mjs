#!/usr/bin/env node
/**
 * Targeted apply for migration 053 only (pipeline manual rank columns).
 * Does NOT run supabase db push.
 *
 * Run: node --env-file=.env.local scripts/apply-migration-053.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

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
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const projectRef = new URL(url).hostname.split(".")[0];
const VERSION = "053";

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
  console.log("branch:", execSync("git branch --show-current", { encoding: "utf8" }).trim());

  if (!accessToken) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exit(1);
  }

  const history = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '053' OR version LIKE '053_%';"
  );
  const recorded = history.length > 0;
  console.log("remote_053_recorded:", recorded, history);

  const columns = await querySql(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_organisations'
      AND column_name IN (
        'pipeline_manual_rank',
        'pipeline_rank_updated_at',
        'pipeline_rank_updated_by'
      )
    ORDER BY column_name;
  `);
  const colNames = columns.map((r) => r.column_name);
  console.log("existing_columns:", colNames);

  const schemaReady =
    colNames.includes("pipeline_manual_rank") &&
    colNames.includes("pipeline_rank_updated_at") &&
    colNames.includes("pipeline_rank_updated_by");

  if (!schemaReady) {
    console.log("Applying migration 053 SQL...");
    const sql = readFileSync(
      "supabase/migrations/053_20260707_crm_pipeline_manual_rank.sql",
      "utf8"
    );
    await querySql(sql);
    console.log("Migration SQL applied.");
  } else {
    console.log("Schema objects already exist — skipping SQL apply.");
  }

  if (!recorded) {
    console.log("Recording migration 053 in schema_migrations...");
    execSync(`npx supabase@latest migration repair --status applied ${VERSION}`, {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      stdio: "inherit",
    });
  } else {
    console.log("Migration 053 already recorded — skipping repair.");
  }

  const verifyCols = await querySql(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_organisations'
      AND column_name IN (
        'pipeline_manual_rank',
        'pipeline_rank_updated_at',
        'pipeline_rank_updated_by'
      )
    ORDER BY column_name;
  `);
  console.log("\n=== COLUMN VERIFY ===");
  for (const row of verifyCols) {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  }

  const fks = await querySql(`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'crm_organisations'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'pipeline_rank_updated_by';
  `);
  console.log("\n=== FK VERIFY (pipeline_rank_updated_by) ===");
  console.log(fks.length ? fks : "none found");

  const indexes = await querySql(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'crm_organisations'
      AND indexname = 'crm_organisations_pipeline_stage_rank_idx';
  `);
  console.log("\n=== INDEX VERIFY ===");
  console.log(indexes.length ? indexes[0].indexname : "missing");

  const historyAfter = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '053' OR version LIKE '053_%';"
  );
  console.log("\n=== REMOTE HISTORY 053 ===");
  console.log(historyAfter);

  const sample = await querySql(`
    SELECT COUNT(*)::int AS total,
           COUNT(pipeline_manual_rank)::int AS with_rank
    FROM public.crm_organisations;
  `);
  console.log("\n=== DATA CHECK ===");
  console.log("organisations:", sample[0]);

  try {
    const list = execSync("npx supabase@latest migration list", {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      encoding: "utf8",
    });
    const lines = list.split("\n").filter((l) => l.includes("053"));
    console.log("\n=== MIGRATION LIST (053 rows) ===");
    console.log(lines.join("\n") || "(no 053 row found)");
  } catch (e) {
    console.warn("migration list failed:", e.message);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
