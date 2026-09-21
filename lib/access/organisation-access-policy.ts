import { normalizeOrganisationAccessEmail } from "@/lib/access/organisation-access-email";
import {
  ORG_ACCESS_ROLES,
  type OrganisationAccessRole,
  type OrganisationAccessStatus,
} from "@/lib/access/roles";

export type OrganisationAccessGrantInput = {
  role: string;
  email: string;
  propertyId?: string | null;
  spaceId?: string | null;
  isPrimary?: boolean;
  notifyAllBookings?: boolean;
};

export type OrganisationAccessPolicyError = {
  status: 400 | 409;
  error: string;
  code: string;
};

export type ExistingAccessGrant = {
  id: string;
  organisationId: string;
  role: OrganisationAccessRole;
  propertyId: string | null;
  spaceId: string | null;
  userId: string | null;
  emailNormalized: string;
  status: OrganisationAccessStatus;
};

export type ScopedGrantCandidate = {
  organisationId: string;
  role: OrganisationAccessRole;
  propertyId: string | null;
  spaceId: string | null;
  emailNormalized: string;
  userId: string | null;
  status: "pending" | "active";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isOrganisationAccessRole(
  value: string
): value is OrganisationAccessRole {
  return (ORG_ACCESS_ROLES as readonly string[]).includes(value);
}

export function parseGrantInput(
  input: OrganisationAccessGrantInput
):
  | {
      ok: true;
      role: OrganisationAccessRole;
      email: string;
      emailNormalized: string;
      propertyId: string | null;
      spaceId: string | null;
      isPrimary: boolean;
      notifyAllBookings: boolean;
    }
  | OrganisationAccessPolicyError {
  const emailNormalized = normalizeOrganisationAccessEmail(input.email);
  if (!emailNormalized) {
    return {
      status: 400,
      error: "Enter a valid email address.",
      code: "invalid_email",
    };
  }

  if (!isOrganisationAccessRole(input.role)) {
    return {
      status: 400,
      error: "Choose Organisation Admin, Property Manager, or Space Manager.",
      code: "invalid_role",
    };
  }

  const propertyId = input.propertyId ? String(input.propertyId) : null;
  const spaceId = input.spaceId ? String(input.spaceId) : null;

  if (input.role === "org_admin") {
    if (propertyId || spaceId) {
      return {
        status: 400,
        error: "Organisation Admin access is for the whole organisation.",
        code: "invalid_scope",
      };
    }
  } else if (input.role === "property_manager") {
    if (!propertyId || !isUuid(propertyId) || spaceId) {
      return {
        status: 400,
        error: "Property Manager access needs exactly one property.",
        code: "invalid_scope",
      };
    }
  } else if (
    !propertyId ||
    !spaceId ||
    !isUuid(propertyId) ||
    !isUuid(spaceId)
  ) {
    return {
      status: 400,
      error: "Space Manager access needs exactly one space.",
      code: "invalid_scope",
    };
  }

  const isPrimary = Boolean(input.isPrimary);
  const notifyAllBookings = Boolean(input.notifyAllBookings);

  if (isPrimary && input.role !== "space_manager") {
    return {
      status: 400,
      error: "Only a Space Manager can be marked as primary.",
      code: "invalid_primary",
    };
  }

  if (notifyAllBookings && input.role !== "org_admin") {
    return {
      status: 400,
      error: "Booking email preference applies to Organisation Admins only.",
      code: "invalid_notify",
    };
  }

  return {
    ok: true,
    role: input.role,
    email: emailNormalized,
    emailNormalized,
    propertyId: input.role === "org_admin" ? null : propertyId,
    spaceId: input.role === "space_manager" ? spaceId : null,
    isPrimary: input.role === "space_manager" ? isPrimary : false,
    notifyAllBookings: input.role === "org_admin" ? notifyAllBookings : false,
  };
}

export function validatePropertyBelongsToOrganisation(input: {
  propertyOrganisationId: string | null;
  organisationId: string;
}): OrganisationAccessPolicyError | null {
  if (input.propertyOrganisationId !== input.organisationId) {
    return {
      status: 400,
      error: "That property does not belong to this organisation.",
      code: "property_scope_mismatch",
    };
  }
  return null;
}

export function validateSpaceBelongsToProperty(input: {
  spacePropertyId: string | null;
  propertyId: string;
}): OrganisationAccessPolicyError | null {
  if (input.spacePropertyId !== input.propertyId) {
    return {
      status: 400,
      error: "That space does not belong to the selected property.",
      code: "space_scope_mismatch",
    };
  }
  return null;
}

function sameScope(
  left: Pick<
    ExistingAccessGrant,
    "organisationId" | "role" | "propertyId" | "spaceId"
  >,
  right: Pick<
    ScopedGrantCandidate,
    "organisationId" | "role" | "propertyId" | "spaceId"
  >
): boolean {
  return (
    left.organisationId === right.organisationId &&
    left.role === right.role &&
    left.propertyId === right.propertyId &&
    left.spaceId === right.spaceId
  );
}

export function findDuplicateGrant(
  existing: ExistingAccessGrant[],
  candidate: ScopedGrantCandidate
): ExistingAccessGrant | null {
  for (const row of existing) {
    if (!sameScope(row, candidate)) continue;
    if (row.status === "revoked") continue;
    if (candidate.status === "active" && row.status === "active") {
      if (row.userId && candidate.userId && row.userId === candidate.userId) {
        return row;
      }
    }
    if (candidate.status === "pending" && row.status === "pending") {
      if (row.emailNormalized === candidate.emailNormalized) {
        return row;
      }
    }
    if (candidate.status === "active" && row.status === "pending") {
      if (row.emailNormalized === candidate.emailNormalized) {
        return row;
      }
    }
    if (candidate.status === "pending" && row.status === "active") {
      if (
        row.emailNormalized === candidate.emailNormalized ||
        (candidate.userId && row.userId === candidate.userId)
      ) {
        return row;
      }
    }
  }
  return null;
}

export function countActiveOrgAdmins(
  grants: Array<{ role: string; status: string }>
): number {
  return grants.filter(
    (grant) => grant.role === "org_admin" && grant.status === "active"
  ).length;
}

export function canRevokeLastOrgAdmin(input: {
  targetRole: OrganisationAccessRole;
  targetStatus: OrganisationAccessStatus;
  activeOrgAdminCount: number;
}): boolean {
  if (input.targetRole !== "org_admin" || input.targetStatus !== "active") {
    return true;
  }
  return input.activeOrgAdminCount > 1;
}

export function primaryFlagAfterSpaceReassign(input: {
  previousSpaceId: string | null;
  nextSpaceId: string | null;
  wasPrimary: boolean;
}): boolean {
  if (input.previousSpaceId !== input.nextSpaceId) return false;
  return input.wasPrimary;
}

export function resolveManagerReassignScope(input: {
  role: OrganisationAccessRole;
  organisationId: string;
  requestedPropertyId: string | null;
  requestedSpaceId: string | null;
  space: { id: string; propertyId: string | null } | null;
  property: { id: string; organisationId: string | null } | null;
}):
  | { propertyId: string; spaceId: string | null }
  | OrganisationAccessPolicyError {
  if (input.role === "org_admin") {
    return {
      status: 400,
      error: "Organisation Admin access is for the whole organisation.",
      code: "invalid_scope",
    };
  }

  if (input.role === "space_manager") {
    if (!input.requestedSpaceId || !isUuid(input.requestedSpaceId)) {
      return {
        status: 400,
        error: "Space Manager access needs exactly one space.",
        code: "invalid_scope",
      };
    }
    if (!input.space || input.space.id !== input.requestedSpaceId) {
      return {
        status: 400,
        error: "Space not found.",
        code: "space_not_found",
      };
    }
    if (!input.property || input.property.id !== input.space.propertyId) {
      return {
        status: 400,
        error: "That space does not belong to this organisation.",
        code: "property_scope_mismatch",
      };
    }
    const mismatch = validatePropertyBelongsToOrganisation({
      propertyOrganisationId: input.property.organisationId,
      organisationId: input.organisationId,
    });
    if (mismatch) return mismatch;
    return { propertyId: input.property.id, spaceId: input.space.id };
  }

  if (!input.requestedPropertyId || !isUuid(input.requestedPropertyId)) {
    return {
      status: 400,
      error: "Property Manager access needs exactly one property.",
      code: "invalid_scope",
    };
  }
  if (!input.property || input.property.id !== input.requestedPropertyId) {
    return {
      status: 400,
      error: "Property not found.",
      code: "property_not_found",
    };
  }
  const mismatch = validatePropertyBelongsToOrganisation({
    propertyOrganisationId: input.property.organisationId,
    organisationId: input.organisationId,
  });
  if (mismatch) return mismatch;
  return { propertyId: input.property.id, spaceId: null };
}

/**
 * New Organisation access granted by email always starts pending.
 * Autoconfirm sets email_confirmed_at without mailbox proof, so a matching
 * auth user is not trusted activation evidence. Invitation acceptance is required.
 */
export function decideGrantActivation(_authUser?: {
  id: string;
  emailConfirmed: boolean;
} | null): { status: "pending"; userId: null } {
  return { status: "pending", userId: null };
}

export type PublicAccessGrantView = {
  id: string;
  status: OrganisationAccessStatus;
  role: OrganisationAccessRole;
  email: string;
  userId: string | null;
  displayName: string | null;
  propertyId: string | null;
  propertyName: string | null;
  spaceId: string | null;
  spaceTitle: string | null;
  isPrimary: boolean;
  notifyAllBookings: boolean;
  invitedBy: string | null;
  createdAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
};

export function personDisplayName(input: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const fullName = input.fullName?.trim() || "";
  if (fullName) return fullName;
  const joined = [input.firstName, input.lastName]
    .map((part) => part?.trim() || "")
    .filter(Boolean)
    .join(" ");
  return joined || null;
}

export function toPublicAccessGrantView(input: {
  id: string;
  status: OrganisationAccessStatus;
  role: OrganisationAccessRole;
  email: string;
  userId: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  propertyId: string | null;
  propertyName: string | null;
  spaceId: string | null;
  spaceTitle: string | null;
  isPrimary: boolean;
  notifyAllBookings: boolean;
  invitedBy: string | null;
  createdAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}): PublicAccessGrantView {
  const name = personDisplayName({
    fullName: input.fullName,
    firstName: input.firstName,
    lastName: input.lastName,
  });
  return {
    id: input.id,
    status: input.status,
    role: input.role,
    email: input.email,
    userId: input.status === "active" ? input.userId : null,
    displayName: name,
    propertyId: input.propertyId,
    propertyName: input.propertyName,
    spaceId: input.spaceId,
    spaceTitle: input.spaceTitle,
    isPrimary: input.role === "space_manager" ? input.isPrimary : false,
    notifyAllBookings:
      input.role === "org_admin" ? input.notifyAllBookings : false,
    invitedBy: input.invitedBy,
    createdAt: input.createdAt,
    activatedAt: input.activatedAt,
    revokedAt: input.revokedAt,
    revokeReason: input.revokeReason,
  };
}
