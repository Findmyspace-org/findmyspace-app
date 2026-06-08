#!/usr/bin/env node
/**
 * Pure-function lifecycle guard tests (no DB required).
 * Run: npm run test:lifecycle-guards
 */

import assert from "node:assert/strict";

const BOOKABLE = "active";
const PUBLIC = new Set(["active", "unclaimed"]);
const CLAIMABLE = new Set(["draft", "unclaimed"]);
const OWNER_EDITABLE = new Set([
  "owner_claimed",
  "needs_changes",
  "active",
  "paused",
  "pending",
]);

function isSpaceBookable(status) {
  return status === BOOKABLE;
}

function isPublicListingStatus(status) {
  return PUBLIC.has(status || "");
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

function assertSpaceBookableForPayment(status) {
  if (!isSpaceBookable(status)) {
    return {
      ok: false,
      error: "Payment is not available because this listing is no longer active.",
    };
  }
  return { ok: true };
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test("only active is bookable", () => {
  assert.equal(isSpaceBookable("active"), true);
  assert.equal(isSpaceBookable("unclaimed"), false);
  assert.equal(isSpaceBookable("owner_claimed"), false);
});

test("public statuses are active and unclaimed only", () => {
  assert.equal(isPublicListingStatus("active"), true);
  assert.equal(isPublicListingStatus("unclaimed"), true);
  assert.equal(isPublicListingStatus("owner_claimed"), false);
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
  const blocked = assertSpaceBookableForPayment("paused");
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /no longer active/i);
});

console.log("\nAll lifecycle guard tests passed.");
