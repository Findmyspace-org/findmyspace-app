#!/usr/bin/env tsx
/**
 * Live browser verification for Closed / Not Now Kanban flow (CRM admin).
 * Run: npm run verify:crm-pipeline-browser
 *
 * Requires local dev server and .env.local service role key.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

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

const env = loadEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const baseUrl = (process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const testTag = `browser-close-${Date.now()}`;

const created = { orgId: "", contactId: "", idempotencyKey: randomUUID() };

async function getAdminAuth() {
  const { data: profile, error } = await admin
    .from("crm_profiles")
    .select("id, email")
    .eq("role", "admin")
    .eq("active", true)
    .not("email", "is", null)
    .limit(1)
    .maybeSingle();
  if (error || !profile?.email) {
    throw new Error("No CRM admin email available for browser verification.");
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
    options: { redirectTo: `${baseUrl}/admin/crm/pipeline?view=board` },
  });
  if (linkError || !linkData?.properties?.action_link) {
    throw new Error(`Could not generate admin magic link: ${linkError?.message || "unknown"}`);
  }
  return { profileId: profile.id as string, actionLink: linkData.properties.action_link };
}

async function seedOrganisation(profileId: string) {
  const { data: org, error } = await admin
    .from("crm_organisations")
    .insert({
      name: `${testTag} Browser Test Org`,
      type: "school",
      pipeline_stage: "follow_up",
      status: "new",
      assigned_to: profileId,
    })
    .select("id")
    .single();
  if (error) throw error;
  created.orgId = org.id;

  const { data: contact, error: contactError } = await admin
    .from("crm_contacts")
    .insert({
      organisation_id: org.id,
      full_name: "Browser Test Contact",
      email: `${testTag}@example.com`,
      role: "Coordinator",
    })
    .select("id")
    .single();
  if (contactError) throw contactError;
  created.contactId = contact.id;
}

async function cleanup() {
  if (!created.orgId) return;
  await admin.from("crm_pipeline_close_operations").delete().eq("organisation_id", created.orgId);
  await admin.from("crm_marketing_audits").delete().eq("crm_organisation_id", created.orgId);
  const { data: mcRows } = await admin
    .from("crm_marketing_contacts")
    .select("id")
    .eq("crm_organisation_id", created.orgId);
  const mcIds = (mcRows || []).map((row) => row.id);
  if (mcIds.length) {
    await admin.from("crm_marketing_list_members").delete().in("marketing_contact_id", mcIds);
    await admin.from("crm_marketing_contacts").delete().in("id", mcIds);
  }
  await admin.from("crm_engagements").delete().eq("organisation_id", created.orgId);
  await admin.from("crm_tasks").delete().eq("organisation_id", created.orgId);
  await admin.from("crm_contacts").delete().eq("organisation_id", created.orgId);
  await admin.from("crm_organisations").delete().eq("id", created.orgId);
}

async function launchBrowser() {
  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);
  if (isLocal) {
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : undefined);
    if (!executablePath) {
      throw new Error("Set PUPPETEER_EXECUTABLE_PATH for local browser verification.");
    }
    return puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

async function main() {
  const { profileId, actionLink } = await getAdminAuth();
  await seedOrganisation(profileId);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    await page.goto(actionLink, { waitUntil: "networkidle2" });
    await page.goto(
      `${baseUrl}/admin/crm/pipeline?view=board&q=${encodeURIComponent(testTag)}`,
      { waitUntil: "networkidle2" }
    );

    const pageUrl = page.url();
    const pageText = await page.evaluate(() => document.body.innerText);
    if (!pageUrl.includes("/admin/crm/pipeline")) {
      throw new Error(`Expected pipeline board after admin login, got ${pageUrl}`);
    }
    if (/sign in|log in|unauthorized|access denied/i.test(pageText)) {
      throw new Error("Admin authentication failed for browser verification.");
    }

    const cardSelector = `[data-organisation-id="${created.orgId}"]`;
    await page.waitForSelector(cardSelector, { timeout: 30000 });

    const closedColumn = await page.waitForSelector(
      '[data-pipeline-stage="closed_lost"]',
      { timeout: 10000 }
    );
    assert.ok(closedColumn, "Closed / Not Now column not found");

    const card = await page.$(cardSelector);
    assert.ok(card, "Test organisation card not found on board");
    const handle = await card.$("[data-drag-handle]");
    assert.ok(handle, "Drag handle not found");
    const handleBox = await handle.boundingBox();
    const columnBox = await closedColumn.boundingBox();
    assert.ok(handleBox && columnBox, "Could not measure drag targets");

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 40, { steps: 25 });
    await page.mouse.up();

    await page.waitForSelector('[data-testid="crm-closed-lost-confirmation"]', {
      timeout: 10000,
    });

    await page.click('[data-testid="crm-closed-lost-cancel"]');
    await page.waitForFunction(
      (orgId) => {
        const el = document.querySelector(`[data-organisation-id="${orgId}"]`);
        const column = el?.closest("[data-pipeline-stage]");
        return column?.getAttribute("data-pipeline-stage") !== "closed_lost";
      },
      {},
      created.orgId
    );

    const cardAfterCancel = await page.$(cardSelector);
    assert.ok(cardAfterCancel, "Card missing after cancel");
    const handleAfterCancel = await cardAfterCancel.$("[data-drag-handle]");
    assert.ok(handleAfterCancel, "Drag handle missing after cancel");
    const handleBoxAfterCancel = await handleAfterCancel.boundingBox();
    assert.ok(handleBoxAfterCancel && columnBox, "Could not measure drag targets after cancel");

    await page.mouse.move(
      handleBoxAfterCancel.x + handleBoxAfterCancel.width / 2,
      handleBoxAfterCancel.y + handleBoxAfterCancel.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 40, { steps: 25 });
    await page.mouse.up();
    await page.waitForSelector('[data-testid="crm-closed-lost-confirmation"]');
    await page.waitForFunction(() => !document.body.innerText.includes("Loading contacts"), {
      timeout: 15000,
    });

    await page.select('[data-testid="crm-closed-lost-outcome"]', "not_now");
    await page.type('[data-testid="crm-closed-lost-reason"]', "Browser verification close");
    await page.click('[data-testid="crm-closed-lost-confirm"]');

    await page.waitForFunction(
      (orgId) => {
        const el = document.querySelector(`[data-organisation-id="${orgId}"]`);
        const column = el?.closest("[data-pipeline-stage]");
        return column?.getAttribute("data-pipeline-stage") === "closed_lost";
      },
      { timeout: 20000 },
      created.orgId
    );

    await page.goto(`${baseUrl}/admin/crm/marketing/contacts?search=${encodeURIComponent(testTag)}`, {
      waitUntil: "networkidle2",
    });
    const marketingText = await page.evaluate(() => document.body.innerText);
    assert.match(marketingText, /Browser Test Contact|Browser verification/i);

    await page.goto(`${baseUrl}/admin/crm/marketing`, { waitUntil: "networkidle2" });
    const overviewText = await page.evaluate(() => document.body.innerText);
    assert.match(overviewText, /marketing audience are not automatically eligible/i);

    await page.goto(`${baseUrl}/admin/crm/marketing/campaigns`, {
      waitUntil: "networkidle2",
    });
    const campaignsText = await page.evaluate(() => document.body.innerText);
    assert.match(campaignsText, /not enabled|draft|not.*send/i);

    console.log("verify-crm-pipeline-browser: all passed");
    console.log(`Test organisation: ${created.orgId}`);
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (cleanupErr) {
      console.error("Cleanup failed:", cleanupErr);
      process.exitCode = 1;
    }
  });
