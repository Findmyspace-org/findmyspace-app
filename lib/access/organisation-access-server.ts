import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import { lookupAuthUserByEmail } from "@/lib/access/lookup-auth-user-by-email";
import {
  ORGANISATION_ACCESS_AUDIT,
  organisationAccessAuditEvent,
  type OrganisationAccessActorKind,
} from "@/lib/access/organisation-access-audit";
import {
  canRevokeLastOrgAdmin,
  countActiveOrgAdmins,
  decideGrantActivation,
  findDuplicateGrant,
  isUuid,
  parseGrantInput,
  primaryFlagAfterSpaceReassign,
  resolveManagerReassignScope,
  toPublicAccessGrantView,
  validatePropertyBelongsToOrganisation,
  validateSpaceBelongsToProperty,
  type ExistingAccessGrant,
  type OrganisationAccessGrantInput,
  type PublicAccessGrantView,
} from "@/lib/access/organisation-access-policy";
import type {
  OrganisationAccessRole,
  OrganisationAccessStatus,
} from "@/lib/access/roles";

export class OrganisationAccessError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

type AccessRow = {
  id: string;
  organisation_id: string;
  role: OrganisationAccessRole;
  property_id: string | null;
  space_id: string | null;
  user_id: string | null;
  email: string;
  email_normalized: string;
  status: OrganisationAccessStatus;
  is_primary: boolean;
  notify_all_bookings: boolean;
  invited_by: string | null;
  created_at: string;
  activated_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

const ACCESS_SELECT =
  "id, organisation_id, role, property_id, space_id, user_id, email, email_normalized, status, is_primary, notify_all_bookings, invited_by, created_at, activated_at, revoked_at, revoke_reason";

function asAccessRow(row: AccessRow): ExistingAccessGrant {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    role: row.role,
    propertyId: row.property_id,
    spaceId: row.space_id,
    userId: row.user_id,
    emailNormalized: row.email_normalized,
    status: row.status,
  };
}

async function loadOrgAccessRows(
  admin: SupabaseClient,
  organisationId: string
): Promise<AccessRow[]> {
  const { data, error } = await admin
    .from("organisation_access")
    .select(ACCESS_SELECT)
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new OrganisationAccessError(500, error.message, "load_failed");
  }
  return (data || []) as AccessRow[];
}

export async function listManageableOrganisations(
  admin: SupabaseClient,
  userId: string,
  isGlobalAdmin: boolean
): Promise<Array<{ id: string; name: string; status: string }>> {
  if (isGlobalAdmin) {
    const { data, error } = await admin
      .from("organisations")
      .select("id, name, status")
      .order("name", { ascending: true });
    if (error) {
      throw new OrganisationAccessError(500, error.message, "load_failed");
    }
    return (data || []) as Array<{ id: string; name: string; status: string }>;
  }

  const { data: grants, error: grantError } = await admin
    .from("organisation_access")
    .select("organisation_id")
    .eq("user_id", userId)
    .eq("role", "org_admin")
    .eq("status", "active");

  if (grantError) {
    throw new OrganisationAccessError(500, grantError.message, "load_failed");
  }

  const ids = Array.from(
    new Set(
      ((grants || []) as Array<{ organisation_id: string }>).map(
        (row) => row.organisation_id
      )
    )
  );
  if (ids.length === 0) return [];

  const { data, error } = await admin
    .from("organisations")
    .select("id, name, status")
    .in("id", ids)
    .order("name", { ascending: true });

  if (error) {
    throw new OrganisationAccessError(500, error.message, "load_failed");
  }
  return (data || []) as Array<{ id: string; name: string; status: string }>;
}

