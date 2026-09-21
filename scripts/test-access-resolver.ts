#!/usr/bin/env node
/**
 * Canonical organisation access resolver tests (no live database).
 * Run: npm run test:access-resolver
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import type {
  AccessContext,
  OrganisationAccessGrant,
  ResolvedAccess,
} from "../lib/access/roles";

const USER = "user-jane";
const ORG_A = "org-a";
const ORG_B = "org-b";
const PROP_A1 = "prop-a1";
const PROP_A2 = "prop-a2";
const SPACE_A1 = "space-a1";
const SPACE_A1B = "space-a1-b";
const SPACE_A2 = "space-a2";
const SPACE_STANDALONE = "space-solo";

function grant(
  partial: Partial<OrganisationAccessGrant> &
    Pick<OrganisationAccessGrant, "role" | "status">
): OrganisationAccessGrant {
  return {
    organisationId: partial.organisationId ?? ORG_A,
    role: partial.role,
    propertyId: partial.propertyId ?? null,
    spaceId: partial.spaceId ?? null,
    status: partial.status,
  };
}

function ctx(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: USER,
    spaceId: SPACE_A1,
    propertyId: PROP_A1,
    organisationId: ORG_A,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: "user",
    adminAccessDisabled: false,
    grants: [],
    ...overrides,
  };
}

function assertNoManagement(access: ResolvedAccess) {
  assert.equal(access.canViewSpace, false);
  assert.equal(access.canEditSpace, false);
  assert.equal(access.canManageBooking, false);
  assert.equal(access.canViewBookingCommercial, false);
  assert.equal(access.canManageOrganisationFinance, false);
  assert.equal(access.canManagePeopleAccess, false);
  assert.equal(access.canAssignOrganisationAdmin, false);
  assert.equal(access.canAssignManagers, false);
}

function assertSpaceOps(access: ResolvedAccess, allowed: boolean) {
  assert.equal(access.canViewSpace, allowed);
  assert.equal(access.canEditSpace, allowed);
  assert.equal(access.canManageBooking, allowed);
  assert.equal(access.canViewBookingCommercial, allowed);
}

function assertOrgAdminCaps(access: ResolvedAccess, allowed: boolean) {
  assert.equal(access.canManageOrganisationFinance, allowed);
  assert.equal(access.canManagePeopleAccess, allowed);
  assert.equal(access.canAssignOrganisationAdmin, allowed);
  assert.equal(access.canAssignManagers, allowed);
}

// A. Ordinary user
{
  const access = computeAccess(ctx());
  assertNoManagement(access);
  assert.equal(access.isGlobalAdmin, false);
  assert.equal(access.isOrganisationAdmin, false);
}

// B. Global Admin
{
  const access = computeAccess(ctx({ profileRole: "admin" }));
  assertSpaceOps(access, true);
  assertOrgAdminCaps(access, true);
  assert.equal(access.isGlobalAdmin, true);
  const superAccess = computeAccess(ctx({ profileRole: "super_admin" }));
  assert.equal(superAccess.isGlobalAdmin, true);
  assertSpaceOps(superAccess, true);
}

// C. Disabled Global Admin — no new organisation-access bypass
{
  const access = computeAccess(
    ctx({ profileRole: "admin", adminAccessDisabled: true })
  );
  assert.equal(access.isGlobalAdmin, false);
  assertNoManagement(access);
}

// D. Org Admin
{
  const access = computeAccess(
    ctx({
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  assert.equal(access.isOrganisationAdmin, true);
  assertSpaceOps(access, true);
  assertOrgAdminCaps(access, true);
  const sibling = computeAccess(
    ctx({
      spaceId: SPACE_A2,
      propertyId: PROP_A2,
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  assertSpaceOps(sibling, true);
}

// E. Property Manager
{
  const access = computeAccess(
    ctx({
      grants: [
        grant({
          role: "property_manager",
          status: "active",
          propertyId: PROP_A1,
        }),
      ],
    })
  );
  assert.equal(access.isPropertyManager, true);
  assert.equal(access.isOrganisationAdmin, false);
  assertSpaceOps(access, true);
  assertOrgAdminCaps(access, false);

  const futureSpace = computeAccess(
    ctx({
      spaceId: SPACE_A1B,
      grants: [
        grant({
          role: "property_manager",
          status: "active",
          propertyId: PROP_A1,
        }),
      ],
    })
  );
  assertSpaceOps(futureSpace, true);

  const otherProperty = computeAccess(
    ctx({
      spaceId: SPACE_A2,
      propertyId: PROP_A2,
      grants: [
        grant({
          role: "property_manager",
          status: "active",
          propertyId: PROP_A1,
        }),
      ],
    })
  );
  assert.equal(otherProperty.isPropertyManager, false);
  assertNoManagement(otherProperty);
}

// F. Space Manager
{
  const access = computeAccess(
    ctx({
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP_A1,
          spaceId: SPACE_A1,
        }),
      ],
    })
  );
  assert.equal(access.isSpaceManager, true);
  assertSpaceOps(access, true);
  assert.equal(access.canViewBookingCommercial, true);
  assertOrgAdminCaps(access, false);

  const sibling = computeAccess(
    ctx({
      spaceId: SPACE_A1B,
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP_A1,
          spaceId: SPACE_A1,
        }),
      ],
    })
  );
  assert.equal(sibling.isSpaceManager, false);
  assertNoManagement(sibling);
}

// G. Multiple Space Managers
{
  const first = computeAccess(
    ctx({
      userId: "manager-1",
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP_A1,
          spaceId: SPACE_A1,
        }),
      ],
    })
  );
  const second = computeAccess(
    ctx({
      userId: "manager-2",
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP_A1,
          spaceId: SPACE_A1,
        }),
      ],
    })
  );
  assert.equal(first.isSpaceManager, true);
  assert.equal(second.isSpaceManager, true);
  assertSpaceOps(first, true);
  assertSpaceOps(second, true);
}

// H. Pending grant
{
  const access = computeAccess(
    ctx({
      grants: [grant({ role: "org_admin", status: "pending" })],
    })
  );
  assert.equal(access.isOrganisationAdmin, false);
  assertNoManagement(access);
}

// I. Revoked grant
{
  const access = computeAccess(
    ctx({
      grants: [grant({ role: "org_admin", status: "revoked" })],
    })
  );
  assert.equal(access.isOrganisationAdmin, false);
  assertNoManagement(access);
}

// J. Legacy Property Owner — not Org Admin
{
  const access = computeAccess(
    ctx({
      propertyOwnerId: USER,
      organisationId: ORG_A,
    })
  );
  assert.equal(access.isLegacyPropertyOwner, true);
  assert.equal(access.isOrganisationAdmin, false);
  assertSpaceOps(access, true);
  assertOrgAdminCaps(access, false);
}

// K. Legacy Space Owner
{
  const access = computeAccess(
    ctx({
      spaceOwnerId: USER,
      organisationId: ORG_A,
    })
  );
  assert.equal(access.isLegacySpaceOwner, true);
  assert.equal(access.isOrganisationAdmin, false);
  assertSpaceOps(access, true);
  assertOrgAdminCaps(access, false);
}

// L. Null owner org space — Org Admin / Space Manager still manage
{
  const orgAdmin = computeAccess(
    ctx({
      spaceOwnerId: null,
      propertyOwnerId: "someone-else",
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  assertSpaceOps(orgAdmin, true);
  const spaceManager = computeAccess(
    ctx({
      spaceOwnerId: null,
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP_A1,
          spaceId: SPACE_A1,
        }),
      ],
    })
  );
  assertSpaceOps(spaceManager, true);
}

// M. Standalone legacy space
{
  const access = computeAccess(
    ctx({
      spaceId: SPACE_STANDALONE,
      propertyId: null,
      organisationId: null,
      spaceOwnerId: USER,
      propertyOwnerId: null,
    })
  );
  assert.equal(access.isLegacySpaceOwner, true);
  assertSpaceOps(access, true);
  assertOrgAdminCaps(access, false);
}

// N. Cross-org spoof
{
  const access = computeAccess(
    ctx({
      organisationId: ORG_B,
      propertyId: PROP_A2,
      spaceId: SPACE_A2,
      grants: [grant({ organisationId: ORG_A, role: "org_admin", status: "active" })],
    })
  );
  assert.equal(access.isOrganisationAdmin, false);
  assertNoManagement(access);
}

// O. Property/space scope mismatch treated as no grant
{
  const mismatchedPm = computeAccess(
    ctx({
      grants: [
        grant({
          organisationId: ORG_B,
          role: "property_manager",
          status: "active",
          propertyId: PROP_A1,
        }),
      ],
    })
  );
  assert.equal(mismatchedPm.isPropertyManager, false);
  assertNoManagement(mismatchedPm);

  const mismatchedSm = computeAccess(
    ctx({
      grants: [
        grant({
          role: "space_manager",
          status: "active",
          propertyId: PROP_A2,
          spaceId: SPACE_A1,
        }),
      ],
    })
  );
  assert.equal(mismatchedSm.isSpaceManager, false);
  assertNoManagement(mismatchedSm);
}

// P. Same user in two organisations
{
  const inA = computeAccess(
    ctx({
      grants: [
        grant({ organisationId: ORG_A, role: "org_admin", status: "active" }),
        grant({ organisationId: ORG_B, role: "org_admin", status: "active" }),
      ],
    })
  );
  const inB = computeAccess(
    ctx({
      organisationId: ORG_B,
      propertyId: PROP_A2,
      spaceId: SPACE_A2,
      grants: [
        grant({ organisationId: ORG_A, role: "org_admin", status: "active" }),
        grant({ organisationId: ORG_B, role: "org_admin", status: "active" }),
      ],
    })
  );
  assert.equal(inA.isOrganisationAdmin, true);
  assert.equal(inA.organisationId, ORG_A);
  assert.equal(inB.isOrganisationAdmin, true);
  assert.equal(inB.organisationId, ORG_B);
  const onlyA = computeAccess(
    ctx({
      organisationId: ORG_B,
      propertyId: PROP_A2,
      spaceId: SPACE_A2,
      grants: [grant({ organisationId: ORG_A, role: "org_admin", status: "active" })],
    })
  );
  assert.equal(onlyA.isOrganisationAdmin, false);
  assertNoManagement(onlyA);
}

// Migration 065 contract
{
  const sql = readFileSync(
    "supabase/migrations/065_20260921_organisation_access_helpers.sql",
    "utf8"
  );
  assert.match(sql, /user_is_active_platform_admin/);
  assert.match(sql, /admin_access_disabled/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.user_is_platform_admin/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.user_can_manage_space_listing/);
  assert.doesNotMatch(sql, /INSERT\s+INTO/i);
  assert.doesNotMatch(sql, /CREATE POLICY/);
  assert.match(sql, /user_can_manage_space\(/);
  assert.match(sql, /user_can_view_booking_commercial/);
  assert.match(sql, /user_can_manage_org_finance/);
  assert.match(sql, /user_can_manage_org_people/);
  assert.match(sql, /SET search_path = pg_catalog, public/);
  assert.doesNotMatch(sql, /SET search_path = public\s*$/m);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.user_is_active_org_admin\(uuid\) FROM anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.user_is_active_platform_admin\(\) FROM anon/);
  assert.match(sql, /auth\.uid\(\)/);
  const manageSpaceBody = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.user_can_manage_space"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.user_can_manage_booking")
  );
  assert.match(manageSpaceBody, /user_is_active_platform_admin\(\)/);
  assert.doesNotMatch(manageSpaceBody, /user_is_platform_admin\(\)/);
}

// Existing owner helpers remain production paths
{
  const listingApi = readFileSync("lib/require-owner-listing-api.ts", "utf8");
  const propertyApi = readFileSync("lib/require-owner-property-api.ts", "utf8");
  const listingAccess = readFileSync("lib/space-listing-access.ts", "utf8");
  const bookingRequest = readFileSync("app/api/bookings/request/route.ts", "utf8");
  assert.match(listingApi, /resolveAccessForSpace/);
  assert.match(listingApi, /canEditSpace/);
  assert.doesNotMatch(listingApi, /owner_id !== user\.id/);
  assert.match(propertyApi, /owner_id !== user\.id/);
  assert.match(listingAccess, /row\.owner_id === userId/);
  assert.doesNotMatch(propertyApi, /resolveAccessForProperty/);
  assert.doesNotMatch(
    bookingRequest,
    /resolveAccessForSpace|resolveAccessForProperty|resolveAccessForOrganisation|requireManagedListingApi|requireManagedPropertyApi/
  );
}

{
  const wrappers = readFileSync("lib/access/require-managed-api.ts", "utf8");
  assert.match(wrappers, /userClient\.auth\.getUser\(\)/);
  assert.match(wrappers, /userId: user\.id/);
  assert.match(wrappers, /Not wired into existing owner routes yet/);
  assert.doesNotMatch(wrappers, /req\.json\(\)|body\.userId|searchParams\.get\(["']userId/);
}

console.log("test-access-resolver: all assertions passed");
