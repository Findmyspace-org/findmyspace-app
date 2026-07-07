#!/usr/bin/env node
/**
 * Contact card + pipeline ordering unit tests (no DB).
 * Run: npm run test:crm-pipeline-ordering
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { telHref, crmContactMailHref } from "../lib/space-place/contact-actions";
import {
  getCrmActionDateGroup,
  resolveNextCrmActionForOrganisation,
} from "../lib/crm-desktop/next-action";
import {
  clampSmartReorderIndex,
  comparePipelineBoardRows,
  computeFractionalRank,
  getPipelineBoardSortMode,
  isValidSmartReorderTarget,
  resolveRowDateGroup,
  sortPipelineBoardRows,
} from "../lib/crm-desktop/pipeline-ordering";
import { crmTodayIsoDate, CRM_BUSINESS_TIMEZONE } from "../lib/crm-desktop/timezone";
import type { CrmOrganisationListRow } from "../lib/crm-desktop/types";

function row(partial: Partial<CrmOrganisationListRow> & Pick<CrmOrganisationListRow, "id" | "name">): CrmOrganisationListRow {
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

assert.equal(getPipelineBoardSortMode(null), "smart");
assert.equal(getPipelineBoardSortMode("manual"), "manual");

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

assert.equal(getCrmActionDateGroup(yesterday), "overdue");
assert.equal(getCrmActionDateGroup(today), "today");
assert.equal(getCrmActionDateGroup(tomorrow), "future");
assert.equal(getCrmActionDateGroup(null), "none");
assert.equal(CRM_BUSINESS_TIMEZONE, "Africa/Johannesburg");
assert.equal(crmTodayIsoDate(new Date("2026-07-07T22:30:00Z")), "2026-07-08");
assert.equal(getCrmActionDateGroup("2026-07-08", "2026-07-08"), "today");
assert.equal(getCrmActionDateGroup("2026-07-07", "2026-07-08"), "overdue");

const smartSorted = sortPipelineBoardRows(
  [
    row({ id: "undated", name: "Undated", next_action_date: null, next_action_date_group: "none" }),
    row({
      id: "future",
      name: "Future",
      next_action_date: tomorrow,
      next_action_date_group: "future",
    }),
    row({
      id: "overdue",
      name: "Overdue",
      next_action_date: yesterday,
      next_action_date_group: "overdue",
    }),
    row({
      id: "today",
      name: "Today",
      next_action_date: today,
      next_action_date_group: "today",
    }),
  ],
  "smart"
).map((item) => item.id);

assert.deepEqual(smartSorted, ["overdue", "today", "future", "undated"]);

const futureA = row({
  id: "a",
  name: "A",
  next_action_date: tomorrow,
  next_action_date_group: "future",
});
const futureB = row({
  id: "b",
  name: "B",
  next_action_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
  next_action_date_group: "future",
});
assert(comparePipelineBoardRows(futureA, futureB, "smart") < 0);

const manualSorted = sortPipelineBoardRows(
  [
    row({ id: "b", name: "B", pipeline_manual_rank: 2000 }),
    row({ id: "a", name: "A", pipeline_manual_rank: 1000 }),
  ],
  "manual"
).map((item) => item.id);
assert.deepEqual(manualSorted, ["a", "b"]);

const smartActive = row({
  id: "active",
  name: "Active",
  next_action_date: today,
  next_action_date_group: "today",
});
const smartSame = row({
  id: "same",
  name: "Same",
  next_action_date: today,
  next_action_date_group: "today",
});
const smartOther = row({
  id: "other",
  name: "Other",
  next_action_date: tomorrow,
  next_action_date_group: "future",
});
assert.equal(isValidSmartReorderTarget(smartActive, smartSame), true);
assert.equal(isValidSmartReorderTarget(smartActive, smartOther), false);

const mixed = sortPipelineBoardRows(
  [smartOther, smartActive, smartSame],
  "smart"
);
const clamped = clampSmartReorderIndex(mixed, "active", 0);
assert.equal(resolveRowDateGroup(mixed[clamped]), "today");

const nextAction = resolveNextCrmActionForOrganisation(
  [
    {
      id: "done",
      status: "done",
      due_date: yesterday,
      title: "Done",
      organisation_id: "org-1",
      contact_id: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "open-later",
      status: "open",
      due_date: tomorrow,
      title: "Later",
      organisation_id: "org-1",
      contact_id: null,
      created_at: "2026-01-02T00:00:00Z",
    },
    {
      id: "open-soon",
      status: "open",
      due_date: today,
      title: "Soon",
      organisation_id: "org-1",
      contact_id: null,
      created_at: "2026-01-03T00:00:00Z",
    },
  ],
  "org-1"
);
assert.equal(nextAction?.title, "Soon");
assert.equal(nextAction?.actionDate, today);

const followUpAction = resolveNextCrmActionForOrganisation(
  [],
  "org-1",
  null,
  [
    {
      id: "eng-1",
      organisation_id: "org-1",
      contact_id: null,
      type: "call",
      summary: "Call back",
      occurred_at: "2026-01-01T10:00:00Z",
      follow_up_task: {
        id: "task-1",
        status: "open",
        due_date: tomorrow,
        title: "Follow up call",
        organisation_id: "org-1",
        contact_id: null,
        created_at: "2026-01-01T10:00:01Z",
      },
    },
  ]
);
assert.equal(followUpAction?.title, "Follow up call");

const rankBetween = computeFractionalRank(1000, 2000, 1);
assert.equal(rankBetween.rank, 1500);
assert.equal(rankBetween.needsNormalization, false);

const contactRowSource = readFileSync(
  "app/components/crm-desktop/CrmOrganisationContactRow.tsx",
  "utf8"
);
assert.match(contactRowSource, /mailto/);
assert.match(contactRowSource, /telHref/);
assert.match(contactRowSource, /CrmContactEmailActions/);
assert.match(contactRowSource, /CrmContactPhoneActions/);
assert.match(contactRowSource, /Set as primary/);
assert.match(contactRowSource, /Primary/);
assert.doesNotMatch(
  contactRowSource,
  /flex shrink-0 flex-col items-end/
);

const quickActionsSource = readFileSync(
  "app/components/crm-desktop/CrmContactQuickActions.tsx",
  "utf8"
);
assert.match(quickActionsSource, /Copy email/);
assert.match(quickActionsSource, /Copy phone/);
assert.match(quickActionsSource, /CrmContactEmailActions/);
assert.match(quickActionsSource, /CrmContactPhoneActions/);
assert.match(quickActionsSource, /inline-flex shrink-0/);

assert.equal(crmContactMailHref("test@example.com", "contact-1")?.startsWith("mailto:"), true);
assert.equal(telHref("082 123 4567"), "tel:0821234567");

assert.match(
  readFileSync("app/api/admin/crm/desktop/pipeline/reorder/route.ts", "utf8"),
  /requireCrmDesktopApi/
);

const reorderSource = readFileSync(
  "lib/crm-desktop/pipeline-reorder.ts",
  "utf8"
);
const enrichmentSource = readFileSync(
  "lib/crm-desktop/pipeline-stage-enrichment.ts",
  "utf8"
);
assert.ok(
  !/\.select\(\s*[^)]*next_task_due/.test(reorderSource),
  "pipeline-reorder must not select next_task_due from crm_organisations"
);
assert.match(enrichmentSource, /resolveNextCrmActionForOrganisation/);
assert.match(reorderSource, /enrichStageOrganisationsForOrdering/);

const dragSource = readFileSync(
  "app/components/crm-desktop/useCrmPipelineDrag.ts",
  "utf8"
);
assert.match(dragSource, /moveCrmPipelineOrganisationStage/);
assert.match(dragSource, /Failed to move card/);
assert.match(dragSource, /confirmClosedLost/);

console.log("test-crm-pipeline-ordering: all assertions passed");
