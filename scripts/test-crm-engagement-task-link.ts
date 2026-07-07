#!/usr/bin/env node
/**
 * CRM engagement task_id linking and timeline deduplication tests.
 * Run: npm run test:crm-engagement-task-link
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCrmTimelineItems,
  resolveEngagementTaskLink,
} from "../lib/crm-desktop/timeline-items.js";
import { resolveLegacyEngagementTaskId } from "../lib/crm-desktop/timeline-task-link.js";
import type { CrmEngagement } from "../lib/space-place/types.js";

const migration = readFileSync(
  "supabase/migrations/056_20260707_crm_engagement_task_reference.sql",
  "utf8"
);
const completeSource = readFileSync(
  "lib/space-place/complete-crm-task.ts",
  "utf8"
);

assert.match(migration, /ADD COLUMN IF NOT EXISTS task_id uuid/);
assert.match(migration, /crm_engagements_task_id_fkey/);
assert.match(migration, /ON DELETE SET NULL/);
assert.match(migration, /crm_engagements_task_completion_unique_idx/);
assert.match(migration, /crm_complete_task_record/);
assert.match(migration, /backfill scanned=%/);

assert.match(completeSource, /task_id: input\.taskId/);
assert.match(completeSource, /crm_complete_task_record/);

const taskA = {
  id: "task-a",
  organisation_id: "org-1",
  contact_id: null,
  title: "Follow up call",
  description: null,
  due_date: "2026-07-07",
  status: "open",
  priority: "normal",
  owner_id: "user-1",
  completed_at: null,
  created_at: "2026-07-06T10:00:00.000Z",
  updated_at: "2026-07-06T10:00:00.000Z",
};

const taskBDone = {
  ...taskA,
  id: "task-b",
  title: "Similar title",
  status: "done",
  completed_at: "2026-07-07T10:00:00.000Z",
};

const taskCDone = {
  ...taskA,
  id: "task-c",
  title: "Follow up call",
  status: "done",
  completed_at: "2026-07-07T10:00:00.000Z",
};

const explicitEng: CrmEngagement = {
    id: "eng-1",
    organisation_id: "org-1",
    contact_id: null,
    type: "task",
    summary: "Follow up call",
    outcome: "Done",
    direction: "internal",
    occurred_at: "2026-07-07T10:00:00.000Z",
    created_by: "user-1",
    created_at: "2026-07-07T10:00:00.000Z",
    task_id: "task-c",
  };
const explicitLink = resolveEngagementTaskLink(explicitEng, [taskCDone]);
assert.equal(explicitLink.taskId, "task-c");
assert.equal(explicitLink.legacy, false);

const zeroMatch = resolveEngagementTaskLink(
  {
    id: "eng-2",
    organisation_id: "org-1",
    contact_id: null,
    type: "task",
    summary: "Unknown",
    outcome: null,
    direction: "internal",
    occurred_at: "2026-07-07T10:00:00.000Z",
    created_by: null,
    created_at: "2026-07-07T10:00:00.000Z",
    task_id: null,
  } as CrmEngagement,
  []
);
assert.equal(zeroMatch.taskId, null);

const ambiguous = resolveEngagementTaskLink(
  {
    id: "eng-3",
    organisation_id: "org-1",
    contact_id: null,
    type: "task",
    summary: "Follow up call",
    outcome: null,
    direction: "internal",
    occurred_at: "2026-07-07T10:00:00.000Z",
    created_by: null,
    created_at: "2026-07-07T10:00:00.000Z",
    task_id: null,
  } as CrmEngagement,
  [
    taskCDone,
    { ...taskCDone, id: "task-d" },
  ]
);
assert.equal(ambiguous.taskId, null);
assert.equal(ambiguous.ambiguous, true);

const oneLegacy = resolveLegacyEngagementTaskId(
  {
    type: "task",
    summary: "Follow up call",
    occurred_at: "2026-07-07T10:00:00.000Z",
    organisation_id: "org-1",
  },
  [taskCDone]
);
assert.equal(oneLegacy, "task-c");

const openOnly = buildCrmTimelineItems({
  engagements: [],
  tasks: [taskA],
});
assert.equal(openOnly.length, 1);
assert.equal(openOnly[0]?.kind, "task");
assert.equal(openOnly[0]?.task_status, "open");

const completedDeduped = buildCrmTimelineItems({
  engagements: [
    {
      id: "eng-done",
      organisation_id: "org-1",
      contact_id: null,
      type: "task",
      summary: "Follow up call",
      outcome: "Connected",
      direction: "internal",
      occurred_at: "2026-07-07T10:00:00.000Z",
      created_by: "user-1",
      created_at: "2026-07-07T10:00:00.000Z",
      task_id: "task-c",
    },
  ],
  tasks: [taskCDone],
});
assert.equal(
  completedDeduped.filter((item) => item.task_id === "task-c").length,
  1,
  "completed task appears once"
);
assert.equal(completedDeduped[0]?.outcome, "Connected");
assert.equal(completedDeduped[0]?.task_status, "done");

const unmatchedHistorical = buildCrmTimelineItems({
  engagements: [
    {
      id: "eng-old",
      organisation_id: "org-1",
      contact_id: null,
      type: "task",
      summary: "Lost task",
      outcome: null,
      direction: "internal",
      occurred_at: "2026-01-01T10:00:00.000Z",
      created_by: null,
      created_at: "2026-01-01T10:00:00.000Z",
      task_id: null,
    },
  ],
  tasks: [],
});
assert.equal(unmatchedHistorical.length, 1);
assert.equal(unmatchedHistorical[0]?.task_missing, true);

const callStaysSeparate = buildCrmTimelineItems({
  engagements: [
    {
      id: "eng-call",
      organisation_id: "org-1",
      contact_id: null,
      type: "call",
      summary: "Phone call",
      outcome: null,
      direction: "outbound",
      occurred_at: "2026-07-07T09:00:00.000Z",
      created_by: null,
      created_at: "2026-07-07T09:00:00.000Z",
      task_id: null,
    },
  ],
  tasks: [taskA],
});
assert.equal(callStaysSeparate.length, 2);
assert.equal(callStaysSeparate.some((item) => item.type === "call"), true);

console.log("test-crm-engagement-task-link: all assertions passed");
