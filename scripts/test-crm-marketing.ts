#!/usr/bin/env node
/**
 * CRM marketing eligibility and compliance tests (no DB).
 * Run: npm run test:crm-marketing
 */

import assert from "node:assert/strict";
import {
  evaluateMarketingEligibility,
  defaultMarketingStatusForPipelineClose,
  normaliseMarketingEmail,
} from "../lib/crm-marketing/eligibility";
import { pipelineStageRequiresReason } from "../lib/crm-marketing/pipeline";

assert.equal(normaliseMarketingEmail("  John@Example.com "), "john@example.com");
assert.equal(normaliseMarketingEmail(""), null);

const subscribed = evaluateMarketingEligibility({
  email: "a@b.com",
  status: "subscribed",
  consentStatus: "granted",
  lawfulBasis: "consent",
});
assert.equal(subscribed.sendable, true);

const noConsent = evaluateMarketingEligibility({
  email: "a@b.com",
  status: "pending_consent",
  consentStatus: "unknown",
  lawfulBasis: "review_required",
});
assert.equal(noConsent.sendable, false);

const unsub = evaluateMarketingEligibility({
  email: "a@b.com",
  status: "unsubscribed",
  consentStatus: "withdrawn",
  lawfulBasis: "none",
  unsubscribeAt: "2026-01-01T00:00:00Z",
});
assert.equal(unsub.sendable, false);
assert.equal(unsub.status, "unsubscribed");

const suppressed = evaluateMarketingEligibility({
  email: "a@b.com",
  status: "suppressed",
  consentStatus: "unknown",
  lawfulBasis: "none",
  suppressedAt: "2026-01-01T00:00:00Z",
});
assert.equal(suppressed.sendable, false);

const defaults = defaultMarketingStatusForPipelineClose();
assert.equal(defaults.status, "pending_consent");
assert.equal(defaults.lawfulBasis, "review_required");

const preserved = defaultMarketingStatusForPipelineClose({
  status: "unsubscribed",
  unsubscribe_at: "2026-01-01",
});
assert.equal(preserved.status, "unsubscribed");

assert.equal(pipelineStageRequiresReason("closed_lost"), true);
assert.equal(pipelineStageRequiresReason("prospect"), false);

console.log("test-crm-marketing: all passed");
