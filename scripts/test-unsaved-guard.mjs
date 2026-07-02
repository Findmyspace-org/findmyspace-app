#!/usr/bin/env node
/**
 * Unsaved navigation guard regression tests (no DOM).
 * Run: npm run test:unsaved-guard
 */

import assert from "node:assert/strict";

function createGuard() {
  let bypass = false;
  let guardDepth = 0;
  let baselineReady = false;
  const sections = new Map([
    ["admin-space-details", { label: "Space details", isDirty: true }],
  ]);

  function hasDirtySections() {
    return Array.from(sections.values()).some((section) => section.isDirty);
  }

  function isNavigationBlocked() {
    return baselineReady && !bypass && hasDirtySections();
  }

  function hasUnsavedChanges() {
    return baselineReady && hasDirtySections();
  }

  function markSectionsClean(ids) {
    const targets = ids ?? Array.from(sections.keys());
    for (const id of targets) {
      const section = sections.get(id);
      if (section) sections.set(id, { ...section, isDirty: false });
    }
  }

  function setBaselineReady(ready) {
    baselineReady = ready;
    if (ready && !hasDirtySections()) {
      guardDepth = 0;
    }
  }

  function releaseGuardForUnload() {
    bypass = true;
    guardDepth = 0;
  }

  function requestNavigation(execute) {
    if (!isNavigationBlocked()) {
      execute();
      return "navigated";
    }
    return "modal";
  }

  return {
    markSectionsClean,
    setBaselineReady,
    releaseGuardForUnload,
    requestNavigation,
    isNavigationBlocked,
    hasUnsavedChanges,
    get guardDepth() {
      return guardDepth;
    },
    pushGuard() {
      guardDepth += 1;
    },
  };
}

const guard = createGuard();
assert.equal(guard.isNavigationBlocked(), false, "guard inactive before baseline");
assert.equal(guard.requestNavigation(() => {}), "navigated");

guard.setBaselineReady(true);
assert.equal(guard.isNavigationBlocked(), true);
assert.equal(guard.requestNavigation(() => {}), "modal");

guard.markSectionsClean(["admin-space-details"]);
assert.equal(guard.hasUnsavedChanges(), false);
assert.equal(guard.requestNavigation(() => {}), "navigated");

const guard2 = createGuard();
guard2.setBaselineReady(true);
guard2.pushGuard();
guard2.markSectionsClean();
guard2.setBaselineReady(true);
assert.equal(guard2.guardDepth, 0);
assert.equal(guard2.isNavigationBlocked(), false);

const guard3 = createGuard();
guard3.setBaselineReady(true);
guard3.releaseGuardForUnload();
assert.equal(guard3.isNavigationBlocked(), false);

console.log("test-unsaved-guard: ok");
