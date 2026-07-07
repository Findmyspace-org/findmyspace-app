#!/usr/bin/env node
// @ts-nocheck
/**
 * Primary contact mutation tests (mock store + route auth check).
 * Run: npm run test:crm-primary-contact
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setOrganisationPrimaryContact } from "../lib/crm-desktop/primary-contact.js";

function createMockAdmin(seed = {}) {
  const organisations = new Map(
    Object.entries(seed.organisations || {}).map(([id, row]) => [id, { ...row }])
  );
  const contacts = new Map(
    Object.entries(seed.contacts || {}).map(([id, row]) => [id, { ...row }])
  );
  const engagements = [];

  const client = {
    from(table) {
      if (table === "crm_organisations") {
        return {
          select: () => ({
            eq: (_col, val) => ({
              maybeSingle: async () => ({
                data: organisations.get(val) ?? null,
                error: null,
              }),
            }),
          }),
          update: (patch) => ({
            eq: async (_col, val) => {
              const row = organisations.get(val);
              if (!row) return { error: { message: "not found" } };
              Object.assign(row, patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === "crm_contacts") {
        return {
          select: () => ({
            eq: (_col, val) => ({
              maybeSingle: async () => ({
                data: contacts.get(val) ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "crm_engagements") {
        return {
          insert: async (row) => {
            engagements.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, organisations, contacts, engagements };
}

const orgId = "org-1";
const contactA = "contact-a";
const contactB = "contact-b";
const otherOrgContact = "contact-x";

async function run() {
  const { client, organisations, engagements } = createMockAdmin({
    organisations: {
      [orgId]: {
        id: orgId,
        name: "Test Org",
        primary_contact_id: null,
        status: "active",
      },
    },
    contacts: {
      [contactA]: {
        id: contactA,
        organisation_id: orgId,
        full_name: "Alice",
        first_name: null,
        last_name: null,
      },
      [contactB]: {
        id: contactB,
        organisation_id: orgId,
        full_name: "Bob",
        first_name: null,
        last_name: null,
      },
      [otherOrgContact]: {
        id: otherOrgContact,
        organisation_id: "org-2",
        full_name: "Wrong",
        first_name: null,
        last_name: null,
      },
    },
  });

  const setA = await setOrganisationPrimaryContact(client, {
    organisationId: orgId,
    contactId: contactA,
    profileId: "admin-1",
  });
  assert.equal(setA.ok, true);
  assert.equal(organisations.get(orgId).primary_contact_id, contactA);
  assert.equal(engagements.length, 1);

  const setB = await setOrganisationPrimaryContact(client, {
    organisationId: orgId,
    contactId: contactB,
    profileId: "admin-1",
  });
  assert.equal(setB.ok, true);
  assert.equal(organisations.get(orgId).primary_contact_id, contactB);

  const reject = await setOrganisationPrimaryContact(client, {
    organisationId: orgId,
    contactId: otherOrgContact,
    profileId: "admin-1",
  });
  assert.equal(reject.ok, false);
  assert.equal(reject.status, 400);

  const cleared = await setOrganisationPrimaryContact(client, {
    organisationId: orgId,
    contactId: null,
    profileId: "admin-1",
  });
  assert.equal(cleared.ok, true);
  assert.equal(organisations.get(orgId).primary_contact_id, null);

  const routeSource = readFileSync(
    "app/api/admin/crm/desktop/organisations/[organisationId]/primary-contact/route.ts",
    "utf8"
  );
  assert.match(routeSource, /requireCrmDesktopApi/);

  console.log("test-crm-primary-contact: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