export async function listOrganisationAccess(
  admin: SupabaseClient,
  organisationId: string
): Promise<{
  organisation: { id: string; name: string; status: string };
  grants: PublicAccessGrantView[];
  properties: Array<{ id: string; name: string }>;
  spaces: Array<{ id: string; title: string | null; propertyId: string }>;
}> {
  const { data: organisation, error: orgError } = await admin
    .from("organisations")
    .select("id, name, status")
    .eq("id", organisationId)
    .maybeSingle();

  if (orgError || !organisation) {
    throw new OrganisationAccessError(404, "Organisation not found.", "not_found");
  }

  const { data: properties } = await admin
    .from("properties")
    .select("id, name")
    .eq("organisation_id", organisationId)
    .order("name", { ascending: true });

  const propertyRows = (properties || []) as Array<{ id: string; name: string }>;
  const propertyIds = propertyRows.map((row) => row.id);
  const { data: spaces } =
    propertyIds.length > 0
      ? await admin
          .from("spaces")
          .select("id, title, property_id")
          .in("property_id", propertyIds)
          .order("title", { ascending: true })
      : { data: [] };

  const rows = await loadOrgAccessRows(admin, organisationId);

  const spaceRows = (spaces || []) as Array<{
    id: string;
    title: string | null;
    property_id: string;
  }>;
  const propertyNameById = new Map(propertyRows.map((row) => [row.id, row.name]));
  const spaceTitleById = new Map(
    spaceRows.map((row) => [row.id, row.title ?? null])
  );

  const userIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))
  );
  const profileById = new Map<
    string,
    { first_name: string | null; last_name: string | null; full_name: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name, full_name")
      .in("id", userIds);
    for (const profile of (profiles || []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      full_name: string | null;
    }>) {
      profileById.set(profile.id, profile);
    }
  }

  const grants = rows.map((row) => {
    const profile = row.user_id ? profileById.get(row.user_id) : null;
    return toPublicAccessGrantView({
      id: row.id,
      status: row.status,
      role: row.role,
      email: row.email,
      userId: row.user_id,
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      fullName: profile?.full_name ?? null,
      propertyId: row.property_id,
      propertyName: row.property_id
        ? propertyNameById.get(row.property_id) ?? null
        : null,
      spaceId: row.space_id,
      spaceTitle: row.space_id ? spaceTitleById.get(row.space_id) ?? null : null,
      isPrimary: row.is_primary,
      notifyAllBookings: row.notify_all_bookings,
      invitedBy: row.invited_by,
      createdAt: row.created_at,
      activatedAt: row.activated_at,
      revokedAt: row.revoked_at,
      revokeReason: row.revoke_reason,
    });
  });

  return {
    organisation: organisation as { id: string; name: string; status: string },
    grants,
    properties: propertyRows,
    spaces: spaceRows.map((row) => ({
      id: row.id,
      title: row.title,
      propertyId: row.property_id,
    })),
  };
}

async function assertPropertyAndSpace(
  admin: SupabaseClient,
  organisationId: string,
  role: OrganisationAccessRole,
  propertyId: string | null,
  spaceId: string | null
): Promise<{ propertyId: string | null; spaceId: string | null }> {
  if (role === "org_admin") {
    return { propertyId: null, spaceId: null };
  }

  if (!propertyId) {
    throw new OrganisationAccessError(
      400,
      "Property Manager access needs exactly one property.",
      "invalid_scope"
    );
  }

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("id, organisation_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError || !property) {
    throw new OrganisationAccessError(400, "Property not found.", "property_not_found");
  }

  const propertyMismatch = validatePropertyBelongsToOrganisation({
    propertyOrganisationId:
      (property as { organisation_id: string | null }).organisation_id,
    organisationId,
  });
  if (propertyMismatch) {
    throw new OrganisationAccessError(
      propertyMismatch.status,
      propertyMismatch.error,
      propertyMismatch.code
    );
  }

  if (role === "property_manager") {
    return { propertyId, spaceId: null };
  }

  if (!spaceId) {
    throw new OrganisationAccessError(
      400,
      "Space Manager access needs exactly one space.",
      "invalid_scope"
    );
  }

  const { data: space, error: spaceError } = await admin
    .from("spaces")
    .select("id, property_id")
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceError || !space) {
    throw new OrganisationAccessError(400, "Space not found.", "space_not_found");
  }

  const spaceMismatch = validateSpaceBelongsToProperty({
    spacePropertyId: (space as { property_id: string | null }).property_id,
    propertyId,
  });
  if (spaceMismatch) {
    throw new OrganisationAccessError(
      spaceMismatch.status,
      spaceMismatch.error,
      spaceMismatch.code
    );
  }

  return { propertyId, spaceId };
}

