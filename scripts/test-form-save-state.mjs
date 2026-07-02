#!/usr/bin/env node
/**
 * Form save baseline / dirty tracking tests (no DOM).
 * Run: npm run test:form-save-state
 */

import assert from "node:assert/strict";

function createFormSaveState() {
  let savedSnapshot = null;
  let isSaving = false;

  function serialize(value) {
    return JSON.stringify(value);
  }

  function isDirty(current) {
    if (savedSnapshot === null) return false;
    return serialize(current) !== savedSnapshot;
  }

  function markSaved(value) {
    savedSnapshot = serialize(value);
    isSaving = false;
  }

  function beginSave() {
    isSaving = true;
  }

  function finishSave(result, current) {
    isSaving = false;
    if (result.ok) {
      markSaved(result.value ?? current);
    }
  }

  return { isDirty, markSaved, beginSave, finishSave, isSaving: () => isSaving };
}

const store = createFormSaveState();
const baseline = { state: { title: "A" }, crmLink: { crm_organisation_id: null, crm_contact_id: null } };
store.markSaved(baseline);

const edited = { state: { title: "B" }, crmLink: baseline.crmLink };
assert.equal(store.isDirty(edited), true);

const crmAutoSaved = {
  state: { title: "B" },
  crmLink: { crm_organisation_id: "org-1", crm_contact_id: null },
};
assert.equal(store.isDirty(crmAutoSaved), true);

store.markSaved({
  state: { title: "B" },
  crmLink: { crm_organisation_id: "org-1", crm_contact_id: null },
});
assert.equal(store.isDirty(crmAutoSaved), false, "baseline must update after CRM auto-persist");

store.beginSave();
assert.equal(store.isSaving(), true);
store.finishSave({ ok: true, value: crmAutoSaved }, crmAutoSaved);
assert.equal(store.isSaving(), false);
assert.equal(store.isDirty(crmAutoSaved), false);

console.log("test-form-save-state: ok");
