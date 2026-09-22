#!/usr/bin/env node
/**
 * Organisation property creation — application-layer contracts.
 * Does not apply migrations or write production data.
 * Run: npm run test:organisation-property
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAccess } from "../lib/access/compute-access";
import { summarizeHostingAccess } from "../lib/access/hosting-access";
import type { AccessContext, OrganisationAccessGrant } from "../lib/access/roles";
import { organisationListingHref } from "../lib/list-space-chooser";
import {
  canCreateOrganisationProperty,
  canShowOrganisationAddProperty,
  hasForbiddenOrganisationPropertyWriteKeys,
  organisationPropertyInsertRow,
  organisationPropertyNamesClash,
  organisationPropertyPatchRow,
  parseOrganisationPropertyWriteBody,
  resolveOrganisationListingPropertyChoice,
  stripForbiddenOrganisationPropertyWriteKeys,
} from "../lib/organisation-property";

const ORG_A = "21cf12c3-3235-4cd3-8106-801d120dc7b5";
const ORG_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROP_A = "b13d1be1-0bc6-437d-8deb-d43b881fe5cb";
const PROP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const SPACE_A = "cd1ebdff-0259-4185-8a0c-ac2892f03778";
const OA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const SM = "5860f254-26e9-4f7f-8760-3fd69bd9fff3";
const GA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const RENTER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";

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

function accessCtx(partial: Partial<AccessContext>): AccessContext {
  return {
    userId: partial.userId ?? OA,
    spaceId: partial.spaceId ?? null,
    propertyId: partial.propertyId ?? null,
    organisationId: partial.organisationId ?? ORG_A,
    spaceOwnerId: partial.spaceOwnerId ?? null,
    propertyOwnerId: partial.propertyOwnerId ?? null,
    profileRole: partial.profileRole ?? "user",
    adminAccessDisabled: partial.adminAccessDisabled ?? false,
    grants: partial.grants ?? [],
  };
}

const helper = readFileSync("lib/organisation-property.ts", "utf8");
const server = readFileSync("lib/organisation-property-server.ts", "utf8");
const createApi = readFileSync(
  "app/api/organisations/[organisationId]/properties/route.ts",
  "utf8"
);
const patchApi = readFileSync(
  "app/api/organisations/[organisationId]/properties/[propertyId]/route.ts",
  "utf8"
);
const requireApi = readFileSync(
  "lib/access/require-org-property-api.ts",
  "utf8"
);
const ownerPatch = readFileSync("app/api/owner/properties/[id]/route.ts", "utf8");
const listingServer = readFileSync(
  "lib/organisation-commercial-server.ts",
  "utf8"
);
const listingsApi = readFileSync(
  "app/api/organisations/[organisationId]/listings/route.ts",
  "utf8"
);
const propertiesPage = readFileSync("app/dashboard/properties/page.tsx", "utf8");
const propertyDetail = readFileSync(
  "app/dashboard/properties/[id]/page.tsx",
  "utf8"
);
const newPropertyPage = readFileSync(
  "app/dashboard/properties/new/page.tsx",
  "utf8"
);
const editPropertyPage = readFileSync(
  "app/dashboard/properties/[id]/edit/page.tsx",
  "utf8"
);
const spaceForm = readFileSync("app/components/SpaceForm.tsx", "utf8");
const newSpace = readFileSync("app/dashboard/new-space/page.tsx", "utf8");

const oaAccess = computeAccess(
  accessCtx({
    userId: OA,
    grants: [grant({ role: "org_admin", status: "active" })],
  })
);
const gaAccess = computeAccess(
  accessCtx({
    userId: GA,
    profileRole: "admin",
    grants: [],
  })
);
const pmAccess = computeAccess(
  accessCtx({
    userId: PM,
    propertyId: PROP_A,
    grants: [
      grant({
        role: "property_manager",
        status: "active",
        propertyId: PROP_A,
      }),
    ],
  })
);
const smAccess = computeAccess(
  accessCtx({
    userId: SM,
    propertyId: PROP_A,
    spaceId: SPACE_A,
    grants: [
      grant({
        role: "space_manager",
        status: "active",
        propertyId: PROP_A,
        spaceId: SPACE_A,
      }),
    ],
  })
);
const renterAccess = computeAccess(
  accessCtx({
    userId: RENTER,
    organisationId: ORG_A,
    grants: [],
  })
);

// A. Organisation Admin create → organisation_id set, owner_id null
{
  assert.equal(canCreateOrganisationProperty(oaAccess), true);
  const row = organisationPropertyInsertRow(ORG_A, { name: "Main Campus" });
  assert.equal(row.organisation_id, ORG_A);
  assert.equal(row.owner_id, null);
  assert.equal(row.created_by_admin, false);
  assert.equal(row.name, "Main Campus");
}

// B. Global Admin create in selected org → owner_id null
{
  assert.equal(canCreateOrganisationProperty(gaAccess), true);
  const row = organisationPropertyInsertRow(ORG_A, { name: "Sports Campus" });
  assert.equal(row.organisation_id, ORG_A);
  assert.equal(row.owner_id, null);
}

// C. Property Manager create denied
{
  assert.equal(canCreateOrganisationProperty(pmAccess), false);
  assert.equal(
    canShowOrganisationAddProperty({
      contextKind: "organisation",
      showOrganisationCommercial: summarizeHostingAccess({
        profileRole: "user",
        isHostProfile: false,
        ownedSpaceCount: 0,
        ownedPropertyCount: 0,
        grants: [
          grant({
            role: "property_manager",
            status: "active",
            propertyId: PROP_A,
          }),
        ],
      }).showOrganisationCommercial,
    }),
    false
  );
}

// D. Space Manager create denied
{
  assert.equal(canCreateOrganisationProperty(smAccess), false);
}

// E. renter create denied
{
  assert.equal(canCreateOrganisationProperty(renterAccess), false);
}

// F. archived organisation denied
{
  assert.match(requireApi, /status === "archived"/);
  assert.match(requireApi, /This organisation is not available/);
}

// G/H. verification not required
{
  assert.doesNotMatch(requireApi, /verification_status/);
  assert.doesNotMatch(requireApi, /bank_verification/);
  assert.doesNotMatch(createApi, /payout_readiness/);
  assert.match(requireApi, /canCreateOrganisationProperty/);
}

// I. browser owner_id ignored
{
  const raw = {
    name: "Main Campus",
    owner_id: OA,
    user_id: OA,
    actor_id: OA,
  };
  assert.equal(hasForbiddenOrganisationPropertyWriteKeys(raw), true);
  const stripped = stripForbiddenOrganisationPropertyWriteKeys(raw);
  const parsed = parseOrganisationPropertyWriteBody(stripped, {
    requireName: true,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const row = organisationPropertyInsertRow(ORG_A, {
      ...parsed.fields,
      name: parsed.fields.name as string,
    });
    assert.equal(row.owner_id, null);
    assert.equal("owner_id" in stripped, false);
  }
  assert.match(createApi, /stripForbiddenOrganisationPropertyWriteKeys/);
}

// J. browser organisation_id ignored; route organisation wins
{
  const stripped = stripForbiddenOrganisationPropertyWriteKeys({
    name: "Huguenot Community Hall",
    organisation_id: ORG_B,
  });
  const parsed = parseOrganisationPropertyWriteBody(stripped, {
    requireName: true,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const row = organisationPropertyInsertRow(ORG_A, {
      ...parsed.fields,
      name: parsed.fields.name as string,
    });
    assert.equal(row.organisation_id, ORG_A);
  }
}

// K. unauthorised organisation context → no Add property
{
  assert.equal(
    canShowOrganisationAddProperty({
      contextKind: "unavailable",
      showOrganisationCommercial: true,
    }),
    false
  );
  assert.match(requireApi, /Forbidden/);
  assert.match(newPropertyPage, /canShowOrganisationAddProperty/);
}

// L. organisation property edit cannot change organisation_id or owner_id
{
  const patch = organisationPropertyPatchRow({
    name: "Main Campus",
    description: "Updated",
  });
  assert.equal("organisation_id" in patch, false);
  assert.equal("owner_id" in patch, false);
  assert.match(server, /\.eq\("organisation_id", input\.organisationId\)/);
  assert.match(ownerPatch, /stripForbiddenOrganisationPropertyWriteKeys/);
  assert.match(ownerPatch, /updateOrganisationProperty/);
}

// M. personal property flow unchanged
{
  assert.match(propertiesPage, /Request a property/);
  assert.match(propertiesPage, /canAddProperty/);
  assert.match(ownerPatch, /\.is\("organisation_id", null\)/);
}

// N/O/P listing property selection
{
  assert.deepEqual(
    resolveOrganisationListingPropertyChoice({
      organisationPropertyIds: [],
    }),
    { kind: "create_first" }
  );
  assert.deepEqual(
    resolveOrganisationListingPropertyChoice({
      organisationPropertyIds: [PROP_A],
    }),
    { kind: "use", propertyId: PROP_A }
  );
  assert.deepEqual(
    resolveOrganisationListingPropertyChoice({
      organisationPropertyIds: [PROP_A, PROP_B],
    }),
    { kind: "required" }
  );
  assert.deepEqual(
    resolveOrganisationListingPropertyChoice({
      organisationPropertyIds: [PROP_A, PROP_B],
      requestedPropertyId: PROP_B,
    }),
    { kind: "use", propertyId: PROP_B }
  );
  assert.match(listingServer, /createOrganisationProperty/);
  assert.match(listingsApi, /actorUserId: auth\.userId/);
  assert.match(spaceForm, /Choose which property this space belongs to/);
}

// Q. cannot select another organisation's property
{
  assert.deepEqual(
    resolveOrganisationListingPropertyChoice({
      organisationPropertyIds: [PROP_A],
      requestedPropertyId: PROP_B,
    }),
    { kind: "invalid" }
  );
  assert.match(listingServer, /property_mismatch/);
}

// R/S. new property appears in selected org My Properties, not personal
{
  assert.match(propertiesPage, /Add property/);
  assert.match(propertiesPage, /canShowOrganisationAddProperty/);
  assert.match(helper, /contextKind === "organisation"/);
  assert.equal(
    canShowOrganisationAddProperty({
      contextKind: "personal",
      showOrganisationCommercial: false,
    }),
    false
  );
}

// T. audit event
{
  assert.match(server, /ORGANISATION_PROPERTY_AUDIT\.created/);
  assert.match(server, /ORGANISATION_PROPERTY_AUDIT\.updated/);
  assert.match(helper, /organisation\.property\.created/);
  assert.match(helper, /organisation\.property\.updated/);
  assert.match(server, /actor_kind/);
  assert.match(server, /property_id/);
}

{
  assert.equal(
    organisationPropertyNamesClash("Main Campus", ["main campus", "Sports"]),
    true
  );
  assert.equal(
    organisationPropertyNamesClash("Sports Campus", ["Main Campus"]),
    false
  );
  assert.match(server, /duplicate_name/);
}

{
  assert.equal(
    organisationListingHref(ORG_A, PROP_A),
    `/dashboard/new-space?organisation=${ORG_A}&property=${PROP_A}`
  );
  assert.match(propertyDetail, /organisationListingHref/);
  assert.match(propertyDetail, /Edit property/);
  assert.match(propertyDetail, /Add space/);
  assert.match(editPropertyPage, /patchOwnerPropertyRequest/);
  assert.match(newPropertyPage, /createOrganisationPropertyRequest/);
  assert.match(newSpace, /propertyId=\{organisationId \? requestedPropertyId/);
  assert.match(createApi, /requireOrgPropertyCreateApi/);
  assert.match(patchApi, /requireOrgPropertyCreateApi/);
  assert.doesNotMatch(createApi, /owner_id: auth\.userId/);
  assert.match(requireApi, /resolveAccessForOrganisation/);
}

console.log("test-organisation-property: ok");