export async function grantOrganisationAccess(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    actorKind: OrganisationAccessActorKind;
    grant: OrganisationAccessGrantInput;
  }
): Promise<PublicAccessGrantView> {
  const parsed = parseGrantInput(input.grant);
  if (!("ok" in parsed)) {
    throw new OrganisationAccessError(parsed.status, parsed.error, parsed.code);
  }

  const scoped = await assertPropertyAndSpace(
    admin,
    input.organisationId,
    parsed.role,
    parsed.propertyId,
    parsed.spaceId
  );

  const authUser = await lookupAuthUserByEmail(admin, parsed.emailNormalized);
  const activation = decideGrantActivation(authUser);
  const status = activation.status;
  const userId = activation.userId;
  const now = new Date().toISOString();

  const existing = await loadOrgAccessRows(admin, input.organisationId);
  const duplicate = findDuplicateGrant(existing.map(asAccessRow), {
    organisationId: input.organisationId,
    role: parsed.role,
    propertyId: scoped.propertyId,
    spaceId: scoped.spaceId,
    emailNormalized: parsed.emailNormalized,
    userId,
    status,
  });
  if (duplicate) {
    throw new OrganisationAccessError(
      409,
      duplicate.status === "pending"
        ? "This person already has a pending invitation for that role."
        : "This person already has that access.",
      "duplicate_grant"
    );
  }

  const insert = {
    organisation_id: input.organisationId,
    role: parsed.role,
    property_id: scoped.propertyId,
    space_id: scoped.spaceId,
    user_id: userId,
    email: parsed.emailNormalized,
    email_normalized: parsed.emailNormalized,
    status,
    is_primary: false,
    notify_all_bookings: parsed.role === "org_admin" ? parsed.notifyAllBookings : false,
    invited_by: input.actorUserId,
    activated_at: status === "active" ? now : null,
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
  };

  const { data, error } = await admin
    .from("organisation_access")
    .insert(insert)
    .select(ACCESS_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new OrganisationAccessError(
        409,
        "This person already has that access.",
        "duplicate_grant"
      );
    }
    throw new OrganisationAccessError(400, error.message, "insert_failed");
  }

  const row = data as AccessRow;

  if (parsed.isPrimary && row.role === "space_manager" && row.status === "active") {
    await admin.rpc("set_organisation_access_primary_space_manager", {
      p_access_id: row.id,
      p_is_primary: true,
    });
    row.is_primary = true;
  }

  await adminAudit(
    organisationAccessAuditEvent({
      action:
        status === "active"
          ? ORGANISATION_ACCESS_AUDIT.granted
          : ORGANISATION_ACCESS_AUDIT.pendingCreated,
      actorUserId: input.actorUserId,
      actorKind: input.actorKind,
      organisationId: input.organisationId,
      accessId: row.id,
      role: row.role,
      propertyId: row.property_id,
      spaceId: row.space_id,
      previous: null,
      next: {
        status: row.status,
        user_id: row.user_id,
        email: row.email_normalized,
      },
    })
  );

  return toPublicAccessGrantView({
    id: row.id,
    status: row.status,
    role: row.role,
    email: row.email,
    userId: row.user_id,
    propertyId: row.property_id,
    propertyName: null,
    spaceId: row.space_id,
    spaceTitle: null,
    isPrimary: row.is_primary,
    notifyAllBookings: row.notify_all_bookings,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  });
}

