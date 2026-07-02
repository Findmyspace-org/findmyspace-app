#!/usr/bin/env node
/**
 * Unsaved navigation guard regression tests (no DOM).
 * Run: npm run test:unsaved-guard
 */

import assert from "node:assert/strict";

function createGuard() {
  let bypass = false;
  let guardDepth = 0;
  const sections = new Map([
    ["admin-space-details", { label: "Space details", isDirty: true }],
  ]);

  function hasDirtySections() {
    return Array.from(sections.values()).some((section) => section.isDirty);
  }

  function isNavigationBlocked() {
    return !bypass && hasDirtySections();
  }

  function markSectionsClean() {
    for (const [id, section] of sections) {
      sections.set(id, { ...section, isDirty: false });
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

  function shouldAttachBeforeUnload() {
    return isNavigationBlocked();
  }

  return {
    markSectionsClean,
    releaseGuardForUnload,
    requestNavigation,
    shouldAttachBeforeUnload,
    get guardDepth() {
      return guardDepth;
    },
    pushGuard() {
      guardDepth += 1;
    },
  };
}

const guard = createGuard();
assert.equal(guard.shouldAttachBeforeUnload(), true);
assert.equal(guard.requestNavigation(() => {}), "modal");

guard.markSectionsClean();
assert.equal(guard.shouldAttachBeforeUnload(), false);
assert.equal(guard.requestNavigation(() => {}), "navigated");

const guard2 = createGuard();
guard2.pushGuard();
guard2.markSectionsClean();
guard2.releaseGuardForUnload();
assert.equal(guard2.shouldAttachBeforeUnload(), false);
assert.equal(guard2.guardDepth, 0);

console.log("test-unsaved-guard: ok");
