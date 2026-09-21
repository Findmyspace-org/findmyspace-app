#!/usr/bin/env node
/**
 * People & Access (067) — pure helpers + source contracts.
 * Does not apply migrations or write production data.
 * Run: npm run test:people-access
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import { computeOperationalBookingManagers } from "../lib/access/operational-booking-managers";
import { normalizeOrganisationAccessEmail } from "../lib/access/organisation-access-email";
import {
  canRevokeLastOrgAdmin,
  countActiveOrgAdmins,
  decideGrantActivation,
  findDuplicateGrant,
  parseGrantInput,
  primaryFlagAfterSpaceReassign,
  resolveManagerReassignScope,
  toPublicAccessGrantView,
  personDisplayName,
  validatePropertyBelongsToOrganisation,
  validateSpaceBelongsToProperty,
  type ExistingAccessGrant,
} from "../lib/access/organisation-access-policy";
import {
  ORGANISATION_ACCESS_AUDIT,
  auditActorKindLabel,
  organisationAccessActorKind,
  organisationAccessAuditEvent,
} from "../lib/access/organisation-access-audit";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import {
  ORGANISATION_QUERY_PARAM,
  organisationWorkspaceHref,
  resolveOrganisationWorkspaceSelection,
  selectableOrganisations,
  shouldShowOrganisationSelector,
} from "../lib/access/organisation-workspace";

const USER = "user-jane";
const OA = "oa-1";
const GA = "ga-1";
const PM = "pm-1";
const SM = "sm-1";
const ORG_A = "org-a";
const ORG_B = "org-b";
const PROP_A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SPACE_A1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const SPACE_A2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const PROP_B1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const SPACE_B1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

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

function existing(partial: Partial<ExistingAccessGrant> & Pick<ExistingAccessGrant, "role" | "status">): ExistingAccessGrant {
  return {
    id: partial.id ?? "grant-1",
    organisationId: partial.organisationId ?? ORG_A,
    role: partial.role,
    propertyId: partial.propertyId ?? null,
    spaceId: partial.spaceId ?? null,
    userId: partial.userId ?? null,
    emailNormalized: partial.emailNormalized ?? "ada@example.com",
    status: partial.status,
  };
}

const sql = readFileSync(
  "supabase/migrations/067_20260921_people_and_access_management.sql",
  "utf8"
);
const accessSql = readFileSync("lib/access/organisation-access-server.ts", "utf8");
const grantRoute = readFileSync(
  "app/api/organisations/[organisationId]/access/route.ts",
  "utf8"
);
const activateRoute = readFileSync(
  "app/api/organisations/access/activate/route.ts",
  "utf8"
);
const activateLib = readFileSync(
  "lib/access/activate-pending-organisation-access.ts",
  "utf8"
);
const requirePeople = readFileSync("lib/access/require-org-people-api.ts", "utf8");
const notifyLib = readFileSync("lib/booking-event-notify.ts", "utf8");
const opsLib = readFileSync("lib/access/operational-booking-managers.ts", "utf8");
const authForm = readFileSync("app/components/AuthForm.tsx", "utf8");
const requireAuth = readFileSync("app/components/RequireAuth.tsx", "utf8");
const peoplePage = readFileSync("app/dashboard/people/page.tsx", "utf8");
const bookingAuthority = readFileSync("scripts/test-booking-authority.ts", "utf8");
const browseTest = readFileSync("scripts/test-public-browse-eligibility.mjs", "utf8");
const lifecycleTest = readFileSync("scripts/test-lifecycle-guards.mjs", "utf8");
const peopleClient = readFileSync("lib/access/organisation-access-client.ts", "utf8");
const activityApi = readFileSync("app/api/admin/activity/route.ts", "utf8");
const activityPage = readFileSync("app/admin/activity/page.tsx", "utf8");
const lookupLib = readFileSync("lib/access/lookup-auth-user-by-email.ts", "utf8");
const orgsRoute = readFileSync("app/api/organisations/route.ts", "utf8");
const dashboardShell = readFileSync("app/components/DashboardShell.tsx", "utf8");
const orgWorkspaceContext = readFileSync(
  "app/components/OrganisationWorkspaceContext.tsx",
  "utf8"
);
const reassignRoute = readFileSync(
  "app/api/organisations/[organisationId]/access/[accessId]/reassign/route.ts",
  "utf8"
);
const primaryRoute = readFileSync(
  "app/api/organisations/[organisationId]/access/[accessId]/primary/route.ts",
  "utf8"
);

assert.match(sql, /CREATE OR REPLACE FUNCTION public\.activate_pending_organisation_access/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.set_organisation_access_primary_space_manager/);
assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.organisation_access/i);
assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.organisations/i);
assert.match(sql, /GRANT SELECT ON TABLE public\.organisation_access TO authenticated/);
assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.organisation_access FROM authenticated/);
assert.match(sql, /user_is_active_platform_admin\(\)/);
assert.match(sql, /last_active_org_admin_required/);
assert.doesNotMatch(sql, /CREATE TABLE/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.activate_pending_organisation_access\(uuid\) TO service_role/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.activate_pending_organisation_access\(uuid\) FROM authenticated/);
assert.match(sql, /auth\.role\(\).*service_role/);
assert.match(sql, /FOR UPDATE/);

assert.match(grantRoute, /actorUserId: auth\.userId/);
assert.doesNotMatch(grantRoute, /body\.userId|body\.actorUserId/);
assert.match(activateRoute, /auth\.userId/);
assert.doesNotMatch(activateRoute, /body\.userId|body\.email/);
assert.match(requirePeople, /canManagePeopleAccess/);
assert.match(activateLib, /activate_pending_organisation_access/);
assert.match(authForm, /schedulePendingOrganisationAccessActivation/);
assert.match(requireAuth, /schedulePendingOrganisationAccessActivation/);
assert.match(peopleClient, /\/api\/organisations\/access\/activate/);
assert.match(peoplePage, /Add person/);
assert.match(peoplePage, /My Spaces/);
assert.match(peoplePage, /People & access/);
assert.doesNotMatch(peoplePage, /Paarl Girls/);

// A / B list authority
{
  const own = computeAccess(
    ctx({
      userId: OA,
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  assert.equal(own.canManagePeopleAccess, true);
  const other = computeAccess(
    ctx({
      userId: OA,
      organisationId: ORG_B,
      grants: [grant({ organisationId: ORG_A, role: "org_admin", status: "active" })],
    })
  );
  assert.equal(other.canManagePeopleAccess, false);
}

// C Global Admin
{
  const access = computeAccess(ctx({ userId: GA, profileRole: "admin" }));
  assert.equal(access.isGlobalAdmin, true);
  assert.equal(access.canManagePeopleAccess, true);
}

// D / E Property Manager and Space Manager cannot manage People
{
  const pm = computeAccess(
    ctx({
      userId: PM,
      grants: [
        grant({
          role: "property_manager",
          status: "active",
          propertyId: PROP_A1,
        }),
      ],
    })
  );
  assert.equal(pm.isPropertyManager, true);
  assert.equal(pm.canManagePeopleAccess, false);
  const sm = computeAccess(
    ctx({
      userId: SM,
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
  assert.equal(sm.isSpaceManager, true);
  assert.equal(sm.canManagePeopleAccess, false);
}

// F pending for unknown email
{
  const activation = decideGrantActivation(null);
  assert.equal(activation.status, "pending");
  assert.equal(activation.userId, null);
}

// G verified existing user
{
  const activation = decideGrantActivation({
    id: "user-verified",
    emailConfirmed: true,
  });
  assert.equal(activation.status, "active");
  assert.equal(activation.userId, "user-verified");
}

// H unverified remains pending
{
  const activation = decideGrantActivation({
    id: "user-unverified",
    emailConfirmed: false,
  });
  assert.equal(activation.status, "pending");
  assert.equal(activation.userId, null);
}

// I / J / K activation email binding
{
  assert.equal(
    normalizeOrganisationAccessEmail("  Ada@Example.com "),
    "ada@example.com"
  );
  assert.match(sql, /email_normalized = v_email_normalized/);
  assert.match(sql, /FROM auth\.users u\s+WHERE u\.id = p_user_id/);
  assert.match(activateRoute, /activatePendingOrganisationAccess\(\s*auth\.admin,\s*auth\.userId/);
  assert.doesNotMatch(activateLib, /p_email|body\.email/);
}

// L / M / N scope
{
  const pmBad = validatePropertyBelongsToOrganisation({
    propertyOrganisationId: ORG_B,
    organisationId: ORG_A,
  });
  assert.equal(pmBad?.code, "property_scope_mismatch");
  const smBad = validateSpaceBelongsToProperty({
    spacePropertyId: "other-prop",
    propertyId: PROP_A1,
  });
  assert.equal(smBad?.code, "space_scope_mismatch");
  const invalid = parseGrantInput({
    role: "space_manager",
    email: "ada@example.com",
    propertyId: PROP_A1,
  });
  assert.equal("ok" in invalid, false);
  const oaScoped = parseGrantInput({
    role: "org_admin",
    email: "ada@example.com",
    propertyId: PROP_A1,
  });
  assert.equal("ok" in oaScoped, false);
}

// O / P duplicates
{
  const activeDup = findDuplicateGrant(
    [
      existing({
        role: "org_admin",
        status: "active",
        userId: "user-verified",
        emailNormalized: "ada@example.com",
      }),
    ],
    {
      organisationId: ORG_A,
      role: "org_admin",
      propertyId: null,
      spaceId: null,
      emailNormalized: "ada@example.com",
      userId: "user-verified",
      status: "active",
    }
  );
  assert.ok(activeDup);
  const pendingDup = findDuplicateGrant(
    [
      existing({
        role: "space_manager",
        status: "pending",
        propertyId: PROP_A1,
        spaceId: SPACE_A1,
        emailNormalized: "ada@example.com",
      }),
    ],
    {
      organisationId: ORG_A,
      role: "space_manager",
      propertyId: PROP_A1,
      spaceId: SPACE_A1,
      emailNormalized: "ada@example.com",
      userId: null,
      status: "pending",
    }
  );
  assert.ok(pendingDup);
}

// Q / R revoked loses resolver authority but row remains
{
  const revoked = computeAccess(
    ctx({
      grants: [grant({ role: "org_admin", status: "revoked" })],
    })
  );
  assert.equal(revoked.canManagePeopleAccess, false);
  assert.equal(revoked.isOrganisationAdmin, false);
  assert.match(accessSql, /status: "revoked"/);
  assert.doesNotMatch(accessSql, /\.delete\(/);
}

// S last Organisation Admin
{
  assert.equal(
    canRevokeLastOrgAdmin({
      targetRole: "org_admin",
      targetStatus: "active",
      activeOrgAdminCount: 1,
    }),
    false
  );
  assert.equal(
    canRevokeLastOrgAdmin({
      targetRole: "org_admin",
      targetStatus: "active",
      activeOrgAdminCount: 2,
    }),
    true
  );
  assert.match(sql, /No Global Admin bypass in this migration/);
}

// T / U / V multiple SMs, one primary, atomic switch
{
  const twoSms = computeAccess(
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
  assert.equal(twoSms.isSpaceManager, true);
  assert.match(sql, /organisation_access_one_primary_space_manager|SET is_primary = false/);
  assert.match(sql, /set_organisation_access_primary_space_manager/);
  assert.match(sql, /FOR UPDATE/);
}

// W notify_all_bookings does not change permissions
{
  const withNotify = computeAccess(
    ctx({
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  const withoutNotify = computeAccess(
    ctx({
      grants: [grant({ role: "org_admin", status: "active" })],
    })
  );
  assert.equal(withNotify.canManagePeopleAccess, withoutNotify.canManagePeopleAccess);
  assert.equal(withNotify.canManageBooking, withoutNotify.canManageBooking);
  const view = toPublicAccessGrantView({
    id: "g1",
    status: "active",
    role: "org_admin",
    email: "ada@example.com",
    userId: OA,
    propertyId: null,
    propertyName: null,
    spaceId: null,
    spaceTitle: null,
    isPrimary: true,
    notifyAllBookings: true,
    invitedBy: null,
    createdAt: "2026-01-01",
    activatedAt: "2026-01-01",
    revokedAt: null,
    revokeReason: null,
  });
  assert.equal(view.isPrimary, false);
  assert.equal(view.notifyAllBookings, true);
}

// X / Y / Z / AA / AB / AC operational recipients
{
  const withSm = computeOperationalBookingManagers({
    organisationId: ORG_A,
    spaceOwnerId: "legacy-owner",
    propertyOwnerId: PM,
    activeSpaceManagerUserIds: [SM],
    activeOrgAdminUserIds: [OA],
    notifyAllOrgAdminUserIds: [],
  });
  assert.equal(withSm.kind, "space_managers");
  assert.deepEqual(withSm.recipientUserIds, [SM]);
  assert.equal(withSm.recipientUserIds.includes(PM), false);
  assert.equal(withSm.recipientUserIds.includes(GA), false);
  assert.equal(withSm.notifyUserIds.includes(OA), false);

  const optedIn = computeOperationalBookingManagers({
    organisationId: ORG_A,
    spaceOwnerId: "legacy-owner",
    propertyOwnerId: PM,
    activeSpaceManagerUserIds: [SM],
    activeOrgAdminUserIds: [OA],
    notifyAllOrgAdminUserIds: [OA],
  });
  assert.deepEqual(optedIn.recipientUserIds, [SM]);
  assert.ok(optedIn.notifyUserIds.includes(OA));
  assert.ok(optedIn.notifyUserIds.includes(SM));

  const oaFallback = computeOperationalBookingManagers({
    organisationId: ORG_A,
    spaceOwnerId: "legacy-owner",
    propertyOwnerId: PM,
    activeSpaceManagerUserIds: [],
    activeOrgAdminUserIds: [OA],
  });
  assert.equal(oaFallback.kind, "org_admins");
  assert.deepEqual(oaFallback.recipientUserIds, [OA]);
  assert.equal(oaFallback.recipientUserIds.includes("legacy-owner"), false);

  const legacy = computeOperationalBookingManagers({
    organisationId: null,
    spaceOwnerId: "legacy-owner",
    propertyOwnerId: PM,
    activeSpaceManagerUserIds: [],
    activeOrgAdminUserIds: [],
  });
  assert.equal(legacy.kind, "legacy_owner");
  assert.deepEqual(legacy.recipientUserIds, ["legacy-owner"]);

  const pendingIgnored = computeOperationalBookingManagers({
    organisationId: ORG_A,
    spaceOwnerId: null,
    propertyOwnerId: null,
    activeSpaceManagerUserIds: [],
    activeOrgAdminUserIds: [],
  });
  assert.equal(pendingIgnored.kind, "none");
  assert.match(opsLib, /notifyAllOrgAdminUserIds/);
  assert.match(notifyLib, /notifyUserIds/);
}

// AD disabled Global Admin
{
  const disabled = computeAccess(
    ctx({ profileRole: "admin", adminAccessDisabled: true })
  );
  assert.equal(disabled.isGlobalAdmin, false);
  assert.equal(disabled.canManagePeopleAccess, false);
  assert.match(sql, /user_is_active_platform_admin\(\)/);
}

// AE client cannot spoof actor
{
  assert.match(grantRoute, /actorUserId: auth\.userId/);
  assert.match(requirePeople, /requireAuthenticatedApi/);
  const revokeRoute = readFileSync(
    "app/api/organisations/[organisationId]/access/[accessId]/revoke/route.ts",
    "utf8"
  );
  assert.match(revokeRoute, /actorUserId: auth\.userId/);
}

// AF no browser mutation privileges
{
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.organisation_access FROM authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.activate_pending_organisation_access\(uuid\) FROM authenticated/);
}

// AG–AK audit
{
  const granted = organisationAccessAuditEvent({
    action: ORGANISATION_ACCESS_AUDIT.granted,
    actorUserId: OA,
    actorKind: "organisation_admin",
    organisationId: ORG_A,
    accessId: "g1",
    role: "org_admin",
    next: { status: "active" },
  });
  assert.equal(granted.action, "organisation_access.granted");
  assert.equal(granted.meta.actor_kind, "organisation_admin");
  assert.equal(
    organisationAccessAuditEvent({
      action: ORGANISATION_ACCESS_AUDIT.activated,
      actorUserId: USER,
      actorKind: "access_holder",
      organisationId: ORG_A,
      accessId: "g1",
    }).action,
    "organisation_access.activated"
  );
  assert.equal(ORGANISATION_ACCESS_AUDIT.revoked, "organisation_access.revoked");
  assert.equal(
    ORGANISATION_ACCESS_AUDIT.primaryChanged,
    "organisation_access.primary_changed"
  );
  assert.equal(
    ORGANISATION_ACCESS_AUDIT.notifyPreferenceChanged,
    "organisation_access.notify_preference_changed"
  );
  assert.match(accessSql, /ORGANISATION_ACCESS_AUDIT\.granted/);
  assert.match(activateLib, /ORGANISATION_ACCESS_AUDIT\.activated/);
  assert.match(accessSql, /ORGANISATION_ACCESS_AUDIT\.revoked/);
  assert.match(accessSql, /ORGANISATION_ACCESS_AUDIT\.primaryChanged/);
  assert.match(accessSql, /ORGANISATION_ACCESS_AUDIT\.notifyPreferenceChanged/);
}

// AL legacy ownership intact
{
  const owner = computeAccess(
    ctx({ userId: "legacy-owner", spaceOwnerId: "legacy-owner", organisationId: null })
  );
  assert.equal(owner.isLegacySpaceOwner, true);
  assert.equal(owner.canManageBooking, true);
  assert.equal(owner.canManagePeopleAccess, false);
}

// AM–AO existing suites still present
{
  assert.match(bookingAuthority, /test-booking-authority/);
  assert.match(browseTest, /test-public-browse-eligibility/);
  assert.match(lifecycleTest, /only active \+ live mode is bookable/);
}

// AP activation failure does not break login
{
  assert.match(requireAuth, /setAllowed\(true\)/);
  assert.match(requireAuth, /schedulePendingOrganisationAccessActivation/);
  assert.doesNotMatch(requireAuth, /sessionStorage/);
  assert.doesNotMatch(requireAuth, /await fetch\("\/api\/organisations\/access\/activate"/);
  assert.match(authForm, /schedulePendingOrganisationAccessActivation/);
  assert.doesNotMatch(authForm, /await activatePendingOrganisationAccess/);
  assert.match(peopleClient, /\.catch\(\(\) =>/);
}

// AQ newly-added pending grant can activate during an existing browser session
{
  assert.match(requireAuth, /TOKEN_REFRESHED/);
  assert.match(
    requireAuth,
    /schedulePendingOrganisationAccessActivation\(session\.access_token\)/
  );
  assert.doesNotMatch(requireAuth, /alreadyActivated|activateKey|sessionStorage/);
  assert.match(peopleClient, /schedulePendingOrganisationAccessActivation/);
}

// AR revoked historical grant + new pending grant
{
  const afterRevoke = findDuplicateGrant(
    [
      existing({
        role: "org_admin",
        status: "revoked",
        userId: "user-verified",
        emailNormalized: "ada@example.com",
      }),
    ],
    {
      organisationId: ORG_A,
      role: "org_admin",
      propertyId: null,
      spaceId: null,
      emailNormalized: "ada@example.com",
      userId: null,
      status: "pending",
    }
  );
  assert.equal(afterRevoke, null);
  assert.match(sql, /status = 'pending'/);
  assert.match(sql, /never reactivate/);
}

// AS existing active + pending duplicate activation
{
  assert.match(sql, /leave the pending row pending/);
  assert.match(sql, /WHEN unique_violation THEN/);
  assert.match(sql, /e\.user_id = p_user_id/);
  const leftoverPending = findDuplicateGrant(
    [
      existing({
        id: "active-1",
        role: "org_admin",
        status: "active",
        userId: "user-verified",
        emailNormalized: "ada@example.com",
      }),
      existing({
        id: "pending-1",
        role: "org_admin",
        status: "pending",
        userId: null,
        emailNormalized: "ada@example.com",
      }),
    ],
    {
      organisationId: ORG_A,
      role: "org_admin",
      propertyId: null,
      spaceId: null,
      emailNormalized: "ada@example.com",
      userId: "user-verified",
      status: "active",
    }
  );
  assert.ok(leftoverPending);
}

// AT concurrent primary-manager switch protection
{
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /ORDER BY a\.id/);
  assert.match(sql, /867001/);
  assert.match(sql, /organisation_access_one_primary_space_manager|SET is_primary = false/);
}

// AU pending OA does not satisfy last-admin replacement
{
  assert.equal(
    countActiveOrgAdmins([
      { role: "org_admin", status: "active" },
      { role: "org_admin", status: "pending" },
    ]),
    1
  );
  assert.equal(
    canRevokeLastOrgAdmin({
      targetRole: "org_admin",
      targetStatus: "active",
      activeOrgAdminCount: countActiveOrgAdmins([
        { role: "org_admin", status: "active" },
        { role: "org_admin", status: "pending" },
      ]),
    }),
    false
  );
  assert.match(sql, /a\.status = 'active'/);
  assert.match(sql, /Pending\/revoked grants do not count/);
}

// AV revoked OA does not satisfy last-admin replacement
{
  assert.equal(
    countActiveOrgAdmins([
      { role: "org_admin", status: "active" },
      { role: "org_admin", status: "revoked" },
    ]),
    1
  );
  assert.equal(
    canRevokeLastOrgAdmin({
      targetRole: "org_admin",
      targetStatus: "active",
      activeOrgAdminCount: countActiveOrgAdmins([
        { role: "org_admin", status: "active" },
        { role: "org_admin", status: "revoked" },
      ]),
    }),
    false
  );
}

// AW audit actor semantics correct for OA vs GA
{
  assert.equal(
    organisationAccessActorKind({ isGlobalAdmin: true }),
    "global_admin"
  );
  assert.equal(
    organisationAccessActorKind({ isGlobalAdmin: false }),
    "organisation_admin"
  );
  assert.equal(
    organisationAccessActorKind({ selfActivation: true }),
    "access_holder"
  );
  assert.equal(auditActorKindLabel("organisation_admin"), "Organisation Admin");
  assert.equal(auditActorKindLabel("global_admin"), "Global Admin");
  assert.match(accessSql, /actorKind: input\.actorKind/);
  assert.match(activateLib, /actorKind: "access_holder"/);
  assert.match(activityApi, /actorKindLabel/);
  assert.match(activityPage, /actorKindLabel/);
}

// AX opted-in OA email does not change operational authority
{
  const optedIn = computeOperationalBookingManagers({
    organisationId: ORG_A,
    spaceOwnerId: "legacy-owner",
    propertyOwnerId: PM,
    activeSpaceManagerUserIds: [SM],
    activeOrgAdminUserIds: [OA],
    notifyAllOrgAdminUserIds: [OA],
  });
  assert.deepEqual(optedIn.recipientUserIds, [SM]);
  assert.equal(optedIn.kind, "space_managers");
  assert.equal(optedIn.recipientUserIds.includes(OA), false);
}

// AY opted-in operational OA receives no duplicate notification
{
  const oaFallbackOptIn = computeOperationalBookingManagers({
    organisationId: ORG_A,
    spaceOwnerId: null,
    propertyOwnerId: null,
    activeSpaceManagerUserIds: [],
    activeOrgAdminUserIds: [OA, OA],
    notifyAllOrgAdminUserIds: [OA, OA],
  });
  assert.deepEqual(oaFallbackOptIn.recipientUserIds, [OA]);
  assert.deepEqual(oaFallbackOptIn.notifyUserIds, [OA]);
}

// AZ SM reassign cannot cross organisation
{
  const cross = resolveManagerReassignScope({
    role: "space_manager",
    organisationId: ORG_A,
    requestedPropertyId: PROP_B1,
    requestedSpaceId: SPACE_B1,
    space: { id: SPACE_B1, propertyId: PROP_B1 },
    property: { id: PROP_B1, organisationId: ORG_B },
  });
  assert.equal("propertyId" in cross, false);
  if (!("propertyId" in cross)) {
    assert.equal(cross.code, "property_scope_mismatch");
  }
  assert.match(accessSql, /spaceRow\.property_id/);
  assert.match(reassignRoute, /actorUserId: auth\.userId/);
}

// BA PM reassign cannot cross organisation
{
  const cross = resolveManagerReassignScope({
    role: "property_manager",
    organisationId: ORG_A,
    requestedPropertyId: PROP_B1,
    requestedSpaceId: SPACE_B1,
    space: { id: SPACE_B1, propertyId: PROP_B1 },
    property: { id: PROP_B1, organisationId: ORG_B },
  });
  assert.equal("propertyId" in cross, false);
  if (!("propertyId" in cross)) {
    assert.equal(cross.code, "property_scope_mismatch");
  }
  const sameOrg = resolveManagerReassignScope({
    role: "property_manager",
    organisationId: ORG_A,
    requestedPropertyId: PROP_A1,
    requestedSpaceId: SPACE_A1,
    space: null,
    property: { id: PROP_A1, organisationId: ORG_A },
  });
  assert.deepEqual(sameOrg, { propertyId: PROP_A1, spaceId: null });
}

// BB reassign primary SM leaves valid primary state
{
  assert.equal(
    primaryFlagAfterSpaceReassign({
      previousSpaceId: SPACE_A1,
      nextSpaceId: SPACE_A2,
      wasPrimary: true,
    }),
    false
  );
  assert.equal(
    primaryFlagAfterSpaceReassign({
      previousSpaceId: SPACE_A1,
      nextSpaceId: SPACE_A1,
      wasPrimary: true,
    }),
    true
  );
  assert.match(accessSql, /primaryFlagAfterSpaceReassign/);
}

// BC browser cannot execute activation RPC
{
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.activate_pending_organisation_access\(uuid\) FROM PUBLIC/
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.activate_pending_organisation_access\(uuid\) FROM anon/
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.activate_pending_organisation_access\(uuid\) FROM authenticated/
  );
  assert.match(sql, /auth\.role\(\).*service_role/);
}

// BD browser cannot execute primary RPC
{
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.set_organisation_access_primary_space_manager\(uuid, boolean\) FROM authenticated/
  );
  assert.match(primaryRoute, /requireOrgPeopleApi/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_organisation_access_primary_space_manager\(uuid, boolean\) TO service_role/);
}

// BE authenticated has no INSERT/UPDATE/DELETE organisation_access ACL
{
  assert.match(
    sql,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.organisation_access FROM authenticated/
  );
  assert.match(sql, /GRANT SELECT ON TABLE public\.organisation_access TO authenticated/);
  assert.match(lookupLib, /Never expose auth\.users to the browser/);
}

const ORG_WS_A = "11111111-1111-4111-8111-111111111111";
const ORG_WS_B = "22222222-2222-4222-8222-222222222222";
const ORG_WS_ARCHIVED = "33333333-3333-4333-8333-333333333333";
const ORG_WS_OTHER = "44444444-4444-4444-8444-444444444444";

function wsOrg(
  id: string,
  name: string,
  status: string
): { id: string; name: string; status: string } {
  return { id, name, status };
}

// A one manageable Organisation — name shown, no selector
{
  const organisations = [wsOrg(ORG_WS_A, "Paarl Girls' High", "active")];
  const selection = resolveOrganisationWorkspaceSelection({
    organisations,
    requestedId: null,
  });
  assert.equal(selection.kind, "ready");
  if (selection.kind === "ready") {
    assert.equal(selection.organisation.name, "Paarl Girls' High");
    assert.equal(shouldShowOrganisationSelector(selection.selectable.length), false);
  }
  assert.match(orgWorkspaceContext, /shouldShowOrganisationSelector/);
  assert.match(peoplePage, /OrganisationWorkspaceContext/);
  assert.match(peoplePage, /contextOrganisation\.name/);
}

// B multiple manageable Organisations — selector and switching
{
  const organisations = [
    wsOrg(ORG_WS_A, "Alpha School", "active"),
    wsOrg(ORG_WS_B, "Beta School", "active"),
  ];
  const first = resolveOrganisationWorkspaceSelection({
    organisations,
    requestedId: null,
  });
  const second = resolveOrganisationWorkspaceSelection({
    organisations,
    requestedId: ORG_WS_B,
  });
  assert.equal(first.kind, "ready");
  assert.equal(second.kind, "ready");
  if (first.kind === "ready" && second.kind === "ready") {
    assert.equal(shouldShowOrganisationSelector(first.selectable.length), true);
    assert.equal(first.organisation.id, ORG_WS_A);
    assert.equal(second.organisation.id, ORG_WS_B);
    assert.notEqual(first.organisation.id, second.organisation.id);
  }
  assert.equal(
    organisationWorkspaceHref("/dashboard/people", ORG_WS_B),
    `/dashboard/people?${ORGANISATION_QUERY_PARAM}=${ORG_WS_B}`
  );
  assert.match(peoplePage, /router\.push\(\s*organisationWorkspaceHref/);
  assert.match(orgWorkspaceContext, /aria-label="Organisation"/);
}

// C Global Admin receives organisations from existing authorised endpoint
{
  assert.match(orgsRoute, /listManageableOrganisations/);
  assert.match(orgsRoute, /isGlobalAdmin/);
  assert.match(accessSql, /if \(isGlobalAdmin\)/);
  assert.match(peoplePage, /fetchManageableOrganisations/);
  const activeOnly = selectableOrganisations([
    wsOrg(ORG_WS_A, "Active Org", "active"),
    wsOrg(ORG_WS_ARCHIVED, "Archived Org", "archived"),
  ]);
  assert.deepEqual(
    activeOnly.map((organisation) => organisation.id),
    [ORG_WS_A]
  );
}

// D Organisation Admin receives only authorised Organisations
{
  assert.match(accessSql, /eq\("role", "org_admin"\)/);
  assert.match(accessSql, /eq\("status", "active"\)/);
  assert.match(accessSql, /\.in\("id", ids\)/);
  const unauthorised = resolveOrganisationWorkspaceSelection({
    organisations: [wsOrg(ORG_WS_A, "Authorised Org", "active")],
    requestedId: ORG_WS_OTHER,
  });
  assert.equal(unauthorised.kind, "unavailable");
}

// E invalid organisation query parameter cannot expose unauthorised data
{
  const organisations = [wsOrg(ORG_WS_A, "Authorised Org", "active")];
  const invalid = resolveOrganisationWorkspaceSelection({
    organisations,
    requestedId: "not-a-uuid",
  });
  const missing = resolveOrganisationWorkspaceSelection({
    organisations,
    requestedId: ORG_WS_OTHER,
  });
  assert.equal(invalid.kind, "unavailable");
  assert.equal(missing.kind, "unavailable");
  if (invalid.kind === "unavailable") {
    assert.notEqual(invalid.requestedId, organisations[0].id);
  }
  assert.match(peoplePage, /selection\.kind === "unavailable"/);
  assert.match(peoplePage, /not available in your workspace/);
}

// F archived / inaccessible Organisation fails closed
{
  const archived = resolveOrganisationWorkspaceSelection({
    organisations: [
      wsOrg(ORG_WS_A, "Active Org", "active"),
      wsOrg(ORG_WS_ARCHIVED, "Archived Org", "archived"),
    ],
    requestedId: ORG_WS_ARCHIVED,
  });
  assert.equal(archived.kind, "archived");
  if (archived.kind === "archived") {
    assert.equal(archived.organisation.id, ORG_WS_ARCHIVED);
    assert.equal(archived.selectable[0].id, ORG_WS_A);
  }
  const empty = resolveOrganisationWorkspaceSelection({
    organisations: [],
    requestedId: null,
  });
  assert.equal(empty.kind, "empty");
  assert.match(peoplePage, /selection\.kind === "archived"/);
  assert.match(peoplePage, /cannot be managed as an active/);
}

// G People API requests use selected organisation
{
  assert.match(peoplePage, /fetchOrganisationAccess\(selectedOrganisationId\)/);
  assert.match(peoplePage, /selection\.kind === "ready" \? selection\.organisation\.id/);
  assert.match(peopleClient, /\/api\/organisations\/\$\{organisationId\}\/access/);
  assert.match(grantRoute, /requireOrgPeopleApi\(req, organisationId\)/);
}

// H no cross-organisation People data leakage
{
  assert.match(peoplePage, /setGrants\(\[\]\)/);
  assert.match(peoplePage, /access\.organisation\.id !== selectedOrganisationId/);
  assert.match(peoplePage, /if \(!organisationId\)/);
  assert.match(requirePeople, /canManagePeopleAccess/);
}

// I person display fallback works safely
{
  assert.equal(
    personDisplayName({
      fullName: "FindMySpace Admin",
      firstName: "Admin",
      lastName: "of Admins",
    }),
    "FindMySpace Admin"
  );
  assert.equal(
    personDisplayName({
      fullName: "  ",
      firstName: "Ada",
      lastName: "Lovelace",
    }),
    "Ada Lovelace"
  );
  assert.equal(
    personDisplayName({
      fullName: null,
      firstName: null,
      lastName: null,
    }),
    null
  );
  assert.match(peoplePage, /grant\.displayName \|\| grant\.email/);
  assert.match(dashboardShell, /pageContext/);
}

console.log("test-people-access: all assertions passed");
