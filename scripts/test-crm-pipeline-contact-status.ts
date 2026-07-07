#!/usr/bin/env node
/**
 * Pipeline card contact-state and quality indicator tests.
 * Run: npm run test:crm-pipeline-contact-status
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOrganisationQualityIndicators,
  patchOrganisationRowPrimaryContact,
  resolveOrganisationContactStatus,
} from "../lib/crm-desktop/organisation-contact-status.js";
import type { CrmOrganisationListRow } from "../lib/crm-desktop/types.js";

function row(
  partial: Partial<CrmOrganisationListRow> & Pick<CrmOrganisationListRow, "id" | "name">
): CrmOrganisationListRow {
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

const noContacts = resolveOrganisationContactStatus(row({ id: "1", name: "A" }));
assert.equal(noContacts.contactWarningType, "no_contacts");
assert.equal(noContacts.summaryLabel, "No contacts added");

const primaryRequired = resolveOrganisationContactStatus(
  row({ id: "2", name: "B", contact_count: 2 })
);
assert.equal(primaryRequired.contactWarningType, "primary_required");
assert.equal(primaryRequired.summaryLabel, "No primary contact");

const withPrimary = resolveOrganisationContactStatus(
  row({
    id: "3",
    name: "C",
    contact_count: 2,
    primary_contact_id: "c1",
    primary_contact_name: "Lenchen April",
  })
);
assert.equal(withPrimary.contactWarningType, "none");
assert.match(withPrimary.summaryLabel, /Primary: Lenchen April/);

const noContactBadge = buildOrganisationQualityIndicators(
  row({ id: "4", name: "D", contact_count: 2 })
);
assert.ok(noContactBadge.some((i) => i.label === "Primary contact required"));
assert.ok(!noContactBadge.some((i) => i.label === "No contact"));
assert.ok(!noContactBadge.some((i) => i.label === "No contacts"));

const noContactsBadge = buildOrganisationQualityIndicators(
  row({ id: "5", name: "E", contact_count: 0 })
);
assert.ok(noContactsBadge.some((i) => i.label === "No contacts"));
assert.ok(!noContactsBadge.some((i) => i.label === "Primary contact required"));

const overdueOnce = buildOrganisationQualityIndicators(
  row({
    id: "6",
    name: "F",
    contact_count: 1,
    primary_contact_id: "c1",
    primary_contact_name: "P",
    next_action_title: "Call back",
    next_action_date: "2020-01-01",
    next_task_title: "Call back",
    next_task_due: "2020-01-01",
  })
);
assert.ok(!overdueOnce.some((i) => i.label === "Overdue"));

const overdueWhenTaskHidden = buildOrganisationQualityIndicators(
  row({
    id: "7",
    name: "G",
    contact_count: 1,
    primary_contact_id: "c1",
    primary_contact_name: "P",
    next_action_title: null,
    next_task_title: null,
    next_action_date: "2020-01-01",
    next_task_due: "2020-01-01",
  })
);
assert.ok(overdueWhenTaskHidden.some((i) => i.label === "Overdue"));

const patched = patchOrganisationRowPrimaryContact(
  row({ id: "8", name: "H", contact_count: 1 }),
  { id: "c9", name: "New Primary", role: "Manager", email: "a@b.com", phone: "123" }
);
assert.equal(patched.primary_contact_id, "c9");
assert.equal(patched.primary_contact_name, "New Primary");

const cleared = patchOrganisationRowPrimaryContact(patched, null);
assert.equal(cleared.primary_contact_id, null);
assert.equal(
  resolveOrganisationContactStatus({
    ...cleared,
    contact_count: 2,
  }).contactWarningType,
  "primary_required"
);

const lastDeleted = resolveOrganisationContactStatus(
  row({ id: "9", name: "I", contact_count: 0, primary_contact_id: null })
);
assert.equal(lastDeleted.contactWarningType, "no_contacts");

const mutualExclusive = buildOrganisationQualityIndicators(
  row({ id: "10", name: "J", contact_count: 3 })
);
assert.ok(mutualExclusive.some((i) => i.label === "Primary contact required"));
assert.ok(!mutualExclusive.some((i) => i.label === "No contacts"));

const pickerSource = readFileSync(
  "app/components/crm-desktop/CrmPipelinePrimaryContactPicker.tsx",
  "utf8"
);
assert.match(pickerSource, /setCrmOrganisationPrimaryContact/);
assert.match(pickerSource, /fetchCrmDesktopContacts/);

const summarySource = readFileSync(
  "app/components/crm-desktop/CrmPipelineContactSummary.tsx",
  "utf8"
);
assert.match(summarySource, /stopPropagation/);
assert.match(summarySource, /offerSetAsPrimary/);

const routeSource = readFileSync(
  "app/api/admin/crm/desktop/organisations/[organisationId]/primary-contact/route.ts",
  "utf8"
);
assert.match(routeSource, /requireCrmDesktopApi/);

console.log("test-crm-pipeline-contact-status: all assertions passed");