export async function revokeOrganisationAccess(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    actorKind: OrganisationAccessActorKind;
    accessId: string;
    reason?: string | null;
  }
): Promise<PublicAccessGrantView> {
  if (!isUuid(input.accessId)) {
    throw new OrganisationAccessError(400, "Invalid access id.", "invalid_id");
  }

  const rows = await loadOrgAccessRows(admin, input.organisationId);
  const row = rows.find((item) => item.id === input.accessId);
  if (!row) {
    throw new OrganisationAccessError(404, "Access record not found.", "not_found");
  }
  if (row.status === "revoked") {
    throw new OrganisationAccessError(409, "Access is already removed.", "already_revoked");
  }

  const activeOrgAdminCount = countActiveOrgAdmins(rows);
  if (
    !canRevokeLastOrgAdmin({
      targetRole: row.role,
      targetStatus: row.status,
      activeOrgAdminCount,
    })
  ) {
    throw new OrganisationAccessError(
      409,
      "An organisation must keep at least one Organisation Admin.",
      "last_active_org_admin_required"
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("organisation_access")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by: input.actorUserId,
      revoke_reason: input.reason?.trim() || null,
      is_primary: false,
    })
    .eq("id", row.id)
    .eq("organisation_id", input.organisationId)
    .select(ACCESS_SELECT)
    .single();

  if (error) {
    if (error.message?.includes("last_active_org_admin_required")) {
      throw new OrganisationAccessError(
        409,
        "An organisation must keep at least one Organisation Admin.",
        "last_active_org_admin_required"
      );
    }
    throw new OrganisationAccessError(400, error.message, "revoke_failed");
  }

  const updated = data as AccessRow;
  await adminAudit(
    organisationAccessAuditEvent({
      action: ORGANISATION_ACCESS_AUDIT.revoked,
      actorUserId: input.actorUserId,
      actorKind: input.actorKind,
      organisationId: input.organisationId,
      accessId: updated.id,
      role: updated.role,
      propertyId: updated.property_id,
      spaceId: updated.space_id,
      reason: input.reason?.trim() || null,
      previous: { status: row.status, user_id: row.user_id },
      next: { status: "revoked", revoked_by: input.actorUserId },
    })
  );

  return toPublicAccessGrantView({
    id: updated.id,
    status: updated.status,
    role: updated.role,
    email: updated.email,
    userId: updated.user_id,
    propertyId: updated.property_id,
    propertyName: null,
    spaceId: updated.space_id,
    spaceTitle: null,
    isPrimary: updated.is_primary,
    notifyAllBookings: updated.notify_all_bookings,
    invitedBy: updated.invited_by,
    createdAt: updated.created_at,
    activatedAt: updated.activated_at,
    revokedAt: updated.revoked_at,
    revokeReason: updated.revoke_reason,
  });
}

export async function setOrganisationAccessNotifyPreference(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    actorKind: OrganisationAccessActorKind;
    accessId: string;
    notifyAllBookings: boolean;
  }
): Promise<PublicAccessGrantView> {
  if (!isUuid(input.accessId)) {
    throw new OrganisationAccessError(400, "Invalid access id.", "invalid_id");
  }

  const rows = await loadOrgAccessRows(admin, input.organisationId);
  const row = rows.find((item) => item.id === input.accessId);
  if (!row) {
    throw new OrganisationAccessError(404, "Access record not found.", "not_found");
  }
  if (row.role !== "org_admin") {
    throw new OrganisationAccessError(
      400,
      "Booking email preference applies to Organisation Admins only.",
      "invalid_notify"
    );
  }
  if (row.status === "revoked") {
    throw new OrganisationAccessError(409, "Access is already removed.", "already_revoked");
  }

  const { data, error } = await admin
    .from("organisation_access")
    .update({ notify_all_bookings: Boolean(input.notifyAllBookings) })
    .eq("id", row.id)
    .eq("organisation_id", input.organisationId)
    .select(ACCESS_SELECT)
    .single();

  if (error) {
    throw new OrganisationAccessError(400, error.message, "notify_failed");
  }

  const updated = data as AccessRow;
  await adminAudit(
    organisationAccessAuditEvent({
      action: ORGANISATION_ACCESS_AUDIT.notifyPreferenceChanged,
      actorUserId: input.actorUserId,
      actorKind: input.actorKind,
      organisationId: input.organisationId,
      accessId: updated.id,
      role: updated.role,
      previous: { notify_all_bookings: row.notify_all_bookings },
      next: { notify_all_bookings: updated.notify_all_bookings },
    })
  );

  return toPublicAccessGrantView({
    id: updated.id,
    status: updated.status,
    role: updated.role,
    email: updated.email,
    userId: updated.user_id,
    propertyId: updated.property_id,
    propertyName: null,
    spaceId: updated.space_id,
    spaceTitle: null,
    isPrimary: updated.is_primary,
    notifyAllBookings: updated.notify_all_bookings,
    invitedBy: updated.invited_by,
    createdAt: updated.created_at,
    activatedAt: updated.activated_at,
    revokedAt: updated.revoked_at,
    revokeReason: updated.revoke_reason,
  });
}

