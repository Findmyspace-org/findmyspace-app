#!/usr/bin/env node
/**
 * Chunked ID filter pagination tests (no DB).
 * Run: npm run test:crm-filter-pagination
 */

import assert from "node:assert/strict";
import {
  chunkArray,
  CRM_IN_FILTER_CHUNK_SIZE,
} from "../lib/crm-desktop/filtered-pagination";

assert.equal(CRM_IN_FILTER_CHUNK_SIZE, 200);

const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
const chunks = chunkArray(ids, CRM_IN_FILTER_CHUNK_SIZE);
assert.equal(chunks.length, 3);
assert.equal(chunks[0].length, 200);
assert.equal(chunks[1].length, 200);
assert.equal(chunks[2].length, 50);

assert.deepEqual(chunkArray([], 200), []);
assert.deepEqual(chunkArray(["a"], 200), [["a"]]);

import {
  clearActivePresetSearchParams,
  getCrmPresetView,
} from "../lib/crm-desktop/preset-views";

const boardWithPreset = new URLSearchParams(
  "view=board&preset=awaiting-response&stage=follow_up&q=cape"
);
// q was not set by preset — should be preserved
const cleared = clearActivePresetSearchParams(
  boardWithPreset,
  "awaiting-response"
);
assert.equal(cleared.get("view"), "board");
assert.equal(cleared.get("q"), "cape");
assert.equal(cleared.get("preset"), null);
assert.equal(cleared.get("stage"), null);

const tableWithPreset = new URLSearchParams(
  "view=table&preset=closed-not-interested&stage=closed_lost"
);
const clearedTable = clearActivePresetSearchParams(
  tableWithPreset,
  "closed-not-interested"
);
assert.equal(clearedTable.get("view"), "table");
assert.equal(clearedTable.get("stage"), null);
assert.equal(clearedTable.get("preset"), null);

const preset = getCrmPresetView("municipalities");
assert.ok(preset);
const withType = new URLSearchParams(
  "view=board&preset=municipalities&type=municipality&assigned=abc"
);
const clearedMuni = clearActivePresetSearchParams(withType, "municipalities");
assert.equal(clearedMuni.get("view"), "board");
assert.equal(clearedMuni.get("type"), null);
assert.equal(clearedMuni.get("assigned"), "abc");

console.log("test-crm-filter-pagination: all passed");
