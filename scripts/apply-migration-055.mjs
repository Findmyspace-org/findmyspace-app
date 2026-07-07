#!/usr/bin/env node
/**
 * Targeted apply/repair for migration 055 (pipeline stage move RPC).
 * If schema objects already exist, records history only.
 * Run: node --env-file=.env.local scripts/apply-migration-055.mjs
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
const VERSION = "055";

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

async function objectsPresent() {
  const table = await querySql(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_pipeline_stage_operations'
    ) AS exists;
  `);
  const fn = await querySql(`
    SELECT COUNT(*)::int AS count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'crm_move_organisation_pipeline_stage';
  `);
  return Boolean(table[0]?.exists) && Number(fn[0]?.count) > 0;
}

async function main() {
  console.log("repository:", process.cwd());
  console.log("project_ref:", projectRef);

  if (!accessToken) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exit(1);
  }

  const history = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '055';"
  );
  const recorded = history.length > 0;
  console.log("remote_055_recorded:", recorded, history);

  const present = await objectsPresent();
  console.log("schema_objects_present:", present);

  if (!present) {
    console.log("Applying migration 055 SQL...");
    const sql = readFileSync(
      "supabase/migrations/055_20260707_crm_pipeline_stage_move_rpc.sql",
      "utf8"
    );
    await querySql(sql);
    console.log("Migration SQL applied.");
  } else {
    console.log("Schema objects already exist — skipping SQL apply.");
  }

  if (!recorded) {
    console.log("Recording migration 055 in schema_migrations...");
    execSync(`npx supabase@latest migration repair --status applied ${VERSION}`, {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      stdio: "inherit",
    });
  }

  const historyAfter = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version IN ('051','052','053','054','055','056') ORDER BY version;"
  );
  console.log("remote history 051-056:", historyAfter);

  try {
    const list = execSync("npx supabase@latest migration list", {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      encoding: "utf8",
    });
    for (const v of ["051", "052", "053", "054", "055", "056"]) {
      const line = list.split("\n").find((row) => row.includes(`"${v}"`));
      console.log(`migration list ${v}:`, line?.trim() || "see full list");
    }
  } catch (e) {
    console.warn("migration list failed:", e.message);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
