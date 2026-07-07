#!/usr/bin/env node
/**
 * Targeted apply for migration 056 only (crm_engagements.task_id + completion RPC).
 * Run: node --env-file=.env.local scripts/apply-migration-056.mjs
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
const VERSION = "056";

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
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '056' OR version LIKE '056_%';"
  );
  const recorded = history.length > 0;
  console.log("remote_056_recorded:", recorded, history);

  const columns = await querySql(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_engagements'
      AND column_name = 'task_id';
  `);
  const hasColumn = columns.length > 0;
  console.log("task_id_column_exists:", hasColumn);

  const rpc = await querySql(`
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'crm_complete_task_record';
  `);
  const hasRpc = rpc.length > 0;
  console.log("crm_complete_task_record_exists:", hasRpc);

  if (!hasColumn || !hasRpc) {
    console.log("Applying migration 056 SQL...");
    const sql = readFileSync(
      "supabase/migrations/056_20260707_crm_engagement_task_reference.sql",
      "utf8"
    );
    await querySql(sql);
    console.log("Migration SQL applied.");
  } else {
    console.log("Schema objects already exist — skipping SQL apply.");
  }

  if (!recorded) {
    console.log("Recording migration 056 in schema_migrations...");
    execSync(`npx supabase@latest migration repair --status applied ${VERSION}`, {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      stdio: "inherit",
    });
  }

  const indexes = await querySql(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'crm_engagements'
      AND indexname IN (
        'crm_engagements_task_id_idx',
        'crm_engagements_org_task_id_idx',
        'crm_engagements_task_completion_unique_idx'
      );
  `);
  console.log("indexes:", indexes);

  const historyAfter = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '056' OR version LIKE '056_%';"
  );
  console.log("remote history 056:", historyAfter);

  try {
    const list = execSync("npx supabase@latest migration list", {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      encoding: "utf8",
    });
    const line056 = list
      .split("\n")
      .find((line) => line.includes("056") || line.includes("056_"));
    console.log("migration list 056:", line056?.trim() || "not found in list output");
  } catch (e) {
    console.warn("migration list failed:", e.message);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
