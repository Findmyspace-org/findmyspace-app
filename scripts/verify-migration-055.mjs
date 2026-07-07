#!/usr/bin/env node
/**
 * Verify migration 055 objects on remote Supabase (read-only inspection).
 * Run: node --env-file=.env.local scripts/verify-migration-055.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

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

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function hashSql(sql) {
  return createHash("sha256").update(normalizeSql(sql)).digest("hex").slice(0, 16);
}

async function main() {
  if (!accessToken) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exit(1);
  }

  console.log("project_ref:", projectRef);

  const history = await querySql(`
    SELECT version, name
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('051','052','053','054','055','056')
    ORDER BY version;
  `);
  console.log("\n=== migration history 051-056 ===");
  console.log(JSON.stringify(history, null, 2));

  const table = await querySql(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_pipeline_stage_operations'
    ) AS exists;
  `);
  console.log("\n=== crm_pipeline_stage_operations table ===");
  console.log(table);

  const tableCols = await querySql(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'crm_pipeline_stage_operations'
    ORDER BY ordinal_position;
  `);
  console.log("columns:", tableCols);

  const indexes = await querySql(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'crm_pipeline_stage_operations';
  `);
  console.log("indexes:", indexes);

  const fn = await querySql(`
    SELECT
      p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS signature,
      pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef AS security_definer,
      p.proconfig AS config,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'crm_move_organisation_pipeline_stage';
  `);
  console.log("\n=== crm_move_organisation_pipeline_stage ===");
  if (!fn.length) {
    console.log("MISSING");
  } else {
    const row = fn[0];
    console.log("signature:", row.signature);
    console.log("owner:", row.owner);
    console.log("security_definer:", row.security_definer);
    console.log("config:", row.config);
    console.log("definition_hash:", hashSql(row.definition || ""));
    console.log("definition_snippet:", (row.definition || "").slice(0, 400));
  }

  const grants = await querySql(`
    SELECT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'crm_move_organisation_pipeline_stage'
    ORDER BY grantee, privilege_type;
  `);
  console.log("\n=== function grants ===");
  console.log(grants);

  const localMigration = readFileSync(
    "supabase/migrations/055_20260707_crm_pipeline_stage_move_rpc.sql",
    "utf8"
  );
  const localFnMatch = localMigration.match(
    /CREATE OR REPLACE FUNCTION public\.crm_move_organisation_pipeline_stage[\s\S]*?\$\$;/
  );
  const localFnHash = localFnMatch ? hashSql(localFnMatch[0]) : "n/a";
  console.log("\n=== local function hash ===");
  console.log("local_definition_hash:", localFnHash);
  if (fn.length) {
    console.log(
      "remote_matches_local:",
      localFnHash === hashSql(fn[0].definition || "")
    );
  }

  const orgRankCols = await querySql(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_organisations'
      AND column_name IN (
        'pipeline_manual_rank',
        'pipeline_rank_updated_at',
        'pipeline_rank_updated_by',
        'pipeline_stage'
      )
    ORDER BY column_name;
  `);
  console.log("\n=== crm_organisations rank/stage columns (053 dep) ===");
  console.log(orgRankCols);

  const stageLabelFn = await querySql(`
    SELECT proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND proname = 'crm_pipeline_stage_label';
  `);
  console.log("\n=== crm_pipeline_stage_label (052 dep) ===");
  console.log(stageLabelFn);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
