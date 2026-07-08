#!/usr/bin/env node
// @ts-nocheck
/**
 * CRM email link/relink/unlink helper + desktop unlinked wiring.
 * Run: npm run test:crm-email-unlinked
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyEmailLinkAction } from "../lib/space-place/crm-email-link.js";
import { canManageCrmEmail } from "../lib/space-place/access.js";

function createMockDb(seed) {
  const emails = new Map(
    Object.entries(seed.emails || {}).map(([id, row]) => [id, { ...row }])
  );
  const contacts = new Map(
    Object.entries(seed.contacts || {}).map(([id, row]) => [id, { ...row }])
  );
  const organisations = new Map(
    Object.entries(seed.organisations || {}).map(([id, row]) => [id, { ...row }])
  );
  const engagements = [...(seed.engagements || [])];
  const audits = [];

  function selectChain(table, rowsGetter) {
    return {
      select() {
        return {
          eq(col, val) {
            return {
              maybeSingle: async () => {
                const row = [...rowsGetter().values()].find((r) => r[col] === val) ?? null;
                return { data: row ? { ...row } : null, error: null };
              },
              single: async () => {
                const row = [...rowsGetter().values()].find((r) => r[col] === val);
                if (!row) return { data: null, error: { message: "not found" } };
                return { data: { ...row }, error: null };
              },
            };
          },
        };
      },
      update(patch) {
        return {
          eq(col, val) {
            const chain = {
              select() {
                return {
                  single: async () => {
                    const map = rowsGetter();
                    const row = map.get(val);
                    if (!row) return { data: null, error: { message: "not found" } };
                    Object.assign(row, patch);
                    return {
                      data: {
                        id: row.id,
                        contact_id: row.contact_id ?? null,
                        organisation_id: row.organisation_id ?? null,
                        linked_at: row.linked_at ?? null,
                        linked_by: row.linked_by ?? null,
                      },
                      error: null,
                    };
                  },
                };
              },
              then: undefined,
            };
            // Support await on update().eq() and update().eq().select().single()
            return {
              ...chain,
              select: chain.select,
            };
          },
        };
      },
      insert(row) {
        if (table === "crm_engagements") {
          const id = row.id || `eng-${engagements.length + 1}`;
          const saved = { ...row, id };
          engagements.push(saved);
          return {
            select() {
              return {
                single: async () => ({ data: { id }, error: null }),
              };
            },
          };
        }
        if (table === "crm_email_link_audits") {
          audits.push(row);
          return Promise.resolve({ error: null });
        }
        return Promise.resolve({ error: null });
      },
    };
  }

  return {
    audits,
    engagements,
    emails,
    from(table) {
      if (table === "crm_email_messages") {
        return selectChain(table, () => emails);
      }
      if (table === "crm_contacts") {
        return selectChain(table, () => contacts);
      }
      if (table === "crm_organisations") {
        return selectChain(table, () => organisations);
      }
      if (table === "crm_engagements") {
        return {
          update(patch) {
            return {
              eq(_col, val) {
                const row = engagements.find((e) => e.id === val);
                if (row) Object.assign(row, patch);
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(row) {
            const id = `eng-${engagements.length + 1}`;
            engagements.push({ ...row, id });
            return {
              select() {
                return {
                  single: async () => ({ data: { id }, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "crm_email_link_audits") {
        return {
          insert: async (row) => {
            audits.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

// --- Permissions ---
assert.equal(canManageCrmEmail("admin"), true);
assert.equal(canManageCrmEmail("office_manager"), true);
assert.equal(canManageCrmEmail("spacer"), false);
assert.equal(canManageCrmEmail("property_owner"), false);
assert.equal(canManageCrmEmail("user"), false);
assert.equal(canManageCrmEmail(null), false);

async function main() {
  // --- Link to contact (org inferred) ---
  {
    const db = createMockDb({
      organisations: { "org-1": { id: "org-1", name: "A" } },
      contacts: {
        "c-1": { id: "c-1", organisation_id: "org-1", full_name: "Pat" },
      },
      emails: {
        "e-1": {
          id: "e-1",
          subject: "Hello",
          sent_at: "2026-01-01T00:00:00Z",
          created_by: null,
          engagement_id: null,
          contact_id: null,
          organisation_id: null,
        },
      },
    });
    const result = await applyEmailLinkAction(db, {
      emailId: "e-1",
      action: "link",
      contactId: "c-1",
      actorId: "actor-1",
    });
    assert.equal(result.ok, true);
    assert.equal(result.email.contact_id, "c-1");
    assert.equal(result.email.organisation_id, "org-1");
    assert.ok(result.email.linked_at);
    assert.equal(result.email.linked_by, "actor-1");
    assert.equal(db.engagements.length, 1);
    assert.equal(db.audits[0].action, "email_linked");
  }

  // --- Org-only link (no engagement / timeline) ---
  {
    const db = createMockDb({
      organisations: { "org-1": { id: "org-1" } },
      emails: {
        "e-2": {
          id: "e-2",
          subject: "Org mail",
          sent_at: null,
          created_by: null,
          engagement_id: null,
          contact_id: null,
          organisation_id: null,
        },
      },
    });
    const result = await applyEmailLinkAction(db, {
      emailId: "e-2",
      action: "link",
      organisationId: "org-1",
      actorId: "actor-1",
    });
    assert.equal(result.ok, true);
    assert.equal(result.email.contact_id, null);
    assert.equal(result.email.organisation_id, "org-1");
    assert.equal(db.engagements.length, 0);
    assert.equal(db.audits[0].action, "email_linked");
  }

  // --- Invalid contact + organisation combo ---
  {
    const db = createMockDb({
      organisations: { "org-1": { id: "org-1" }, "org-2": { id: "org-2" } },
      contacts: { "c-1": { id: "c-1", organisation_id: "org-1" } },
      emails: {
        "e-3": {
          id: "e-3",
          subject: "x",
          sent_at: null,
          created_by: null,
          engagement_id: null,
          contact_id: null,
          organisation_id: null,
        },
      },
    });
    const result = await applyEmailLinkAction(db, {
      emailId: "e-3",
      action: "link",
      contactId: "c-1",
      organisationId: "org-2",
      actorId: null,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /does not belong/i);
    assert.equal(db.audits.length, 0);
  }

  // --- Relink reuses engagement (no duplicate timeline) ---
  {
    const db = createMockDb({
      organisations: { "org-1": { id: "org-1" } },
      contacts: {
        "c-1": { id: "c-1", organisation_id: "org-1" },
        "c-2": { id: "c-2", organisation_id: "org-1" },
      },
      engagements: [
        {
          id: "eng-1",
          organisation_id: "org-1",
          contact_id: "c-1",
          type: "email",
        },
      ],
      emails: {
        "e-4": {
          id: "e-4",
          subject: "Relink me",
          sent_at: null,
          created_by: null,
          engagement_id: "eng-1",
          contact_id: "c-1",
          organisation_id: "org-1",
        },
      },
    });
    const result = await applyEmailLinkAction(db, {
      emailId: "e-4",
      action: "relink",
      contactId: "c-2",
      actorId: "actor-2",
    });
    assert.equal(result.ok, true);
    assert.equal(result.email.contact_id, "c-2");
    assert.equal(db.engagements.length, 1);
    assert.equal(db.engagements[0].contact_id, "c-2");
    assert.equal(db.audits[0].action, "email_relinked");
  }

  // --- Unlink clears link fields, keeps message ---
  {
    const db = createMockDb({
      organisations: { "org-1": { id: "org-1" } },
      contacts: { "c-1": { id: "c-1", organisation_id: "org-1" } },
      emails: {
        "e-5": {
          id: "e-5",
          subject: "Unlink me",
          sent_at: null,
          created_by: null,
          engagement_id: "eng-keep",
          contact_id: "c-1",
          organisation_id: "org-1",
          linked_at: "2026-01-01T00:00:00Z",
          linked_by: "actor-1",
        },
      },
    });
    const result = await applyEmailLinkAction(db, {
      emailId: "e-5",
      action: "unlink",
      actorId: "actor-1",
    });
    assert.equal(result.ok, true);
    assert.equal(result.email.contact_id, null);
    assert.equal(result.email.organisation_id, null);
    assert.equal(result.email.linked_at, null);
    assert.ok(db.emails.get("e-5"));
    assert.equal(db.audits[0].action, "email_unlinked");
  }

  // --- UI / API wiring ---
  const commPage = readFileSync("app/admin/crm/communication/page.tsx", "utf8");
  assert.match(commPage, /href="\/admin\/crm\/communication\/unlinked"/);
  assert.doesNotMatch(commPage, /href="\/space-place\/email-inbox"/);
  assert.match(commPage, /!e\.contact_id && !e\.organisation_id/);

  const unlinkedPage = readFileSync(
    "app/admin/crm/communication/unlinked/page.tsx",
    "utf8"
  );
  assert.match(unlinkedPage, /Back to Communication/);
  assert.match(unlinkedPage, /unlinked:\s*"1"|unlinked=1/);
  assert.match(unlinkedPage, /CrmEmailDetailDrawer/);
  assert.match(unlinkedPage, /Link email/);
  assert.match(unlinkedPage, /email-link-search/);
  assert.match(unlinkedPage, /Retry automatic match/);
  assert.match(unlinkedPage, /Recipient suggestions/);
  assert.match(unlinkedPage, /Start typing a name or email/);
  assert.match(unlinkedPage, /Select a contact to enable Save link/);
  assert.doesNotMatch(unlinkedPage, /fetchCrmDesktopContacts/);
  assert.doesNotMatch(unlinkedPage, /\/space-place\/email-inbox/);

  // HTML preview must not dump raw tags
  const previewSrc = readFileSync("lib/space-place/crm-email.ts", "utf8");
  assert.match(previewSrc, /replace\(\/<\[\^>\]\+>\/g/);
  const { emailPreview } = await import("../lib/space-place/crm-email.js");
  assert.equal(
    emailPreview("<html><body><p style=\"color:red\">Hello Witzenberg</p></body></html>"),
    "Hello Witzenberg"
  );
  assert.doesNotMatch(
    emailPreview("<html><body><p>Hi</p></body></html>"),
    /<html|<body|<p/
  );

  const helpers = readFileSync(
    "lib/space-place/email-import-helpers.ts",
    "utf8"
  );
  assert.match(helpers, /matched_organisation/);

  const rematchRoute = readFileSync(
    "app/api/space-place/email-messages/[id]/rematch/route.ts",
    "utf8"
  );
  assert.match(rematchRoute, /rematchEmailMessage/);
  assert.match(rematchRoute, /requireCrmEmailManagerApi/);

  const searchRoute = readFileSync(
    "app/api/space-place/email-link-search/route.ts",
    "utf8"
  );
  assert.match(searchRoute, /requireCrmEmailManagerApi/);
  assert.match(searchRoute, /organisations/);
  assert.match(searchRoute, /suggestions/);
  assert.doesNotMatch(searchRoute, /requireCrmDesktopApi/);

  const layout = readFileSync("app/admin/crm/layout.tsx", "utf8");
  assert.match(layout, /CrmDesktopShell/);

  const listRoute = readFileSync(
    "app/api/space-place/email-messages/route.ts",
    "utf8"
  );
  assert.match(listRoute, /requireCrmEmailManagerApi/);
  assert.match(listRoute, /\.is\("contact_id", null\)\.is\("organisation_id", null\)/);

  const patchRoute = readFileSync(
    "app/api/space-place/email-messages/[id]/route.ts",
    "utf8"
  );
  assert.match(patchRoute, /PATCH/);
  assert.match(patchRoute, /applyEmailLinkAction/);

  const gate = readFileSync("lib/require-crm-email-manager-api.ts", "utf8");
  assert.match(gate, /canManageCrmEmail/);

  const mobileMore = readFileSync("app/space-place/more/page.tsx", "utf8");
  assert.match(mobileMore, /\/space-place\/email-inbox/);

  console.log("test-crm-email-unlinked: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
