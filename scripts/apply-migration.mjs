#!/usr/bin/env node
/**
 * Apply one numbered FindMySpace migration to the verified project only.
 *
 * Usage:
 *   npm run apply:migration -- 062
 *
 * Does not run unless the target guard confirms ppdaubmxrmzgmxdnyxff.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import {
  EXPECTED_PROJECT_REF,
  assertFindmyspaceSupabaseTarget,
  linkFindmyspaceSupabaseCli,
} from "./lib/assert-findmyspace-supabase-target.mjs";

const MIGRATION_NAME_RE =
  /^(\d{3})_(\d{8})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

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

function usage() {
  console.error("Usage: npm run apply:migration -- <NNN>");
  console.error("Example: npm run apply:migration -- 062");
}

function parseVersionArg(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    usage();
    process.exit(1);
  }
  if (!/^\d{1,3}$/.test(value)) {
    console.error(`Invalid migration number: ${value}`);
    usage();
    process.exit(1);
  }
  return value.padStart(3, "0");
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

  const version = parseVersionArg(process.argv[2]);
  const matches = readdirSync("supabase/migrations").filter(
    (file) => file.startsWith(`${version}_`) && file.endsWith(".sql")
  );

  if (matches.length === 0) {
    console.error(`No migration file found for version ${version}.`);
    console.error(`Expected exactly one file: supabase/migrations/${version}_*.sql`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Multiple migration files found for version ${version}:`);
    for (const file of matches) console.error(`  ${file}`);
    process.exit(1);
  }

  const filename = matches[0];
  if (!MIGRATION_NAME_RE.test(filename)) {
    console.error("Migration naming format is invalid.");
    console.error(`File: ${filename}`);
    console.error("Expected: NNN_YYYYMMDD_short_description.sql");
    process.exit(1);
  }

  const fileVersion = filename.split("_")[0];
  if (fileVersion !== version) {
    console.error(
      `Migration file version ${fileVersion} does not match requested ${version}.`
    );
    process.exit(1);
  }

  console.log("migration file:", `supabase/migrations/${filename}`);
  console.log("migration version:", version);
  console.log("expected project ref:", EXPECTED_PROJECT_REF);
  console.log("verified project ref:", projectRef);

  const accessToken = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exit(1);
  }

  const sql = readFileSync(join("supabase/migrations", filename), "utf8");
  console.log("Applying migration SQL via Supabase Management API...");
  await querySql(projectRef, accessToken, sql);
  console.log("Migration SQL applied.");

  console.log(`Linking Supabase CLI to ${EXPECTED_PROJECT_REF}...`);
  linkFindmyspaceSupabaseCli(env, accessToken);

  console.log(`Recording migration ${version} in schema_migrations...`);
  execSync(`npx supabase@latest migration repair --status applied ${version}`, {
    env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
    stdio: "inherit",
  });

  console.log("Migration apply completed.");
  console.log(`project: ${projectRef}`);
  console.log(`version: ${version}`);
  console.log(`file: supabase/migrations/${filename}`);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
