#!/usr/bin/env tsx
/**
 * Live integration tests for Closed / Not Now close (RPC or legacy fallback).
 * Run: npm run test:crm-close-pipeline
 */

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { closeOrganisationPipelineLost } from "../lib/crm-marketing/close-pipeline";

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

const testTag = `crm-close-test-${Date.now()}`;
const created = {
  orgIds: [] as string[],
  contactIds: [] as string[],
  marketingContactIds: [] as string[],
};

async function getAdminProfileId() {
  const { data, error } = await admin
    .from("crm_profiles")
    .select("id")
    .eq("role", "admin")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("No active CRM admin profile found for integration tests.");
  return data.id;
}

async function createTestOrg(stage = "follow_up") {
  const { data, error } = await admin
    .from("crm_organisations")
    .insert({
      name: `${testTag} org`,
      type: "school",
      pipeline_stage: stage,
      status: "new",
    })
    .select("id, pipeline_stage")
    .single();
  if (error) throw error;
  created.orgIds.push(data.id);
  return data;
}

async function createContact(orgId: string, email: string, name: string) {
  const { data, error } = await admin
    .from("crm_contacts")
    .insert({
      organisation_id: orgId,
      full_name: name,
      email,
      role: "Test role",
    })
    .select("id")
    .single();
  if (error) throw error;
  created.contactIds.push(data.id);
  return data.id;
}

async function countRows(table: string, filters: Record<string, string>) {
  let query = admin.from(table).select("id", { head: true, count: "exact" });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function cleanup() {
  for (const orgId of created.orgIds) {
    await admin.from("crm_pipeline_close_operations").delete().eq("organisation_id", orgId);
    await admin.from("crm_marketing_audits").delete().eq("crm_organisation_id", orgId);
    const { data: mcRows } = await admin
      .from("crm_marketing_contacts")
      .select("id")
      .eq("crm_organisation_id", orgId);
    const mcIds = (mcRows || []).map((row) => row.id);
    if (mcIds.length) {
      await admin.from("crm_marketing_list_members").delete().in("marketing_contact_id", mcIds);
      await admin.from("crm_marketing_contacts").delete().in("id", mcIds);
    }
    await admin.from("crm_engagements").delete().eq("organisation_id", orgId);
    await admin.from("crm_tasks").delete().eq("organisation_id", orgId);
    await admin.from("crm_contacts").delete().eq("organisation_id", orgId);
    await admin.from("crm_organisations").delete().eq("id", orgId);
  }
}

async function main() {
  const profileId = await getAdminProfileId();
  const org = await createTestOrg("in_progress");
  const contactA = await createContact(org.id, `${testTag}.a@example.com`, "Eligible Contact");
  const contactB = await createContact(org.id, `${testTag}.b@example.com`, "Suppressed Contact");

  const { data: suppressedMc, error: suppressedErr } = await admin
    .from("crm_marketing_contacts")
    .insert({
      crm_contact_id: contactB,
      crm_organisation_id: org.id,
      email: `${testTag}.b@example.com`,
      email_normalised: `${testTag}.b@example.com`,
      status: "suppressed",
      consent_status: "unknown",
      lawful_basis: "none",
      suppressed_at: new Date().toISOString(),
      created_from: "integration_test",
    })
    .select("id")
    .single();
  if (suppressedErr) throw suppressedErr;
  created.marketingContactIds.push(suppressedMc.id);

  const idempotencyKey = randomUUID();
  const baseInput = {
    organisationId: org.id,
    previousStage: "in_progress",
    profileId,
    idempotencyKey,
    lostReason: "Integration test close",
    outcomeCategory: "not_now",
    detailNote: "Detail note",
    marketingAudienceMode: "general_updates" as const,
    selectedContactIds: [contactA, contactB, contactA],
    createFollowUpTask: true,
    taskTitle: `Revisit ${testTag} org`,
    taskDueDate: "2026-12-01",
    taskOwnerId: profileId,
    taskContactId: contactA,
  };

  const first = await closeOrganisationPipelineLost(admin, baseInput);
  assert.equal(first.ok, true, `first close failed: ${first.error || "unknown"}`);

  const { data: orgAfter } = await admin
    .from("crm_organisations")
    .select("pipeline_stage, lost_reason")
    .eq("id", org.id)
    .single();
  assert.equal(orgAfter?.pipeline_stage, "closed_lost");
  assert.match(orgAfter?.lost_reason || "", /Integration test close/);
  assert.equal(await countRows("crm_engagements", { organisation_id: org.id }), 1);
  assert.equal(await countRows("crm_tasks", { organisation_id: org.id }), 1);

  const { data: mcRows } = await admin
    .from("crm_marketing_contacts")
    .select("id, crm_contact_id, status, suppressed_at")
    .eq("crm_organisation_id", org.id);
  assert.equal(mcRows?.length, 2);
  const mcA = mcRows?.find((row) => row.crm_contact_id === contactA);
  const mcB = mcRows?.find((row) => row.crm_contact_id === contactB);
  assert.equal(mcA?.status, "pending_consent");
  assert.equal(mcB?.status, "suppressed");
  assert.ok(mcB?.suppressed_at);

  const retry = await closeOrganisationPipelineLost(admin, baseInput);
  assert.equal(retry.ok, true);
  assert.equal(retry.taskId, first.taskId);
  assert.equal(await countRows("crm_engagements", { organisation_id: org.id }), 1);
  assert.equal(await countRows("crm_tasks", { organisation_id: org.id }), 1);

  const differentKey = randomUUID();
  const secondClose = await closeOrganisationPipelineLost(admin, {
    ...baseInput,
    idempotencyKey: differentKey,
    lostReason: "Should not apply",
    outcomeCategory: "other",
    marketingAudienceMode: "none",
    selectedContactIds: [],
    createFollowUpTask: false,
  });
  assert.equal(secondClose.ok, false);
  assert.match(secondClose.error || "", /already in Closed/i);

  const failOrg = await createTestOrg("follow_up");
  const failed = await closeOrganisationPipelineLost(admin, {
    organisationId: failOrg.id,
    previousStage: "follow_up",
    profileId,
    idempotencyKey: randomUUID(),
    lostReason: "Failure test",
    outcomeCategory: "other",
    marketingAudienceMode: "store_only",
    selectedContactIds: [],
    createFollowUpTask: true,
    taskTitle: "Should rollback",
    taskOwnerId: "00000000-0000-0000-0000-000000000099",
  });
  assert.equal(failed.ok, false);

  const { data: failOrgAfter } = await admin
    .from("crm_organisations")
    .select("pipeline_stage")
    .eq("id", failOrg.id)
    .single();
  assert.equal(failOrgAfter?.pipeline_stage, "follow_up");
  assert.equal(await countRows("crm_tasks", { organisation_id: failOrg.id }), 0);

  console.log("test-crm-close-pipeline-integration: all passed");
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
