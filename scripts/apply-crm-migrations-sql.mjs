#!/usr/bin/env node
/**
 * Apply SQL migrations via Supabase Management API (fallback when CLI link fails).
 * Run: node --env-file=.env.local scripts/apply-crm-migrations-sql.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
if (!supabaseUrl || !accessToken) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN are required.");
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const migrationFiles = [
  "051_20260707_crm_marketing.sql",
  "052_20260707_crm_close_pipeline_rpc.sql",
];

async function runSql(query) {
  const response = await fetch(
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

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String(body.message)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

console.log(`Repository: ${process.cwd()}`);
console.log(`Target project ref: ${projectRef}`);
console.log("Applying migrations via Supabase Management API");

for (const file of migrationFiles) {
  const sql = readFileSync(join("supabase/migrations", file), "utf8");
  console.log(`Applying ${file} ...`);
  await runSql(sql);
  console.log(`Applied ${file}`);
}

console.log("SQL migration apply completed.");
