#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

if (!existsSync(".env.local")) {
  console.error("no .env.local");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
const site = env.NEXT_PUBLIC_SITE_URL || "";
const ref = url ? new URL(url).hostname.split(".")[0] : "unknown";
const siteHost = site ? new URL(site).hostname : "unknown";
let environment = "unknown";
if (/localhost|127\.0\.0\.1/.test(siteHost)) environment = "local";
else if (/staging|preview|dev\./i.test(siteHost)) environment = "staging/development";
else if (siteHost !== "unknown") environment = "production or hosted";

console.log(JSON.stringify({ projectRef: ref, siteHost, environment }, null, 2));
