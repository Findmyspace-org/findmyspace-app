#!/usr/bin/env node
/**
 * Organisation contact filter completeness tests.
 * Run: npm run test:crm-org-contact-filters
 */

import assert from "node:assert/strict";
import {
  organisationHasAnyEmail,
  organisationHasAnyPhone,
  resolveNoEmailOrganisationIds,
  resolveNoPhoneOrganisationIds,
} from "../lib/crm-desktop/organisation-contact-completeness.js";
import { buildOrganisationQualityIndicators } from "../lib/crm-desktop/organisation-contact-status.js";
import type { CrmOrganisationListRow } from "../lib/crm-desktop/types.js";

const orgIds = ["org-none", "org-no-email", "org-has-email", "org-mixed-phone"];

const contacts = [
  { organisation_id: "org-no-email", email: null, phone: "111", whatsapp: null },
  {
    organisation_id: "org-has-email",
    email: "newer@example.com",
    phone: null,
    whatsapp: null,
  },
  {
    organisation_id: "org-mixed-phone",
    email: "a@b.com",
    phone: null,
    whatsapp: null,
  },
  {
    organisation_id: "org-mixed-phone",
    email: null,
    phone: null,
    whatsapp: "0821234567",
  },
];

const noEmail = resolveNoEmailOrganisationIds(
  orgIds,
  contacts.map((c) => ({
    organisation_id: c.organisation_id,
    email: c.email,
  }))
);
assert.ok(noEmail.has("org-none"));
assert.ok(noEmail.has("org-no-email"));
assert.ok(!noEmail.has("org-has-email"));
assert.ok(!noEmail.has("org-mixed-phone"));

const noPhone = resolveNoPhoneOrganisationIds(orgIds, contacts);
assert.ok(noPhone.has("org-none"));
assert.ok(!noPhone.has("org-no-email"));
assert.ok(noPhone.has("org-has-email"));
assert.ok(!noPhone.has("org-mixed-phone"));

assert.equal(
  organisationHasAnyEmail({
    contact_count: 2,
    primary_contact_id: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    additional_contacts: [
      {
        id: "c1",
        name: "Later",
        role: null,
        email: "later@example.com",
        phone: null,
      },
    ],
  }),
  true
);

assert.equal(
  organisationHasAnyPhone({
    contact_count: 2,
    primary_contact_id: "c1",
    primary_contact_email: "a@b.com",
    primary_contact_phone: null,
    additional_contacts: [
      {
        id: "c2",
        name: "Backup",
        role: null,
        email: null,
        phone: "0820000000",
      },
    ],
  }),
  true
);

function baseRow(
  partial: Partial<CrmOrganisationListRow>
): CrmOrganisationListRow {
  return {
    id: "org-1",
    name: "Test",
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

const primaryRequiredOnly = buildOrganisationQualityIndicators(
  baseRow({
    contact_count: 2,
    additional_contacts: [
      {
        id: "c1",
        name: "Has email",
        role: null,
        email: "someone@example.com",
        phone: null,
      },
    ],
  })
);
assert.ok(primaryRequiredOnly.some((i) => i.label === "Primary contact required"));
assert.ok(!primaryRequiredOnly.some((i) => i.label === "No contacts"));
assert.ok(!primaryRequiredOnly.some((i) => i.label === "No email"));

const noPhoneAllContacts = buildOrganisationQualityIndicators(
  baseRow({
    contact_count: 1,
    primary_contact_id: "c1",
    primary_contact_name: "Primary",
    primary_contact_email: "a@b.com",
    primary_contact_phone: null,
    additional_contacts: [],
  })
);
assert.ok(noPhoneAllContacts.some((i) => i.label === "No phone"));
assert.ok(!noPhoneAllContacts.some((i) => i.label === "Primary contact required"));

console.log("test-crm-org-contact-filters: all assertions passed");
