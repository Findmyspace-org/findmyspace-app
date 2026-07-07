#!/usr/bin/env node
/**
 * Cross-column pipeline stage move tests (static + rank logic).
 * Run: npm run test:crm-pipeline-stage-move
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computePipelineInsertRank } from "../lib/crm-desktop/pipeline-rank.js";
import type { CrmOrganisationListRow } from "../lib/crm-desktop/types.js";

function row(
  partial: Partial<CrmOrganisationListRow> & Pick<CrmOrganisationListRow, "id" | "name">
): CrmOrganisationListRow {
  return {
    type: null,
    address: null,
    pipeline_stage: "prospect",
    status: "active",
    assigned_to: null,
    assigned_name: null,
    primary_contact_id: null,
    primary_contact_name: null,
    primary_contact_role: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    additional_contacts: [],
    contact_count: 0,
    space_count: 0,
    property_count: 0,
    last_interaction_at: null,
    last_interaction_summary: null,
    next_task_id: null,
    next_task_due: null,
    next_task_title: null,
    next_action_title: null,
    next_action_date: null,
    next_action_date_group: "none",
    pipeline_manual_rank: null,
    pipeline_rank_updated_at: null,
    pipeline_rank_updated_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const destinationRows = [
  row({ id: "a", name: "A", pipeline_manual_rank: 1000 }),
  row({ id: "b", name: "B", pipeline_manual_rank: 2000 }),
];

const insertBeforeB = computePipelineInsertRank({
  stageRows: destinationRows,
  movingOrganisationId: "moved",
  beforeOrganisationId: "b",
  sortMode: "manual",
});
assert.equal(insertBeforeB.rank, 1500);
assert.equal(insertBeforeB.needsNormalization, false);

const dragSource = readFileSync(
  "app/components/crm-desktop/useCrmPipelineDrag.ts",
  "utf8"
);
assert.match(dragSource, /moveCrmPipelineOrganisationStage/);
assert.ok(!dragSource.includes("updateCrmPipelineStage"));
assert.match(dragSource, /revertMove/);
assert.match(dragSource, /confirmClosedLost/);
assert.match(dragSource, /reorderCrmPipelineCard/);

const moveRoute = readFileSync(
  "app/api/admin/crm/desktop/pipeline/move-stage/route.ts",
  "utf8"
);
assert.match(moveRoute, /movePipelineOrganisationStage/);
assert.match(moveRoute, /requireCrmDesktopApi/);
assert.match(moveRoute, /Failed to move organisation/);

const moveLib = readFileSync("lib/crm-desktop/pipeline-stage-move.ts", "utf8");
assert.match(moveLib, /crm_move_organisation_pipeline_stage/);
assert.match(moveLib, /closed_lost/);
assert.match(moveLib, /idempotencyKey/);

const reorderLib = readFileSync("lib/crm-desktop/pipeline-reorder.ts", "utf8");
assert.ok(!/\.select\(\s*[^)]*next_task_due/.test(reorderLib));
assert.ok(!reorderLib.includes("pipeline_stage ="));

const migration = readFileSync(
  "supabase/migrations/055_20260707_crm_pipeline_stage_move_rpc.sql",
  "utf8"
);
assert.match(migration, /crm_pipeline_stage_operations/);
assert.match(migration, /idempotency_key/);
assert.match(migration, /Pipeline stage updated/);
assert.match(migration, /FOR UPDATE/);

const closeLostRoute = readFileSync(
  "app/api/admin/crm/desktop/pipeline/close-lost/route.ts",
  "utf8"
);
assert.match(closeLostRoute, /closeOrganisationPipelineLost/);

console.log("test-crm-pipeline-stage-move: all assertions passed");
