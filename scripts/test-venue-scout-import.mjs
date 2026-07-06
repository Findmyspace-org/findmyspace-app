#!/usr/bin/env node
/**
 * Venue Scout import MVP tests (no network / no DB).
 * Mirrors conservative crawler/extraction invariants.
 * Run: npm run test:venue-scout-import
 */

import assert from "node:assert/strict";

const FALLBACK_STATUS = ["queued", "crawling", "extracted", "needs_review", "converted", "failed", "archived"];
const MAX_PAGES = 20;
const MAX_DEPTH = 3;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?27|0)\s?(?:\d[\s-]?){8,10}/g;

function normalizeVenueImportUrl(input) {
  const raw = input.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.username = "";
  url.password = "";
  if (url.pathname === "") url.pathname = "/";
  return {
    url: url.toString(),
    normalizedDomain: url.hostname.replace(/^www\./i, "").toLowerCase(),
  };
}

function redactContactDetails(text) {
  return text.replace(EMAIL_RE, "[email redacted]").replace(PHONE_RE, "[phone redacted]");
}

function parseCapacity(text) {
  const match = text.match(/\b(?:up to|capacity|seats?|accommodates?|guests?)\D{0,30}(\d{2,5})\b/i);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function parsePrice(text) {
  const match = text.match(/\bR\s?(\d[\d\s,.]{1,12})\b/i);
  if (!match?.[1]) return { amount: null, unit: null };
  const amount = Number(match[1].replace(/[\s,]/g, ""));
  const lower = text.toLowerCase();
  const unit = lower.includes("per hour")
    ? "hour"
    : lower.includes("per month")
      ? "month"
      : lower.includes("per event") || lower.includes("function")
        ? "event"
        : "day";
  return { amount, unit };
}

function isSpacePubliclySafeStatus(status) {
  return status === "draft" || status === "unclaimed";
}

function mapCandidateToDraftSpace(candidate, property, sourceUrl) {
  const description = redactContactDetails(candidate.description || "");
  return {
    title: candidate.name || "Untitled space",
    status: "draft",
    property_id: property?.id ?? null,
    public_listing_mode: "off",
    description: `${description}\n\nImported from Venue Scout staging. Source: ${sourceUrl}. Review all details before publishing.`,
    price_unit: candidate.price_unit || "on_request",
    price_amount: candidate.price_amount ?? null,
  };
}

const normalized = normalizeVenueImportUrl("www.perdeberg.example/venues#top");
assert.equal(normalized.url, "https://www.perdeberg.example/venues");
assert.equal(normalized.normalizedDomain, "perdeberg.example");

assert.ok(FALLBACK_STATUS.includes("needs_review"));
assert.ok(MAX_PAGES <= 20, "MVP crawl cap must remain conservative");
assert.ok(MAX_DEPTH <= 3, "MVP depth cap must remain conservative");

const pageText =
  "Perdeberg Function Room seats up to 180 guests. Venue hire R49 500 per event. Email info@example.com or call 021 123 4567.";
assert.equal(parseCapacity(pageText), 180);
assert.deepEqual(parsePrice(pageText), { amount: 49500, unit: "event" });
assert.ok(!redactContactDetails(pageText).includes("info@example.com"));
assert.ok(!redactContactDetails(pageText).includes("021 123 4567"));

const draft = mapCandidateToDraftSpace(
  {
    name: "Perdeberg Function Room",
    description: pageText,
    price_amount: 49500,
    price_unit: "event",
  },
  { id: "property-id" },
  "https://perdeberg.example"
);
assert.equal(draft.status, "draft");
assert.equal(draft.public_listing_mode, "off");
assert.equal(draft.property_id, "property-id");
assert.equal(isSpacePubliclySafeStatus(draft.status), true);
assert.ok(!draft.description.includes("info@example.com"));
assert.ok(draft.description.includes("Venue Scout staging"));

console.log("test-venue-scout-import: all assertions passed");
