#!/usr/bin/env node
/**
 * Targeted apply for migration 057 only (marketing templates + campaign extensions).
 * Run: node --env-file=.env.local scripts/apply-migration-057.mjs
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
const VERSION = "057";

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
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '057' OR version LIKE '057_%';"
  );
  const recorded = history.length > 0;
  console.log("remote_057_recorded:", recorded, history);

  const tables = await querySql(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'crm_marketing_templates';
  `);
  const hasTemplatesTable = tables.length > 0;
  console.log("crm_marketing_templates_exists:", hasTemplatesTable);

  const columns = await querySql(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_marketing_campaigns'
      AND column_name IN ('audience_definition', 'template_snapshot_json', 'sender_email');
  `);
  const hasCampaignColumns = columns.length >= 3;
  console.log("campaign_extension_columns:", columns);

  if (!hasTemplatesTable || !hasCampaignColumns) {
    console.log("Applying migration 057 SQL...");
    const sql = readFileSync(
      "supabase/migrations/057_20260707_crm_marketing_templates_campaigns.sql",
      "utf8"
    );
    await querySql(sql);
    console.log("Migration SQL applied.");
  } else {
    console.log("Schema objects already exist — skipping SQL apply.");
  }

  if (!recorded) {
    console.log("Recording migration 057 in schema_migrations...");
    execSync(`npx supabase@latest migration repair --status applied ${VERSION}`, {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      stdio: "inherit",
    });
  }

  const historyAfter = await querySql(
    "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '057' OR version LIKE '057_%';"
  );
  console.log("remote history 057:", historyAfter);

  try {
    const list = execSync("npx supabase@latest migration list", {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      encoding: "utf8",
    });
    const line057 = list
      .split("\n")
      .find((line) => line.includes("057") || line.includes("057_"));
    console.log("migration list 057:", line057?.trim() || "not found in list output");
  } catch (e) {
    console.warn("migration list failed:", e.message);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
