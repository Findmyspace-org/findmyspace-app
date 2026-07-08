#!/usr/bin/env node
/**
 * Pipeline clear-all-filters tests.
 * Run: npm run test:crm-pipeline-clear-filters
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearAllPipelineFilterSearchParams,
  CRM_PIPELINE_FILTER_PARAM_KEYS,
  hasActivePipelineFilters,
} from "../lib/crm-desktop/pipeline-filters";

const pageSource = readFileSync("app/admin/crm/pipeline/page.tsx", "utf8");

assert.match(pageSource, /hasActivePipelineFilters/);
assert.match(pageSource, /clearAllPipelineFilterSearchParams/);
assert.match(pageSource, /Remove filters/);
assert.match(pageSource, /FilterX/);

function params(qs: string) {
  return new URLSearchParams(qs);
}

assert.equal(hasActivePipelineFilters(params("view=board")), false);
assert.equal(hasActivePipelineFilters(params("view=board&q=test")), true);
assert.equal(hasActivePipelineFilters(params("view=board&stage=follow_up")), true);
assert.equal(hasActivePipelineFilters(params("view=board&type=municipality")), true);
assert.equal(hasActivePipelineFilters(params("view=board&assigned=abc")), true);
assert.equal(hasActivePipelineFilters(params("view=board&overdue=1")), true);
assert.equal(hasActivePipelineFilters(params("view=board&no_next=1")), true);
assert.equal(hasActivePipelineFilters(params("view=board&no_contact=1")), true);
assert.equal(hasActivePipelineFilters(params("view=board&primary_required=1")), true);
assert.equal(hasActivePipelineFilters(params("view=board&no_spaces=1")), true);
assert.equal(hasActivePipelineFilters(params("view=board&stale=1")), true);
assert.equal(hasActivePipelineFilters(params("view=board&no_email=1")), true);
assert.equal(hasActivePipelineFilters(params("view=board&no_phone=1")), true);
assert.equal(
  hasActivePipelineFilters(params("view=board&preset=awaiting-response")),
  true
);

const multi = params(
  "view=board&boardSort=manual&q=draken&type=municipality&no_spaces=1&overdue=1&page=2&boardPage=3"
);
assert.equal(hasActivePipelineFilters(multi), true);
const clearedMulti = clearAllPipelineFilterSearchParams(multi);
assert.equal(clearedMulti.get("view"), "board");
assert.equal(clearedMulti.get("boardSort"), "manual");
assert.equal(clearedMulti.get("q"), null);
assert.equal(clearedMulti.get("type"), null);
assert.equal(clearedMulti.get("no_spaces"), null);
assert.equal(clearedMulti.get("overdue"), null);
assert.equal(clearedMulti.get("page"), null);
assert.equal(clearedMulti.get("boardPage"), null);

const preset = params(
  "view=table&preset=listing-opportunity&stage=in_progress&boardSort=manual&pageSize=50&foo=bar"
);
const clearedPreset = clearAllPipelineFilterSearchParams(preset);
assert.equal(clearedPreset.get("view"), "table");
assert.equal(clearedPreset.get("boardSort"), "manual");
assert.equal(clearedPreset.get("pageSize"), "50");
assert.equal(clearedPreset.get("foo"), "bar");
assert.equal(clearedPreset.get("preset"), null);
assert.equal(clearedPreset.get("stage"), null);

for (const key of CRM_PIPELINE_FILTER_PARAM_KEYS) {
  const active = params(`view=board&${key}=1`);
  assert.equal(
    hasActivePipelineFilters(active),
    true,
    `expected active for ${key}`
  );
  const cleared = clearAllPipelineFilterSearchParams(active);
  assert.equal(cleared.get(key), null, `expected cleared ${key}`);
  assert.equal(cleared.get("view"), "board");
}

console.log("test-crm-pipeline-clear-filters: all assertions passed");
