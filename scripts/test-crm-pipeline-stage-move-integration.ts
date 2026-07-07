#!/usr/bin/env tsx
/**
 * Live integration tests for migration 055 pipeline stage-move RPC.
 * Run: npm run test:crm-pipeline-stage-move-integration
 */

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { movePipelineOrganisationStage } from "../lib/crm-desktop/pipeline-stage-move";

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
const testTag = `crm-stage-move-${Date.now()}`;
const createdOrgIds: string[] = [];

async function getAdminProfileId() {
  const { data, error } = await admin
    .from("crm_profiles")
    .select("id")
    .eq("role", "admin")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    throw new Error("No active CRM admin profile found for integration tests.");
  }
  return data.id;
}

async function createTestOrg(stage: string) {
  const { data, error } = await admin
    .from("crm_organisations")
    .insert({
      name: `${testTag} org`,
      type: "school",
      pipeline_stage: stage,
      status: "new",
      pipeline_manual_rank: 5000,
    })
    .select("id, pipeline_stage, pipeline_manual_rank")
    .single();
  if (error) throw error;
  createdOrgIds.push(data.id);
  return data;
}

async function countEngagements(orgId: string, summary: string) {
  const { count, error } = await admin
    .from("crm_engagements")
    .select("id", { head: true, count: "exact" })
    .eq("organisation_id", orgId)
    .eq("summary", summary);
  if (error) throw error;
  return count ?? 0;
}

async function cleanup() {
  for (const orgId of createdOrgIds) {
    await admin.from("crm_pipeline_stage_operations").delete().eq("organisation_id", orgId);
    await admin.from("crm_engagements").delete().eq("organisation_id", orgId);
    await admin.from("crm_organisations").delete().eq("id", orgId);
  }
}

async function main() {
  const profileId = await getAdminProfileId();
  const org = await createTestOrg("prospect");
  const idempotencyKey = `test-${randomUUID()}`;

  const closedLost = await movePipelineOrganisationStage(admin, {
    organisationId: org.id,
    previousStage: "prospect",
    destinationStage: "closed_lost",
    profileId,
    idempotencyKey: `closed-${randomUUID()}`,
    sortMode: "manual",
  });
  assert.equal(closedLost.ok, false);
  if (!closedLost.ok) {
    assert.match(closedLost.error, /Closed \/ Not Now/i);
  }

  const move = await movePipelineOrganisationStage(admin, {
    organisationId: org.id,
    previousStage: "prospect",
    destinationStage: "first_contact",
    profileId,
    idempotencyKey,
    sortMode: "manual",
  });
  if (!move.ok) {
    throw new Error(move.error);
  }

  const { data: updated, error: fetchErr } = await admin
    .from("crm_organisations")
    .select(
      "pipeline_stage, pipeline_manual_rank, pipeline_rank_updated_at, pipeline_rank_updated_by"
    )
    .eq("id", org.id)
    .single();
  if (fetchErr) throw fetchErr;

  assert.equal(updated.pipeline_stage, "first_contact");
  assert.equal(typeof updated.pipeline_manual_rank, "number");
  assert.ok(updated.pipeline_rank_updated_at);
  assert.equal(updated.pipeline_rank_updated_by, profileId);
  assert.equal(await countEngagements(org.id, "Pipeline stage updated"), 1);

  const { data: idempotentRpc, error: idemErr } = await admin.rpc(
    "crm_move_organisation_pipeline_stage",
    {
      p_idempotency_key: idempotencyKey,
      p_organisation_id: org.id,
      p_profile_id: profileId,
      p_previous_stage: "prospect",
      p_destination_stage: "first_contact",
      p_pipeline_manual_rank: move.pipeline_manual_rank,
      p_contact_id: null,
      p_peer_rank_updates: [],
    }
  );
  if (idemErr) throw idemErr;
  assert.equal(idempotentRpc?.ok, true);
  assert.equal(await countEngagements(org.id, "Pipeline stage updated"), 1);

  const stale = await movePipelineOrganisationStage(admin, {
    organisationId: org.id,
    previousStage: "prospect",
    destinationStage: "follow_up",
    profileId,
    idempotencyKey: `stale-${randomUUID()}`,
    sortMode: "manual",
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.match(stale.error, /expected source stage/i);
  }

  const mcBefore = await admin
    .from("crm_marketing_contacts")
    .select("id", { head: true, count: "exact" });
  if (mcBefore.error) throw mcBefore.error;

  console.log("test-crm-pipeline-stage-move-integration: all assertions passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
