#!/usr/bin/env node
/**
 * Abort unless the intended Supabase target is exactly the FindMySpace project.
 * Never prints access tokens, passwords, or API keys.
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const EXPECTED_PROJECT_REF = "ppdaubmxrmzgmxdnyxff";

const PROJECT_REF_FILE = "supabase/.temp/project-ref";
const LINKED_PROJECT_FILE = "supabase/.temp/linked-project.json";

function loadEnvLocal() {
  if (!existsSync(".env.local")) {
    return {};
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

function parseProjectRefFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return null;
  }
  try {
    const hostname = new URL(rawUrl.trim()).hostname;
    const ref = hostname.split(".")[0] || "";
    return ref || null;
  } catch {
    return null;
  }
}

export function inspectCliLinkedProject() {
  let projectRefFile = null;
  if (existsSync(PROJECT_REF_FILE)) {
    const value = readFileSync(PROJECT_REF_FILE, "utf8").trim();
    projectRefFile = value || null;
  }

  let linkedJsonRef = null;
  let linkedJsonError = null;
  if (existsSync(LINKED_PROJECT_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(LINKED_PROJECT_FILE, "utf8"));
      const ref =
        parsed && typeof parsed === "object" ? String(parsed.ref || "").trim() : "";
      if (!ref) {
        linkedJsonError = "linked-project.json is missing ref";
      } else {
        linkedJsonRef = ref;
      }
    } catch {
      linkedJsonError = "linked-project.json is not valid JSON";
    }
  }

  let display = "missing";
  if (linkedJsonError) {
    display = projectRefFile
      ? `project-ref=${projectRefFile}; ${linkedJsonError}`
      : linkedJsonError;
  } else if (projectRefFile && linkedJsonRef) {
    display =
      projectRefFile === linkedJsonRef
        ? projectRefFile
        : `project-ref=${projectRefFile}; linked-project.json=${linkedJsonRef}`;
  } else if (projectRefFile) {
    display = projectRefFile;
  } else if (linkedJsonRef) {
    display = linkedJsonRef;
  }

  return { projectRefFile, linkedJsonRef, linkedJsonError, display };
}

function abortSafetyCheck({ environmentTarget, cliLinkedTarget, extra }) {
  console.error("FINDMYSPACE DATABASE SAFETY CHECK FAILED");
  console.error("");
  console.error("Expected:");
  console.error(EXPECTED_PROJECT_REF);
  console.error("");
  console.error("Environment target:");
  console.error(environmentTarget || "missing");
  console.error("");
  console.error("CLI linked target:");
  console.error(cliLinkedTarget || "missing");
  console.error("");
  if (extra) {
    console.error(extra);
    console.error("");
  }
  console.error("DATABASE OPERATION ABORTED.");
  console.error("No SQL was executed.");
  process.exit(1);
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [providedEnv]
 * @returns {{
 *   projectRef: string,
 *   environmentTarget: string,
 *   cliLinkedTarget: string,
 *   cli: ReturnType<typeof inspectCliLinkedProject>,
 * }}
 */
export function assertFindmyspaceSupabaseTarget(providedEnv) {
  const env = providedEnv ?? { ...process.env, ...loadEnvLocal() };
  const environmentTarget = parseProjectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const cli = inspectCliLinkedProject();

  const mismatched =
    environmentTarget !== EXPECTED_PROJECT_REF ||
    Boolean(cli.linkedJsonError) ||
    (cli.projectRefFile !== null && cli.projectRefFile !== EXPECTED_PROJECT_REF) ||
    (cli.linkedJsonRef !== null && cli.linkedJsonRef !== EXPECTED_PROJECT_REF);

  if (mismatched) {
    abortSafetyCheck({
      environmentTarget: environmentTarget || "missing",
      cliLinkedTarget: cli.display,
    });
  }

  return {
    projectRef: EXPECTED_PROJECT_REF,
    environmentTarget,
    cliLinkedTarget: cli.display,
    cli,
  };
}

/**
 * Link the Supabase CLI to the hardcoded FindMySpace project.
 * Aborts on failure. Never continues to db push or migration repair.
 */
export function linkFindmyspaceSupabaseCli(env, accessToken) {
  if (!accessToken) {
    abortSafetyCheck({
      environmentTarget: EXPECTED_PROJECT_REF,
      cliLinkedTarget: inspectCliLinkedProject().display,
      extra: "SUPABASE_ACCESS_TOKEN is required to link the Supabase CLI.",
    });
  }

  try {
    execSync(`npx supabase@latest link --project-ref ${EXPECTED_PROJECT_REF}`, {
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      stdio: "inherit",
    });
  } catch {
    abortSafetyCheck({
      environmentTarget: EXPECTED_PROJECT_REF,
      cliLinkedTarget: inspectCliLinkedProject().display,
      extra: "Supabase CLI link failed. No migration repair will run.",
    });
  }

  return assertFindmyspaceSupabaseTarget(env);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isDirectRun()) {
  const env = { ...process.env, ...loadEnvLocal() };
  const verified = assertFindmyspaceSupabaseTarget(env);
  console.log("FindMySpace database target verified.");
  console.log(`Expected: ${EXPECTED_PROJECT_REF}`);
  console.log(`Environment target: ${verified.environmentTarget}`);
  console.log(`CLI linked target: ${verified.cliLinkedTarget}`);
  console.log(`Verified project ref: ${verified.projectRef}`);
}