export async function setOrganisationAccessPrimary(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    actorKind: OrganisationAccessActorKind;
    accessId: string;
    isPrimary: boolean;
  }
): Promise<{ previousPrimaryId: string | null; grant: PublicAccessGrantView }> {
  if (!isUuid(input.accessId)) {
    throw new OrganisationAccessError(400, "Invalid access id.", "invalid_id");
  }

  const rows = await loadOrgAccessRows(admin, input.organisationId);
  const row = rows.find((item) => item.id === input.accessId);
  if (!row) {
    throw new OrganisationAccessError(404, "Access record not found.", "not_found");
  }
  if (row.role !== "space_manager" || row.status !== "active") {
    throw new OrganisationAccessError(
      400,
      "Only an active Space Manager can be marked as primary.",
      "invalid_primary"
    );
  }

  const { data, error } = await admin.rpc(
    "set_organisation_access_primary_space_manager",
    {
      p_access_id: row.id,
      p_is_primary: Boolean(input.isPrimary),
    }
  );

  if (error) {
    throw new OrganisationAccessError(400, error.message, "primary_failed");
  }

  const rpc = (data || {}) as {
    previous_primary_id?: string | null;
    is_primary?: boolean;
  };

  await adminAudit(
    organisationAccessAuditEvent({
      action: ORGANISATION_ACCESS_AUDIT.primaryChanged,
      actorUserId: input.actorUserId,
      actorKind: input.actorKind,
      organisationId: input.organisationId,
      accessId: row.id,
      role: row.role,
      propertyId: row.property_id,
      spaceId: row.space_id,
      previous: { primary_id: rpc.previous_primary_id ?? null },
      next: { primary_id: input.isPrimary ? row.id : null },
    })
  );

  const refreshed = await loadOrgAccessRows(admin, input.organisationId);
  const updated = refreshed.find((item) => item.id === row.id) ?? row;

  return {
    previousPrimaryId: rpc.previous_primary_id ?? null,
    grant: toPublicAccessGrantView({
      id: updated.id,
      status: updated.status,
      role: updated.role,
      email: updated.email,
      userId: updated.user_id,
      propertyId: updated.property_id,
      propertyName: null,
      spaceId: updated.space_id,
      spaceTitle: null,
      isPrimary: updated.is_primary,
      notifyAllBookings: updated.notify_all_bookings,
      invitedBy: updated.invited_by,
      createdAt: updated.created_at,
      activatedAt: updated.activated_at,
      revokedAt: updated.revoked_at,
      revokeReason: updated.revoke_reason,
    }),
  };
}

