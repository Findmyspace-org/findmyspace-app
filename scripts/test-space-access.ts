import assert from "node:assert/strict";
import {
  canManageProperty,
  canManagePropertyUsers,
  canManageSpace,
  canViewProperty,
  isSpaceManagerOnly,
} from "../lib/space-access";

const admin = {
  userId: "admin",
  isPlatformAdmin: true,
  propertyId: "p1",
  propertyOwnerId: "owner",
  assignedSpaceIdsOnProperty: [] as string[],
};

const owner = {
  userId: "owner",
  isPlatformAdmin: false,
  propertyId: "p1",
  propertyOwnerId: "owner",
  assignedSpaceIdsOnProperty: [] as string[],
};

const manager = {
  userId: "teacher",
  isPlatformAdmin: false,
  propertyId: "p1",
  propertyOwnerId: "owner",
  assignedSpaceIdsOnProperty: ["astro", "pool"],
};

const outsider = {
  userId: "other",
  isPlatformAdmin: false,
  propertyId: "p1",
  propertyOwnerId: "owner",
  assignedSpaceIdsOnProperty: [] as string[],
};

assert.equal(canManageProperty(admin), true);
assert.equal(canManageProperty(owner), true);
assert.equal(canManageProperty(manager), false);
assert.equal(canManagePropertyUsers(manager), false);
assert.equal(canViewProperty(manager), true);
assert.equal(canViewProperty(outsider), false);
assert.equal(isSpaceManagerOnly(manager), true);
assert.equal(isSpaceManagerOnly(owner), false);

assert.equal(
  canManageSpace({
    ...admin,
    spaceId: "hall",
    spaceOwnerId: "owner",
    assignedSpaceIds: [],
  }),
  true
);
assert.equal(
  canManageSpace({
    ...owner,
    spaceId: "hall",
    spaceOwnerId: "owner",
    assignedSpaceIds: [],
  }),
  true
);
assert.equal(
  canManageSpace({
    ...manager,
    spaceId: "astro",
    spaceOwnerId: "owner",
    assignedSpaceIds: ["astro", "pool"],
  }),
  true
);
assert.equal(
  canManageSpace({
    ...manager,
    spaceId: "hall",
    spaceOwnerId: "owner",
    assignedSpaceIds: ["astro", "pool"],
  }),
  false
);
assert.equal(
  canManageSpace({
    ...outsider,
    spaceId: "astro",
    spaceOwnerId: "owner",
    assignedSpaceIds: [],
  }),
  false
);

console.log("space-access scenarios passed");
