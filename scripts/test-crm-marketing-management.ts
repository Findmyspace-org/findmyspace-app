#!/usr/bin/env tsx
/**
 * Marketing management unit tests (no DB for most cases).
 * Run: npm run test:crm-marketing-management
 */

import assert from "node:assert/strict";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../lib/crm-marketing/unsubscribe-token";
import { evaluateMarketingEligibility } from "../lib/crm-marketing/eligibility";
import { buildMarketingContactsCsv } from "../lib/crm-marketing/export";

process.env.INTERNAL_API_SECRET = "test-secret-for-marketing";

const token = createUnsubscribeToken({
  marketingContactId: "00000000-0000-0000-0000-000000000001",
  emailNormalised: "user@example.com",
});

const verified = verifyUnsubscribeToken(token);
assert.equal(verified.ok, true);
if (verified.ok) {
  assert.equal(verified.payload.emailNormalised, "user@example.com");
}

const tampered = verifyUnsubscribeToken(`${token}x`);
assert.equal(tampered.ok, false);

const expired = createUnsubscribeToken({
  marketingContactId: "00000000-0000-0000-0000-000000000001",
  emailNormalised: "user@example.com",
  expiresAt: Date.now() - 1000,
});
assert.equal(verifyUnsubscribeToken(expired).ok, false);

const unsubscribed = evaluateMarketingEligibility({
  email: "a@b.com",
  status: "unsubscribed",
  consentStatus: "withdrawn",
  lawfulBasis: "none",
  unsubscribeAt: "2026-01-01T00:00:00Z",
});
assert.equal(unsubscribed.sendable, false);

const suppressed = evaluateMarketingEligibility({
  email: "a@b.com",
  status: "suppressed",
  consentStatus: "unknown",
  lawfulBasis: "none",
  suppressedAt: "2026-01-01T00:00:00Z",
});
assert.equal(suppressed.sendable, false);

const csv = buildMarketingContactsCsv([
  {
    contact_name: "Test User",
    organisation_name: "Org",
    role: "Role",
    email: "test@example.com",
    status: "pending_consent",
    consent_status: "unknown",
    lawful_basis: "review_required",
    lists: ["General updates"],
    sendable: false,
    eligibility_reason: "Pending consent or review required",
  },
]);
assert.match(csv, /Test User/);
assert.match(csv, /Pending consent or review required/);
assert.ok(!csv.includes("service-role"));

console.log("test-crm-marketing-management: all passed");