export async function reassignOrganisationAccess(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    actorKind: OrganisationAccessActorKind;
    accessId: string;
    propertyId?: string | null;
    spaceId?: string | null;
  }
): Promise<PublicAccessGrantView> {
  if (!isUuid(input.accessId)) {
    throw new OrganisationAccessError(400, "Invalid access id.", "invalid_id");
  }

  const rows = await loadOrgAccessRows(admin, input.organisationId);
  const row = rows.find((item) => item.id === input.accessId);
  if (!row) {
    throw new OrganisationAccessError(404, "Access record not found.", "not_found");
  }
  if (row.status === "revoked") {
    throw new OrganisationAccessError(409, "Access is already removed.", "already_revoked");
  }
  if (row.role === "org_admin") {
    throw new OrganisationAccessError(
      400,
      "Organisation Admin access is for the whole organisation.",
      "invalid_scope"
    );
  }

  let spaceRow: { id: string; property_id: string | null } | null = null;
  let propertyRow: { id: string; organisation_id: string | null } | null = null;

  if (row.role === "space_manager") {
    if (!input.spaceId || !isUuid(input.spaceId)) {
      throw new OrganisationAccessError(
        400,
        "Space Manager access needs exactly one space.",
        "invalid_scope"
      );
    }
    const { data: space, error: spaceError } = await admin
      .from("spaces")
      .select("id, property_id")
      .eq("id", input.spaceId)
      .maybeSingle();
    if (spaceError || !space) {
      throw new OrganisationAccessError(400, "Space not found.", "space_not_found");
    }
    spaceRow = space as { id: string; property_id: string | null };
    if (!spaceRow.property_id) {
      throw new OrganisationAccessError(
        400,
        "That space does not belong to this organisation.",
        "property_scope_mismatch"
      );
    }
    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id, organisation_id")
      .eq("id", spaceRow.property_id)
      .maybeSingle();
    if (propertyError || !property) {
      throw new OrganisationAccessError(
        400,
        "That space does not belong to this organisation.",
        "property_scope_mismatch"
      );
    }
    propertyRow = property as { id: string; organisation_id: string | null };
  } else {
    if (!input.propertyId || !isUuid(input.propertyId)) {
      throw new OrganisationAccessError(
        400,
        "Property Manager access needs exactly one property.",
        "invalid_scope"
      );
    }
    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id, organisation_id")
      .eq("id", input.propertyId)
      .maybeSingle();
    if (propertyError || !property) {
      throw new OrganisationAccessError(400, "Property not found.", "property_not_found");
    }
    propertyRow = property as { id: string; organisation_id: string | null };
  }

  const scoped = resolveManagerReassignScope({
    role: row.role,
    organisationId: input.organisationId,
    requestedPropertyId: input.propertyId ?? null,
    requestedSpaceId: input.spaceId ?? null,
    space: spaceRow
      ? { id: spaceRow.id, propertyId: spaceRow.property_id }
      : null,
    property: propertyRow
      ? { id: propertyRow.id, organisationId: propertyRow.organisation_id }
      : null,
  });
  if (!("propertyId" in scoped)) {
    throw new OrganisationAccessError(scoped.status, scoped.error, scoped.code);
  }

  const nextIsPrimary = primaryFlagAfterSpaceReassign({
    previousSpaceId: row.space_id,
    nextSpaceId: scoped.spaceId,
    wasPrimary: row.is_primary,
  });

  const duplicate = findDuplicateGrant(
    rows.filter((item) => item.id !== row.id).map(asAccessRow),
    {
      organisationId: input.organisationId,
      role: row.role,
      propertyId: scoped.propertyId,
      spaceId: scoped.spaceId,
      emailNormalized: row.email_normalized,
      userId: row.user_id,
      status: row.status === "active" ? "active" : "pending",
    }
  );
  if (duplicate) {
    throw new OrganisationAccessError(
      409,
      "This person already has that access.",
      "duplicate_grant"
    );
  }

  const { data, error } = await admin
    .from("organisation_access")
    .update({
      property_id: scoped.propertyId,
      space_id: scoped.spaceId,
      is_primary: nextIsPrimary,
    })
    .eq("id", row.id)
    .eq("organisation_id", input.organisationId)
    .select(ACCESS_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new OrganisationAccessError(
        409,
        "This person already has that access.",
        "duplicate_grant"
      );
    }
    throw new OrganisationAccessError(400, error.message, "reassign_failed");
  }

  const updated = data as AccessRow;
  await adminAudit(
    organisationAccessAuditEvent({
      action: ORGANISATION_ACCESS_AUDIT.reassigned,
      actorUserId: input.actorUserId,
      actorKind: input.actorKind,
      organisationId: input.organisationId,
      accessId: updated.id,
      role: updated.role,
      propertyId: updated.property_id,
      spaceId: updated.space_id,
      previous: {
        property_id: row.property_id,
        space_id: row.space_id,
        is_primary: row.is_primary,
      },
      next: {
        property_id: updated.property_id,
        space_id: updated.space_id,
        is_primary: updated.is_primary,
      },
    })
  );

  return toPublicAccessGrantView({
    id: updated.id,
    status: updated.status,
    role: updated.role,
    email: updated.email,
    userId: updated.user_id,
    propertyId: updated.property_id,
    propertyName: null,
    spaceId: updated.space_id,
    spaceTitle: null,
    isPrimary: updated.is_primary,
    notifyAllBookings: updated.notify_all_bookings,
    invitedBy: updated.invited_by,
    createdAt: updated.created_at,
    activatedAt: updated.activated_at,
    revokedAt: updated.revoked_at,
    revokeReason: updated.revoke_reason,
  });
}
