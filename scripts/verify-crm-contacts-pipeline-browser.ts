#!/usr/bin/env tsx
/**
 * Browser verification for CRM contacts tab + pipeline board basics.
 * Run: npm run verify:crm-contacts-pipeline-browser
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

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
const testTag = `browser-crm-${Date.now()}`;

const created = { orgId: "", contactA: "", contactB: "" };

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
    options: { redirectTo: `${baseUrl}/admin/crm` },
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
      name: `${testTag} Contacts Pipeline Org`,
      type: "school",
      pipeline_stage: "follow_up",
      status: "new",
      assigned_to: profileId,
    })
    .select("id")
    .single();
  if (error) throw error;
  created.orgId = org.id;

  const { data: contactA, error: contactAError } = await admin
    .from("crm_contacts")
    .insert({
      organisation_id: org.id,
      full_name: `${testTag} Alice`,
      email: `${testTag}-alice@example.com`,
      phone: "082 111 2222",
      role: "Manager",
    })
    .select("id")
    .single();
  if (contactAError) throw contactAError;
  created.contactA = contactA.id;

  const { data: contactB, error: contactBError } = await admin
    .from("crm_contacts")
    .insert({
      organisation_id: org.id,
      full_name: `${testTag} Bob`,
      email: `${testTag}-bob@example.com`,
      phone: "082 333 4444",
      role: "Coordinator",
    })
    .select("id")
    .single();
  if (contactBError) throw contactBError;
  created.contactB = contactB.id;

  await admin.from("crm_tasks").insert({
    organisation_id: org.id,
    title: `${testTag} overdue task`,
    due_date: "2020-01-01",
    status: "open",
    priority: "normal",
    owner_id: profileId,
  });
}

async function cleanup() {
  if (!created.orgId) return;
  await admin.from("crm_pipeline_close_operations").delete().eq("organisation_id", created.orgId);
  await admin.from("crm_engagements").delete().eq("organisation_id", created.orgId);
  await admin.from("crm_tasks").delete().eq("organisation_id", created.orgId);
  await admin.from("crm_contacts").delete().eq("organisation_id", created.orgId);
  await admin.from("crm_organisations").delete().eq("id", created.orgId);
}

async function clickButtonByLabel(page: import("puppeteer-core").Page, label: string) {
  const clicked = await page.evaluate((buttonLabel) => {
    const button = [...document.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === buttonLabel
    );
    if (!button) return false;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }, label);
  assert.ok(clicked, `Button "${label}" not found`);
}

async function main() {
  const { profileId, actionLink } = await getAdminAuth();
  await seedOrganisation(profileId);

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined);
  if (!executablePath) {
    throw new Error("Set PUPPETEER_EXECUTABLE_PATH for local browser verification.");
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    await page.goto(actionLink, { waitUntil: "networkidle2" });
    await page.goto(
      `${baseUrl}/admin/crm/organisations/${created.orgId}?tab=contacts`,
      { waitUntil: "networkidle2" }
    );

    await page.waitForFunction(
      (contactA) => {
        const row = document.querySelector(`[data-contact-id="${contactA}"]`);
        return Boolean(row && row.textContent?.includes("Alice"));
      },
      { timeout: 45000 },
      created.contactA
    );

    const contactsText = await page.evaluate(() => document.body.innerText);
    assert.match(contactsText, new RegExp(`${testTag} Alice`));
    assert.match(contactsText, /Manager/);
    assert.match(contactsText, new RegExp(`${testTag}-alice@example.com`));
    assert.match(contactsText, /082 111 2222/);
    assert.doesNotMatch(contactsText, /Primary/);

    await clickButtonByLabel(page, "Set as primary");
    await page.waitForFunction(() => document.body.innerText.includes("Primary"), {
      timeout: 10000,
    });

    await page.reload({ waitUntil: "networkidle2" });
    assert.match(await page.evaluate(() => document.body.innerText), /Primary/);

    const primaryOnAlice = await page.evaluate((contactA) => {
      const row = document.querySelector(`[data-contact-id="${contactA}"]`);
      return row?.textContent?.includes("Primary") ?? false;
    }, created.contactA);
    assert.equal(primaryOnAlice, true);

    const bobRow = await page.$(`[data-contact-id="${created.contactB}"]`);
    assert.ok(bobRow);
    await bobRow.evaluate((row) => {
      const button = [...row.querySelectorAll("button")].find((el) =>
        el.textContent?.trim().includes("Set as primary")
      );
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await page.waitForFunction(
      (contactB) => {
        const row = document.querySelector(`[data-contact-id="${contactB}"]`);
        return row?.textContent?.includes("Primary") ?? false;
      },
      { timeout: 10000 },
      created.contactB
    );

    await page.goto(
      `${baseUrl}/admin/crm/pipeline?view=board&q=${encodeURIComponent(testTag)}`,
      { waitUntil: "networkidle2" }
    );

    const cardSelector = `[data-organisation-id="${created.orgId}"]`;
    await page.waitForSelector(cardSelector, { timeout: 20000 });
    const cardText = await page.$eval(cardSelector, (el) => el.textContent || "");
    assert.match(cardText, /overdue task/i);

    console.log("verify-crm-contacts-pipeline-browser: passed");
  } finally {
    await browser.close();
    await cleanup();
  }
}

main().catch(async (err) => {
  console.error(err);
  await cleanup();
  process.exit(1);
});
