#!/usr/bin/env node
/**
 * Apply listing cleanup (Town Hall address, Dal Josaphat titles,
 * PGH duplicate archive) to the verified FindMySpace project only.
 * This is not a schema migration.
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-listing-cleanup.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  EXPECTED_PROJECT_REF,
  assertFindmyspaceSupabaseTarget,
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

async function querySql(projectRef, accessToken, query) {
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
  const env = { ...process.env, ...loadEnvLocal() };
  const verified = assertFindmyspaceSupabaseTarget(env);
  const projectRef = verified.projectRef;

  if (projectRef !== EXPECTED_PROJECT_REF) {
    throw new Error("Refusing to run: project ref is not FindMySpace production.");
  }

  const accessToken = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exit(1);
  }

  const sqlPath = join("scripts/sql/correct-listing-cleanup.sql");
  const sql = readFileSync(sqlPath, "utf8");

  console.log("FindMySpace listing cleanup");
  console.log("expected project ref:", EXPECTED_PROJECT_REF);
  console.log("verified project ref:", projectRef);
  console.log("sql file:", sqlPath);
  console.log("Applying guarded transactional SQL...");

  await querySql(projectRef, accessToken, sql);
  console.log("Transaction completed.");
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
