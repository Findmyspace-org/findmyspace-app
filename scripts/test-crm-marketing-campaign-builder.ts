#!/usr/bin/env node
/**
 * CRM marketing campaign builder + template tests.
 * Run: npm run test:crm-marketing-campaign-builder
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyMergeFields } from "../lib/crm-marketing/campaign-content";
import {
  assertTemplateHasUnsubscribePlaceholder,
  rejectUnsafeTemplateHtml,
  REQUIRED_UNSUBSCRIBE_PLACEHOLDER,
} from "../lib/crm-marketing/template-sanitize";
import { renderMarketingCampaignEmail } from "../lib/crm-marketing/campaign-render";
import { normaliseAudienceDefinition } from "../lib/crm-marketing/audience-definition";
import { validateMarketingSenderEmail } from "../lib/crm-marketing/sender-validation";

const migration = readFileSync(
  "supabase/migrations/057_20260707_crm_marketing_templates_campaigns.sql",
  "utf8"
);
assert.match(migration, /crm_marketing_templates/);
assert.match(migration, /audience_definition jsonb/);
assert.match(migration, /template_snapshot_json/);
assert.match(migration, /crm_marketing_templates_one_default_idx/);

assert.throws(() => rejectUnsafeTemplateHtml('<script>alert(1)</script>'));

assert.doesNotThrow(() =>
  assertTemplateHasUnsubscribePlaceholder(
    `Hello ${REQUIRED_UNSUBSCRIBE_PLACEHOLDER}`,
    REQUIRED_UNSUBSCRIBE_PLACEHOLDER,
    { requireUnsubscribe: true }
  )
);

assert.throws(() =>
  assertTemplateHasUnsubscribePlaceholder("Hello", "Plain", { requireUnsubscribe: true })
);

const rendered = renderMarketingCampaignEmail({
  template: {
    id: "t1",
    name: "Test",
    templateType: "general",
    headerJson: { logoUrl: "/logo.png" },
    footerJson: { companyName: "FindMySpace", requireUnsubscribe: true },
    contentStyleJson: {},
    htmlTemplate: null,
    plainTextTemplate: null,
  },
  content: {
    heading: "Hi {{contact_first_name}}",
    mainContent: "Welcome to {{organisation_name}}",
    ctaLabel: "Open",
    ctaUrl: "https://findmyspace.co.za",
  },
  subject: "Test subject",
  mergeContext: {
    contactFirstName: "Sam",
    organisationName: "Acme",
    unsubscribeUrl: "https://example.com/unsub",
  },
});

assert.match(rendered.html, /Sam/);
assert.match(rendered.html, /Acme/);
assert.doesNotMatch(rendered.html, /<script/i);
assert.match(rendered.plainText, /Test subject/);

const merged = applyMergeFields("Hi {{contact_first_name}} from {{organisation_name}}", {
  contactFirstName: "",
  contactFullName: "",
  organisationName: "",
});
assert.equal(merged, "Hi there from ");

const audience = normaliseAudienceDefinition({
  pipelineStages: ["in_progress", "closed_lost"],
  organisationTypes: ["municipality"],
  manualExcludeContactIds: ["c1"],
});
assert.deepEqual(audience.pipelineStages, ["in_progress", "closed_lost"]);
assert.ok(audience.manualExcludeContactIds?.includes("c1"));

const sender = validateMarketingSenderEmail(process.env.EMAIL_FROM || "hello@example.com");
assert.ok("ok" in sender);

const campaignsRoute = readFileSync(
  "app/api/admin/crm/marketing/campaigns/route.ts",
  "utf8"
);
assert.doesNotMatch(campaignsRoute, /status:\s*['"]sent['"]/);
assert.doesNotMatch(campaignsRoute, /schedule/i);

const builderSource = readFileSync(
  "app/components/crm-desktop/CrmCampaignBuilder.tsx",
  "utf8"
);
assert.match(builderSource, /Send now \(disabled\)/);
assert.match(builderSource, /Production sending will be enabled/);
assert.match(builderSource, /pipelineStages/);
assert.match(builderSource, /marketplaceFilters/);

const navSource = readFileSync("app/components/crm-desktop/CrmMarketingNav.tsx", "utf8");
assert.match(navSource, /Templates/);
assert.match(navSource, /Campaigns/);

console.log("test-crm-marketing-campaign-builder: all assertions passed");
