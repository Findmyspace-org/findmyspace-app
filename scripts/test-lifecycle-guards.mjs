#!/usr/bin/env node
/**
 * Pure-function lifecycle guard tests (no DB required).
 * Run: npm run test:lifecycle-guards
 */

import assert from "node:assert/strict";

const BOOKABLE = "active";
const CLAIMABLE = new Set(["draft", "unclaimed"]);
const OWNER_EDITABLE = new Set([
  "owner_claimed",
  "needs_changes",
  "active",
  "paused",
  "pending",
]);

function isSpaceBookable(input) {
  if (typeof input === "object" && input !== null) {
    return (
      input.status === BOOKABLE && (input.public_listing_mode || "live") === "live"
    );
  }
  return input === BOOKABLE;
}

function isSpacePubliclyVisible(input) {
  const mode =
    typeof input === "object" && input !== null
      ? input.public_listing_mode
      : input;
  return mode === "enquiry" || mode === "live";
}

function acceptsListingEnquiries(input) {
  const mode =
    typeof input === "object" && input !== null
      ? input.public_listing_mode
      : null;
  return mode === "enquiry";
}

function isSpaceClaimable(space) {
  if (!space.created_by_admin) return false;
  if (space.owner_id) return false;
  if (space.status === "active") return false;
  return CLAIMABLE.has(space.status || "");
}

function isClaimTokenExpired(expiresAt) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

function resolveClaimTokenStatus(row) {
  if (row.status === "pending" && isClaimTokenExpired(row.expires_at)) {
    return "expired";
  }
  return row.status;
}

function canOwnerEditListing(status) {
  return OWNER_EDITABLE.has(status || "");
}

function isOwnerListingLockedForEdit(status) {
  return (
    status === "pending_verification" ||
    status === "rejected" ||
    status === "draft" ||
    status === "unclaimed"
  );
}

function assertSpaceBookableForPayment(input) {
  if (!isSpaceBookable(input)) {
    return {
      ok: false,
      error: "Payment is not available because this listing is no longer active.",
    };
  }
  return { ok: true };
}

function canAdminSetEnquiryMode(status, options = {}) {
  if (status === "rejected" || status === "deleted") return false;
  if (status === "needs_changes") return Boolean(options.overrideNeedsChanges);
  return ["draft", "unclaimed", "owner_claimed", "pending_verification", "active"].includes(
    status || ""
  );
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test("only active + live mode is bookable", () => {
  assert.equal(isSpaceBookable({ status: "active", public_listing_mode: "live" }), true);
  assert.equal(isSpaceBookable({ status: "active", public_listing_mode: "enquiry" }), false);
  assert.equal(isSpaceBookable({ status: "unclaimed", public_listing_mode: "enquiry" }), false);
  assert.equal(isSpaceBookable("active"), true);
});

test("public visibility uses listing mode", () => {
  assert.equal(isSpacePubliclyVisible({ public_listing_mode: "enquiry" }), true);
  assert.equal(isSpacePubliclyVisible({ public_listing_mode: "live" }), true);
  assert.equal(isSpacePubliclyVisible({ public_listing_mode: "off" }), false);
});

test("enquiries accept enquiry mode only", () => {
  assert.equal(acceptsListingEnquiries({ public_listing_mode: "enquiry" }), true);
  assert.equal(acceptsListingEnquiries({ public_listing_mode: "live" }), false);
  assert.equal(acceptsListingEnquiries({ public_listing_mode: "off" }), false);
});

test("claim token expiry resolution", () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  assert.equal(
    resolveClaimTokenStatus({ status: "pending", expires_at: past }),
    "expired"
  );
});

test("isSpaceClaimable rejects owned, non-admin, and active listings", () => {
  const base = {
    id: "1",
    title: "T",
    description: null,
    city: null,
    suburb: null,
    space_type: null,
    claimed_at: null,
  };
  assert.equal(
    isSpaceClaimable({ ...base, status: "unclaimed", owner_id: null, created_by_admin: true }),
    true
  );
  assert.equal(
    isSpaceClaimable({ ...base, status: "unclaimed", owner_id: "u1", created_by_admin: true }),
    false
  );
  assert.equal(
    isSpaceClaimable({ ...base, status: "active", owner_id: null, created_by_admin: true }),
    false
  );
});

test("owner edit permissions by status", () => {
  assert.equal(canOwnerEditListing("owner_claimed"), true);
  assert.equal(isOwnerListingLockedForEdit("pending_verification"), true);
  assert.equal(canOwnerEditListing("pending_verification"), false);
});

test("payment guard messaging", () => {
  const blocked = assertSpaceBookableForPayment({
    status: "active",
    public_listing_mode: "enquiry",
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /no longer active/i);
});

test("admin enquiry eligibility", () => {
  assert.equal(canAdminSetEnquiryMode("pending_verification"), true);
  assert.equal(canAdminSetEnquiryMode("needs_changes"), false);
  assert.equal(canAdminSetEnquiryMode("needs_changes", { overrideNeedsChanges: true }), true);
  assert.equal(canAdminSetEnquiryMode("rejected"), false);
});

console.log("\nAll lifecycle guard tests passed.");
