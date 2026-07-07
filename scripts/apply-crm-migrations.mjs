#!/usr/bin/env node
/**
 * Apply pending Supabase migrations to the linked project.
 * Run: node --env-file=.env.local scripts/apply-crm-migrations.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

function loadEnvLocal() {
  if (!existsSync(".env.local")) {
    throw new Error(".env.local not found");
  }
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
if (!supabaseUrl) {
  console.error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const accessToken = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
if (!accessToken) {
  console.error("SUPABASE_ACCESS_TOKEN is required for supabase db push.");
  process.exit(1);
}

console.log(`Repository: ${process.cwd()}`);
console.log(`Target project ref: ${projectRef}`);
console.log("Applying migrations with: npx supabase@latest db push");

try {
  execSync(`npx supabase@latest link --project-ref ${projectRef}`, {
    env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
    stdio: "inherit",
  });
} catch {
  console.warn("supabase link reported a non-fatal issue (project may already be linked).");
}

execSync("npx supabase@latest db push", {
  env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
  stdio: "inherit",
});

console.log("Migration push completed.");
