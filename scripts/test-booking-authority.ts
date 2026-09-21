#!/usr/bin/env node
/**
 * Organisation booking authority (066) — pure helpers + source contracts.
 * Does not apply migrations or write production data.
 * Run: npm run test:booking-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeOperationalBookingManagers,
  snapshotBookingOwnership,
} from "../lib/access/operational-booking-managers";
import {
  AUTO_DECLINE_OVERLAP_MESSAGE,
  buildHostResponsePatch,
  buildOverlapAutoDeclinePatch,
  STALE_HOST_RESPONSE_MESSAGE,
} from "../lib/booking-host-response";
import { canHostRespondToStatus } from "../lib/booking-range-overlap";
import { validateBookingForPayFastInitiate } from "../lib/payfast-initiate-shared";
import { computeAccess } from "../lib/access/compute-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import { bookingAllowsManualMvpPayment } from "../lib/manual-mvp-payment";
import { isLegacyOwnerSelfBooking } from "../lib/booking-self-booking";
import { canRenterCancelStatus } from "../lib/booking-renter-cancel";

const SPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PROP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const ORG = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const ORG_B = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const OWNER = "11111111-1111-4111-8111-111111111111";
const RENTER = "22222222-2222-4222-8222-222222222222";
const SM = "33333333-3333-4333-8333-333333333333";
const SM_SIBLING = "44444444-4444-4444-8444-444444444444";
const OA = "55555555-5555-4555-8555-555555555555";
const PM = "66666666-6666-4666-8666-666666666666";
const GA = "77777777-7777-4777-8777-777777777777";
const STRANGER = "88888888-8888-4888-8888-888888888888";

function ctx(partial: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: STRANGER,
    spaceId: SPACE,
    propertyId: PROP,
    organisationId: ORG,
    spaceOwnerId: null,
    propertyOwnerId: null,
    profileRole: null,
    adminAccessDisabled: false,
    grants: [],
    ...partial,
  };
}

function grant(
  partial: Partial<OrganisationAccessGrant> & Pick<OrganisationAccessGrant, "role">
): OrganisationAccessGrant {
  return {
    organisationId: ORG,
    propertyId: null,
    spaceId: null,
    status: "active",
    ...partial,
  };
}

// A/B legacy snapshot
{
  const snap = snapshotBookingOwnership({
    spaceOwnerId: OWNER,
    organisationId: null,
  });
  assert.equal(snap.ownerId, OWNER);
  assert.equal(snap.organisationId, null);
}

// E/F/G org snapshot — never stamp a manager into owner_id
{
  const snap = snapshotBookingOwnership({
    spaceOwnerId: null,
    organisationId: ORG,
  });
  assert.equal(snap.ownerId, null);
  assert.equal(snap.organisationId, ORG);
}

{
  const withLegacy = snapshotBookingOwnership({
    spaceOwnerId: OWNER,
    organisationId: ORG,
  });
  assert.equal(withLegacy.ownerId, OWNER);
  assert.equal(withLegacy.organisationId, ORG);
}

// Q/R client ids are not used by snapshot helper
{
  const snap = snapshotBookingOwnership({
    spaceOwnerId: null,
    organisationId: ORG,
  });
  assert.notEqual(snap.organisationId, "spoofed");
  assert.equal(snap.ownerId, null);
}

// M / N operational managers
{
  const withSm = computeOperationalBookingManagers({
    organisationId: ORG,
    spaceOwnerId: null,
    propertyOwnerId: null,
    activeSpaceManagerUserIds: [SM],
    activeOrgAdminUserIds: [OA],
  });
  assert.equal(withSm.kind, "space_managers");
  assert.deepEqual(withSm.recipientUserIds, [SM]);
  assert.equal(withSm.canAcceptPublicBooking, true);
}

{
  const duplicates = computeOperationalBookingManagers({
    organisationId: ORG,
    spaceOwnerId: OWNER,
    propertyOwnerId: null,
    activeSpaceManagerUserIds: [SM, SM, SM_SIBLING],
    activeOrgAdminUserIds: [OA],
  });
  assert.equal(duplicates.kind, "space_managers");
  assert.deepEqual(duplicates.recipientUserIds, [SM, SM_SIBLING]);
  assert.equal(duplicates.recipientUserIds.includes(OWNER), false);
  assert.equal(duplicates.recipientUserIds.includes(OA), false);
}

{
  const orgAdminsNotOwner = computeOperationalBookingManagers({
    organisationId: ORG,
    spaceOwnerId: OWNER,
    propertyOwnerId: PM,
    activeSpaceManagerUserIds: [],
    activeOrgAdminUserIds: [OA, OA],
  });
  assert.equal(orgAdminsNotOwner.kind, "org_admins");
  assert.deepEqual(orgAdminsNotOwner.recipientUserIds, [OA]);
  assert.equal(orgAdminsNotOwner.recipientUserIds.includes(OWNER), false);
  assert.equal(orgAdminsNotOwner.recipientUserIds.includes(PM), false);
}

{
  const fallback = computeOperationalBookingManagers({
    organisationId: ORG,
    spaceOwnerId: null,
    propertyOwnerId: null,
    activeSpaceManagerUserIds: [],
    activeOrgAdminUserIds: [OA],
  });
  assert.equal(fallback.kind, "org_admins");
  assert.deepEqual(fallback.recipientUserIds, [OA]);
  assert.equal(fallback.canAcceptPublicBooking, true);
}

{
  const none = computeOperationalBookingManagers({
    organisationId: ORG,
    spaceOwnerId: null,
    propertyOwnerId: PM,
    activeSpaceManagerUserIds: [],
    activeOrgAdminUserIds: [],
  });
  assert.equal(none.kind, "none");
  assert.equal(none.canAcceptPublicBooking, false);
}

{
  const legacy = computeOperationalBookingManagers({
    organisationId: null,
    spaceOwnerId: OWNER,
    propertyOwnerId: null,
    activeSpaceManagerUserIds: [],
    activeOrgAdminUserIds: [],
  });
  assert.equal(legacy.kind, "legacy_owner");
  assert.deepEqual(legacy.recipientUserIds, [OWNER]);
}

// C/H/J/K/L/O/P/S/T/U access matrix for approve
{
  assert.equal(
    computeAccess(ctx({ userId: OWNER, spaceOwnerId: OWNER })).canManageBooking,
    true
  );
  assert.equal(
    computeAccess(
      ctx({
        userId: SM,
        grants: [grant({ role: "space_manager", propertyId: PROP, spaceId: SPACE })],
      })
    ).canManageBooking,
    true
  );
  const sibling = computeAccess(
    ctx({
      userId: SM_SIBLING,
      spaceId: "99999999-9999-4999-8999-999999999999",
      grants: [grant({ role: "space_manager", propertyId: PROP, spaceId: SPACE })],
    })
  );
  assert.equal(sibling.canManageBooking, false);
  assert.equal(
    computeAccess(
      ctx({ userId: OA, grants: [grant({ role: "org_admin" })] })
    ).canManageBooking,
    true
  );
  assert.equal(
    computeAccess(
      ctx({
        userId: PM,
        grants: [grant({ role: "property_manager", propertyId: PROP })],
      })
    ).canManageBooking,
    true
  );
  assert.equal(
    computeAccess(ctx({ userId: GA, profileRole: "admin" })).canManageBooking,
    true
  );
  assert.equal(
    computeAccess(ctx({ userId: RENTER })).canManageBooking,
    false
  );
  assert.equal(
    computeAccess(ctx({ userId: STRANGER })).canManageBooking,
    false
  );
  assert.equal(
    computeAccess(
      ctx({
        userId: SM,
        organisationId: ORG_B,
        grants: [grant({ role: "space_manager", propertyId: PROP, spaceId: SPACE })],
      })
    ).canManageBooking,
    false
  );
  assert.equal(
    computeAccess(
      ctx({
        userId: SM,
        grants: [
          grant({
            role: "space_manager",
            propertyId: PROP,
            spaceId: SPACE,
            status: "pending",
          }),
        ],
      })
    ).canManageBooking,
    false
  );
  assert.equal(
    computeAccess(
      ctx({ userId: GA, profileRole: "admin", adminAccessDisabled: true })
    ).canManageBooking,
    false
  );
}

// V/W/AB host response patch
{
  assert.equal(canHostRespondToStatus("pending_owner"), true);
  assert.equal(canHostRespondToStatus("pending"), true);
  assert.equal(canHostRespondToStatus("accepted_awaiting_payment"), false);
  const approve = buildHostResponsePatch("approve", SM, "ok", "2026-09-21T12:00:00.000Z");
  assert.equal(approve.status, "accepted_awaiting_payment");
  assert.equal(approve.payment_status, "awaiting_payment");
  assert.equal(approve.owner_response_by, SM);
  const decline = buildHostResponsePatch("decline", OA, "no", "2026-09-21T12:00:00.000Z");
  assert.equal(decline.status, "declined");
  assert.equal(decline.owner_response_by, OA);
  const overlap = buildOverlapAutoDeclinePatch("2026-09-21T12:00:00.000Z");
  assert.equal(overlap.owner_response_by, null);
  assert.equal(overlap.owner_response_message, AUTO_DECLINE_OVERLAP_MESSAGE);
  assert.notEqual(overlap.owner_response_by, SM);
}

// Y PayFast does not require owner_id
{
  const result = validateBookingForPayFastInitiate({
    id: "booking-1",
    renter_id: RENTER,
    owner_id: null,
    status: "accepted_awaiting_payment",
    payment_status: "awaiting_payment",
    total_price: 500,
    space_id: SPACE,
  });
  assert.equal(result.ok, true);
}

// Source contracts
{
  const sql = readFileSync(
    "supabase/migrations/066_20260921_booking_organisation_authority.sql",
    "utf8"
  );
  assert.match(sql, /ALTER COLUMN owner_id DROP NOT NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS organisation_id/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.match(sql, /owner_response_by/);
  assert.match(sql, /bookings_select_manage_space/);
  assert.match(sql, /user_can_manage_space\(space_id\)/);
  assert.match(sql, /user_can_view_booking_commercial\(booking_id\)/);
  assert.match(sql, /user_can_manage_booking\(booking_id\)/);
  assert.match(sql, /DROP POLICY IF EXISTS "Users can update own booking status"/);
  assert.match(sql, /DROP POLICY IF EXISTS bookings_update_legacy_owner/);
  assert.match(sql, /REVOKE UPDATE ON TABLE public\.bookings FROM authenticated/);
  assert.match(sql, /REVOKE UPDATE ON TABLE public\.bookings FROM anon/);
  assert.match(sql, /GRANT UPDATE ON TABLE public\.bookings TO service_role/);
  assert.doesNotMatch(sql, /CREATE POLICY bookings_update_legacy_owner/);
  assert.doesNotMatch(sql, /CREATE POLICY[\s\S]{0,120}FOR UPDATE/);
  assert.match(sql, /apply_host_booking_response/);
  assert.match(sql, /already been responded to/);
  assert.match(sql, /owner_response_by = NULL/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.apply_host_booking_response/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_host_booking_response\(uuid, uuid, text, text\) FROM anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_host_booking_response\(uuid, uuid, text, text\) FROM authenticated/);
  assert.match(sql, /auth\.role\(\)/);
  assert.doesNotMatch(sql, /USING \(\(auth\.uid\(\) = renter_id\)/);
  assert.doesNotMatch(sql, /INSERT INTO public\.organisations/);
  assert.doesNotMatch(sql, /b13d1be1/);
  assert.doesNotMatch(sql, /CREATE POLICY[\s\S]*ON public\.spaces/);
  assert.doesNotMatch(sql, /UPDATE public\.bookings SET organisation_id/);
}

{
  const create = readFileSync("lib/booking-request-server.ts", "utf8");
  assert.match(create, /snapshotBookingOwnership/);
  assert.match(create, /resolveOperationalBookingManagers/);
  assert.doesNotMatch(create, /space\.owner_id !== ownerId/);
  assert.match(create, /isLegacyOwnerSelfBooking/);
  assert.match(create, /You cannot book your own listing/);
  assert.match(create, /This organisation is no longer available for booking/);
  assert.match(create, /This property is no longer available for booking/);
  assert.match(create, /owner_id: snapshot\.ownerId/);
  assert.match(create, /organisation_id: snapshot\.organisationId/);
}

{
  const hostApi = readFileSync(
    "app/api/bookings/[bookingId]/host-response/route.ts",
    "utf8"
  );
  assert.match(hostApi, /requireManagedBookingApi/);
  assert.match(hostApi, /applyHostBookingResponse/);
}

{
  const requests = readFileSync("app/dashboard/requests/page.tsx", "utf8");
  assert.match(requests, /postHostBookingResponse/);
  assert.doesNotMatch(requests, /from\("bookings"\)[\s\S]{0,200}\.update\(/);
}

{
  const listingBookings = readFileSync(
    "app/dashboard/listings/[id]/bookings/page.tsx",
    "utf8"
  );
  assert.match(listingBookings, /postHostBookingResponse/);
}

{
  const expire = readFileSync("app/api/cron/expire-bookings/route.ts", "utf8");
  assert.doesNotMatch(expire, /if \(!renter_id \|\| !owner_id\)/);
  assert.match(expire, /if \(!renter_id\)/);
  assert.match(expire, /resolveBookingHostRecipientId/);
  assert.match(expire, /notifyBookingEvent/);
  assert.doesNotMatch(expire, /\/api\/notifications\/booking-event/);
}

{
  const payfast = readFileSync("app/api/payfast/initiate/route.ts", "utf8");
  assert.match(payfast, /renter_id !== user\.id/);
  assert.doesNotMatch(payfast, /booking\.owner_id !==/);
}

{
  const notify = readFileSync("app/api/payfast/notify/route.ts", "utf8");
  assert.match(notify, /isAwaitingGatewayPayment/);
  assert.doesNotMatch(notify, /owner_id/);
}

{
  const messages = readFileSync(
    "app/api/bookings/[bookingId]/messages/route.ts",
    "utf8"
  );
  assert.match(messages, /resolveAccessForSpace/);
  assert.match(messages, /resolveBookingHostRecipientId/);
}

{
  const wrappers = readFileSync("lib/access/require-managed-api.ts", "utf8");
  assert.match(wrappers, /Not wired into existing owner routes yet/);
  assert.match(wrappers, /requireManagedBookingApi/);
}

{
  const hostLib = readFileSync("lib/booking-host-response.ts", "utf8");
  assert.match(hostLib, /apply_host_booking_response/);
  assert.match(hostLib, /STALE_HOST_RESPONSE_MESSAGE/);
  assert.match(hostLib, /buildOverlapAutoDeclinePatch/);
  assert.match(hostLib, /owner_response_by: null/);
}

{
  const hostApi = readFileSync(
    "app/api/bookings/[bookingId]/host-response/route.ts",
    "utf8"
  );
  assert.match(hostApi, /notifyBookingEvent/);
  assert.doesNotMatch(hostApi, /\/api\/notifications\/booking-event/);
}

// AC stale second host response cannot overwrite
{
  assert.equal(STALE_HOST_RESPONSE_MESSAGE, "This booking has already been responded to.");
  const sql = readFileSync(
    "supabase/migrations/066_20260921_booking_organisation_authority.sql",
    "utf8"
  );
  assert.match(sql, /This booking has already been responded to/);
  assert.match(
    sql,
    /b\.status IS DISTINCT FROM 'pending_owner' AND b\.status IS DISTINCT FROM 'pending'/
  );
}

// AD booking-event HTTP cannot be invoked anonymously
{
  const route = readFileSync(
    "app/api/notifications/booking-event/route.ts",
    "utf8"
  );
  assert.match(route, /status: 401/);
  assert.match(route, /Unauthorized/);
  assert.doesNotMatch(route, /from "@\/lib\/booking-event-notify"/);
  assert.doesNotMatch(route, /process\.env\.CRON_SECRET/);
  const lib = readFileSync("lib/booking-event-notify.ts", "utf8");
  assert.match(lib, /export async function notifyBookingEvent/);
}

// AE NULL-owner booking cannot enter incompatible manual-payment path
{
  assert.equal(
    bookingAllowsManualMvpPayment({ owner_id: null, organisation_id: ORG }),
    false
  );
  assert.equal(
    bookingAllowsManualMvpPayment({ owner_id: OWNER, organisation_id: ORG }),
    false
  );
  assert.equal(
    bookingAllowsManualMvpPayment({ owner_id: OWNER, organisation_id: null }),
    true
  );
  const payPage = readFileSync(
    "app/dashboard/my-bookings/[id]/pay/page.tsx",
    "utf8"
  );
  assert.match(payPage, /bookingAllowsManualMvpPayment/);
  assert.match(payPage, /\/api\/payfast\/initiate/);
  assert.doesNotMatch(payPage, /manual_mvp/);
  assert.doesNotMatch(payPage, /handleMockPayment/);
}

// AF supported payment flow tolerates NULL owner
{
  const result = validateBookingForPayFastInitiate({
    id: "booking-null-owner",
    renter_id: RENTER,
    owner_id: null,
    status: "accepted_awaiting_payment",
    payment_status: "awaiting_payment",
    total_price: 100,
    space_id: SPACE,
  });
  assert.equal(result.ok, true);
  const initiate = readFileSync("app/api/payfast/initiate/route.ts", "utf8");
  assert.match(initiate, /owner_id: string \| null/);
  const notify = readFileSync("app/api/payfast/notify/route.ts", "utf8");
  assert.match(notify, /notifyBookingEvent/);
  assert.doesNotMatch(notify, /owner_id/);
}

// AG / AH organisation recipient resolution
{
  const withManagers = computeOperationalBookingManagers({
    organisationId: ORG,
    spaceOwnerId: OWNER,
    propertyOwnerId: OWNER,
    activeSpaceManagerUserIds: [SM, SM],
    activeOrgAdminUserIds: [OA],
  });
  assert.deepEqual(withManagers.recipientUserIds, [SM]);
  assert.equal(withManagers.recipientUserIds.includes(OWNER), false);
}

{
  const recipientSrc = readFileSync(
    "lib/access/resolve-operational-booking-managers.ts",
    "utf8"
  );
  assert.match(
    recipientSrc,
    /Organisation managers take precedence over a leftover spaces\.owner_id snapshot/
  );
  assert.doesNotMatch(
    recipientSrc,
    /if \(booking\.owner_id\) return booking\.owner_id/
  );
}

// AI renter cannot mutate host/payment lifecycle fields directly
{
  const sql = readFileSync(
    "supabase/migrations/066_20260921_booking_organisation_authority.sql",
    "utf8"
  );
  assert.match(sql, /REVOKE UPDATE ON TABLE public\.bookings FROM authenticated/);
  assert.doesNotMatch(sql, /CREATE POLICY bookings_update_legacy_owner/);
  const myBookings = readFileSync("app/dashboard/my-bookings/page.tsx", "utf8");
  assert.match(myBookings, /\/api\/bookings\/\$\{booking\.id\}\/renter-cancel/);
  assert.doesNotMatch(
    myBookings,
    /from\("bookings"\)[\s\S]{0,120}\.update\(/
  );
}

// AJ renter cancellation works for NULL-owner organisation booking
{
  assert.equal(canRenterCancelStatus("pending_owner"), true);
  assert.equal(canRenterCancelStatus("accepted_awaiting_payment"), true);
  assert.equal(canRenterCancelStatus("paid_confirmed"), false);
  const cancelLib = readFileSync("lib/booking-renter-cancel.ts", "utf8");
  assert.match(cancelLib, /owner_id: string \| null/);
  assert.match(cancelLib, /resolveBookingHostRecipientId/);
  assert.match(cancelLib, /\.in\("status", \[\.\.\.RENTER_CANCEL_STATUSES\]\)/);
}

// AK archived organisation cannot receive new booking
{
  const create = readFileSync("lib/booking-request-server.ts", "utf8");
  assert.match(create, /orgRow\.status === "archived"/);
  assert.match(create, /isArchivedProperty/);
  assert.match(create, /!operational\?\.canAcceptPublicBooking/);
}

// AL actual actor remains correct under competing manager actions
{
  const approveA = buildHostResponsePatch("approve", SM, "yes", "2026-09-21T12:00:00.000Z");
  const approveB = buildHostResponsePatch("approve", OA, "yes", "2026-09-21T12:00:00.000Z");
  assert.equal(approveA.owner_response_by, SM);
  assert.equal(approveB.owner_response_by, OA);
  assert.notEqual(approveA.owner_response_by, approveB.owner_response_by);
  const overlap = buildOverlapAutoDeclinePatch("2026-09-21T12:00:00.000Z");
  assert.equal(overlap.owner_response_by, null);
}

// H self-booking rule: legacy owner only
{
  assert.equal(isLegacyOwnerSelfBooking(OWNER, OWNER), true);
  assert.equal(isLegacyOwnerSelfBooking(OWNER, RENTER), false);
  assert.equal(isLegacyOwnerSelfBooking(null, OA), false);
  assert.equal(isLegacyOwnerSelfBooking(null, SM), false);
  assert.equal(isLegacyOwnerSelfBooking(null, PM), false);
  assert.equal(isLegacyOwnerSelfBooking(null, GA), false);
  assert.equal(isLegacyOwnerSelfBooking(OWNER, OA), false);
}

// AM legacy owner cannot directly UPDATE booking through authenticated PostgREST
{
  const sql = readFileSync(
    "supabase/migrations/066_20260921_booking_organisation_authority.sql",
    "utf8"
  );
  assert.match(sql, /DROP POLICY IF EXISTS "Users can update own booking status"/);
  assert.match(sql, /DROP POLICY IF EXISTS bookings_update_legacy_owner/);
  assert.doesNotMatch(sql, /CREATE POLICY bookings_update_legacy_owner/);
  assert.doesNotMatch(sql, /auth\.uid\(\) = owner_id/);
}

// AN legacy owner can still approve/decline through host-response API
{
  assert.equal(
    computeAccess(ctx({ userId: OWNER, spaceOwnerId: OWNER })).canManageBooking,
    true
  );
  const hostApi = readFileSync(
    "app/api/bookings/[bookingId]/host-response/route.ts",
    "utf8"
  );
  assert.match(hostApi, /requireManagedBookingApi/);
  assert.match(hostApi, /applyHostBookingResponse/);
  const client = readFileSync("lib/booking-host-response-client.ts", "utf8");
  assert.match(client, /\/api\/bookings\/\$\{params\.bookingId\}\/host-response/);
}

// AO authenticated role lacks broad booking UPDATE capability
{
  const sql = readFileSync(
    "supabase/migrations/066_20260921_booking_organisation_authority.sql",
    "utf8"
  );
  assert.match(sql, /REVOKE UPDATE ON TABLE public\.bookings FROM authenticated/);
  assert.match(sql, /GRANT UPDATE ON TABLE public\.bookings TO service_role/);
}

// AP / AQ apply_host_booking_response cannot be executed by anon or authenticated
{
  const sql = readFileSync(
    "supabase/migrations/066_20260921_booking_organisation_authority.sql",
    "utf8"
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.apply_host_booking_response\(uuid, uuid, text, text\) FROM PUBLIC/
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.apply_host_booking_response\(uuid, uuid, text, text\) FROM anon/
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.apply_host_booking_response\(uuid, uuid, text, text\) FROM authenticated/
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.apply_host_booking_response\(uuid, uuid, text, text\) TO service_role/
  );
  assert.match(sql, /IS DISTINCT FROM 'service_role'/);
}

// AR forged actor id cannot be supplied through public route
{
  const hostApi = readFileSync(
    "app/api/bookings/[bookingId]/host-response/route.ts",
    "utf8"
  );
  assert.match(hostApi, /actorUserId: auth\.userId/);
  assert.doesNotMatch(hostApi, /body\.(actor|actorUserId|owner_response_by|ownerResponseBy)/);
  const client = readFileSync("lib/booking-host-response-client.ts", "utf8");
  assert.doesNotMatch(client, /owner_response_by|actorUserId|actorId/);
}

// AS renter-cancel verifies renter identity
{
  const cancelRoute = readFileSync(
    "app/api/bookings/[bookingId]/renter-cancel/route.ts",
    "utf8"
  );
  assert.match(cancelRoute, /renterId: auth\.userId/);
  assert.doesNotMatch(cancelRoute, /await req\.json\(\)/);
  const cancelLib = readFileSync("lib/booking-renter-cancel.ts", "utf8");
  assert.match(cancelLib, /row\.renter_id !== params\.renterId/);
}

// AT stale renter cancellation cannot overwrite a later booking state
{
  const cancelLib = readFileSync("lib/booking-renter-cancel.ts", "utf8");
  assert.match(cancelLib, /\.in\("status", \[\.\.\.RENTER_CANCEL_STATUSES\]\)/);
  assert.match(cancelLib, /if \(!updatedRows\?\.length\)/);
  assert.equal(canRenterCancelStatus("paid_confirmed"), false);
  assert.equal(canRenterCancelStatus("declined"), false);
}

// AU no production browser path inserts manual_mvp/manual_test payment
{
  const browserPaths = [
    "app/dashboard/my-bookings/[id]/pay/page.tsx",
    "app/dashboard/my-bookings/page.tsx",
    "app/components/BookingRequestForm.tsx",
  ];
  for (const file of browserPaths) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /manual_mvp/);
    assert.doesNotMatch(src, /manual_test/);
    assert.doesNotMatch(src, /from\("payments"\)/);
  }
}

// AV GET and POST booking-event route both return 401 with zero side effects
{
  const route = readFileSync(
    "app/api/notifications/booking-event/route.ts",
    "utf8"
  );
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.equal((route.match(/status: 401/g) || []).length, 2);
  assert.doesNotMatch(route, /req\.json/);
  assert.doesNotMatch(route, /from "@\/lib\/booking-event-notify"/);
  assert.doesNotMatch(route, /sendEmail/);
  assert.doesNotMatch(route, /from\("notifications"\)/);
  assert.doesNotMatch(route, /from\("bookings"\)/);
}

console.log("test-booking-authority: all assertions passed");
