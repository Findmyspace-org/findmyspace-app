#!/usr/bin/env node
/**
 * Shared CRM mutation tests (mock store, no DB).
 * Run: npm run test:crm-mutations
 */

import assert from "node:assert/strict";
import type { CrmMutationStore } from "../lib/space-place/crm-mutation-store";
import {
  completeCrmTaskWithStore,
  validateCompleteCrmTaskInput,
} from "../lib/space-place/complete-crm-task";

type TaskRow = Record<string, unknown> & { id: string };

function createMockStore(seed: {
  tasks?: Record<string, TaskRow>;
  organisations?: Record<string, Record<string, unknown>>;
} = {}) {
  const tasks = new Map(
    Object.entries(seed.tasks || {}).map(([id, row]) => [id, { ...row }])
  );
  const engagements: Record<string, unknown>[] = [];
  const organisations = new Map(
    Object.entries(seed.organisations || {}).map(([id, row]) => [id, { ...row }])
  );

  const store: CrmMutationStore = {
    tasks: () => ({
      update: (patch) => ({
        eq: async (col, val) => {
          if (col !== "id") return { error: { message: "unsupported" } };
          const row = tasks.get(val);
          if (!row) return { error: { message: "task not found" } };
          Object.assign(row, patch);
          return { error: null };
        },
      }),
      insert: async (row) => {
        const id = `task-${tasks.size + 1}`;
        tasks.set(id, { id, ...row });
        return { error: null };
      },
    }),
    engagements: () => ({
      insert: async (row) => {
        if (
          row.type === "task" &&
          row.task_id &&
          engagements.some(
            (e) => e.type === "task" && e.task_id === row.task_id
          )
        ) {
          return { error: { message: "duplicate task completion engagement" } };
        }
        engagements.push(row);
        return { error: null };
      },
      select: () => ({
        eq: (col, val) => ({
          eq: (col2, val2) => ({
            maybeSingle: async () => {
              const found = engagements.find(
                (e) => e[col] === val && e[col2] === val2
              );
              return { data: found ? { id: "eng-existing" } : null, error: null };
            },
          }),
        }),
      }),
    }),
    organisations: () => ({
      update: (patch) => ({
        eq: async (_col, val) => {
          const row = organisations.get(val);
          if (!row) return { error: { message: "org not found" } };
          Object.assign(row, patch);
          return { error: null };
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    contacts: () => ({
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  };

  return {
    store,
    state: () => ({ tasks, engagements, organisations }),
  };
}

const baseInput = {
  taskId: "t1",
  organisationId: "org-1",
  contactId: "contact-1",
  taskTitle: "Call venue",
  profileId: "user-1",
  outcomeValue: "connected",
  extraNotes: "Good chat",
  applyPipelineUpdate: false,
  currentPipelineStage: "prospect" as const,
  createFollowUp: false,
};

async function run() {
const { store, state } = createMockStore({
  tasks: {
    t1: {
      id: "t1",
      status: "open",
      organisation_id: "org-1",
      contact_id: "contact-1",
      title: "Call venue",
    },
  },
  organisations: {
    "org-1": { id: "org-1", pipeline_stage: "prospect" },
  },
});

let result = await completeCrmTaskWithStore(store, baseInput);
assert.equal(result.error, null);
assert.equal(state().tasks.get("t1")?.status, "done");
assert.equal(state().engagements.length, 1);
assert.equal(state().engagements[0].type, "task");
assert.equal(state().engagements[0].task_id, "t1");

result = await completeCrmTaskWithStore(store, baseInput);
assert.equal(result.error, null);
assert.equal(state().engagements.length, 1, "duplicate completion is idempotent");

const followUpMock = createMockStore({
  tasks: {
    t1: { id: "t1", status: "open", organisation_id: "org-1", contact_id: null },
  },
  organisations: { "org-1": { pipeline_stage: "first_contact" } },
});

result = await completeCrmTaskWithStore(followUpMock.store, {
  ...baseInput,
  contactId: null,
  createFollowUp: true,
  followUpTitle: "Follow up",
  followUpDueDate: "2026-07-10",
  followUpPriority: "normal",
  followUpOwnerId: "user-2",
});
assert.equal(result.error, null);
assert.equal(followUpMock.state().tasks.size, 2);

const pipelineMock = createMockStore({
  tasks: { t1: { id: "t1", status: "open" } },
  organisations: { "org-1": { pipeline_stage: "prospect" } },
});

result = await completeCrmTaskWithStore(pipelineMock.store, {
  ...baseInput,
  applyPipelineUpdate: true,
  outcomeValue: "signed_up",
  currentPipelineStage: "prospect",
  pipelineStageOverride: "signed_up",
});
assert.equal(result.error, null);
assert.equal(
  pipelineMock.state().organisations.get("org-1")?.pipeline_stage,
  "signed_up"
);
const audit = pipelineMock
  .state()
  .engagements.find((e) => e.summary === "Pipeline stage updated");
assert.ok(audit, "pipeline audit engagement");

const failTaskMock = createMockStore({ tasks: {} });
result = await completeCrmTaskWithStore(failTaskMock.store, baseInput);
assert.ok(result.error, "missing task fails");

const failFollowUpMock = createMockStore({
  tasks: { t1: { id: "t1", status: "open" } },
  organisations: { "org-1": {} },
});
const failingStore: CrmMutationStore = {
  ...failFollowUpMock.store,
  tasks: () => ({
    update: failFollowUpMock.store.tasks().update,
    insert: async () => ({ error: { message: "follow-up insert failed" } }),
  }),
};
result = await completeCrmTaskWithStore(failingStore, {
  ...baseInput,
  createFollowUp: true,
  followUpTitle: "Next",
  followUpDueDate: "2026-07-10",
  followUpOwnerId: "user-2",
});
assert.ok(result.error?.includes("follow-up"));
assert.equal(
  failFollowUpMock.state().tasks.get("t1")?.status,
  "open",
  "task rolled back when follow-up fails"
);

assert.equal(
  validateCompleteCrmTaskInput({
    ...baseInput,
    createFollowUp: true,
    followUpTitle: "",
  }),
  "Follow-up title is required."
);

assert.equal(
  validateCompleteCrmTaskInput({
    ...baseInput,
    createFollowUp: true,
    followUpTitle: "X",
    followUpDueDate: "",
    followUpOwnerId: "user-1",
  }),
  "Follow-up due date is required."
);

assert.equal(
  validateCompleteCrmTaskInput({
    ...baseInput,
    organisationId: null,
    createFollowUp: true,
    followUpTitle: "X",
    followUpDueDate: "2026-07-10",
    followUpOwnerId: "user-1",
  }),
  "Follow-up requires an organisation on this task."
);

console.log("test-crm-mutations: all passed");
}

void run();
