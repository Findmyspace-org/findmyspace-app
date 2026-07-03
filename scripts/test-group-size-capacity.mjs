#!/usr/bin/env node
/**
 * Group size validation + display tests (no DB).
 * Run: npm run test:group-size-capacity
 */

import assert from "node:assert/strict";

function parseGroupSizeInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1 || n > 50_000) return null;
  return Math.floor(n);
}

function validateGroupSizePair(min, max) {
  if (min != null && (!Number.isFinite(min) || min < 1)) {
    return "Minimum group size must be at least 1.";
  }
  if (max != null && (!Number.isFinite(max) || max < 1)) {
    return "Maximum group size must be at least 1.";
  }
  if (min != null && max != null && max < min) {
    return "Maximum group size must be greater than or equal to minimum.";
  }
  return null;
}

function validateGroupSizeFormValues(spaceType, minGroupSize, maxGroupSize) {
  const NON_GROUP = new Set(["storage", "parking"]);
  if (spaceType && NON_GROUP.has(spaceType.toLowerCase())) return null;
  const min = parseGroupSizeInput(minGroupSize);
  const max = parseGroupSizeInput(maxGroupSize);
  if (minGroupSize.trim() && min == null) {
    return "Enter a valid minimum group size.";
  }
  if (maxGroupSize.trim() && max == null) {
    return "Enter a valid maximum group size.";
  }
  return validateGroupSizePair(min, max);
}

function formatGroupSizePublic(min, max) {
  if (min != null && max != null) return `Suitable for ${min}–${max} people`;
  if (max != null) return `Up to ${max} people`;
  if (min != null) return `Suitable for ${min}+ people`;
  return null;
}

// max-only is valid
assert.equal(validateGroupSizeFormValues("event_space", "", "50"), null);
assert.equal(validateGroupSizeFormValues("event_space", "", "50") == null, true);

// min+max valid
assert.equal(validateGroupSizeFormValues("event_space", "10", "50"), null);

// min-only valid
assert.equal(validateGroupSizeFormValues("office", "10", ""), null);

// neither valid
assert.equal(validateGroupSizeFormValues("office", "", ""), null);

// min > max invalid
assert.ok(
  validateGroupSizeFormValues("event_space", "50", "10")?.includes("greater than or equal")
);

// display strings
assert.equal(formatGroupSizePublic(10, 50), "Suitable for 10–50 people");
assert.equal(formatGroupSizePublic(null, 50), "Up to 50 people");
assert.equal(formatGroupSizePublic(10, null), "Suitable for 10+ people");
assert.equal(formatGroupSizePublic(null, null), null);

console.log("test-group-size-capacity: all assertions passed");
