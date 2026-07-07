#!/usr/bin/env node
/**
 * Targeted apply for migration 054 only (primary_contact_id on crm_organisations).
 * Run: node --env-file=.env.local scripts/apply-migration-054.mjs
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
const VERSION = "054";

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
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '054' OR version LIKE '054_%';"
  );
  const recorded = history.length > 0;
  console.log("remote_054_recorded:", recorded, history);

  const columns = await querySql(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_organisations'
      AND column_name = 'primary_contact_id';
  `);
  const hasColumn = columns.length > 0;
  console.log("primary_contact_id_exists:", hasColumn);

  if (!hasColumn) {
    console.log("Applying migration 054 SQL...");
    const sql = readFileSync(
      "supabase/migrations/054_20260707_crm_primary_contact_id.sql",
      "utf8"
    );
    await querySql(sql);
    console.log("Migration SQL applied.");
  } else {
    console.log("Column already exists — skipping SQL apply.");
  }

  if (!recorded) {
    console.log("Recording migration 054 in schema_migrations...");
    execSync(`npx supabase@latest migration repair --status applied ${VERSION}`, {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      stdio: "inherit",
    });
  }

  const fks = await querySql(`
    SELECT tc.constraint_name, ccu.table_name AS foreign_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'crm_organisations'
      AND kcu.column_name = 'primary_contact_id'
      AND tc.constraint_type = 'FOREIGN KEY';
  `);
  console.log("FK:", fks);

  const indexes = await querySql(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'crm_organisations'
      AND indexname = 'crm_organisations_primary_contact_id_idx';
  `);
  console.log("index:", indexes);

  const historyAfter = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '054' OR version LIKE '054_%';"
  );
  console.log("remote history 054:", historyAfter);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
