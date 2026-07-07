#!/usr/bin/env node
/**
 * Pipeline drawer task activity tests.
 * Run: npm run test:crm-pipeline-drawer-task-activity
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const timelineSource = readFileSync(
  "app/components/crm-desktop/CrmTimeline.tsx",
  "utf8"
);
const timelineItemsSource = readFileSync(
  "lib/crm-desktop/timeline-items.ts",
  "utf8"
);
const drawerSource = readFileSync(
  "app/components/crm-desktop/CrmPipelineCardDrawer.tsx",
  "utf8"
);
const quickActionSource = readFileSync(
  "app/components/crm-desktop/CrmQuickActionDrawer.tsx",
  "utf8"
);

assert.match(timelineSource, /buildCrmTimelineItems/);
assert.match(timelineSource, /onTaskOpen/);
assert.match(timelineSource, /task_missing/);
assert.match(timelineSource, /ChevronRight/);
assert.match(timelineSource, /cursor-pointer/);

assert.match(timelineItemsSource, /suppressedCompletedTaskIds/);
assert.match(timelineItemsSource, /engagement\.task_id/);

assert.match(drawerSource, /handleTaskOpen/);
assert.match(drawerSource, /onTaskOpen=\{handleTaskOpen\}/);
assert.match(drawerSource, /openQuickAction\(\s*[\s\S]*"edit_task"/);
assert.match(drawerSource, /patchOrganisationRowFromTasks/);

assert.match(quickActionSource, /overlayZIndexClass="z-\[70\]"/);
assert.match(quickActionSource, /taskReadOnly/);
assert.match(quickActionSource, /Task details/);

console.log("test-crm-pipeline-drawer-task-activity: all assertions passed");
