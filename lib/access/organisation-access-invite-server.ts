import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import { buildOrganisationAccessInviteCopy } from "@/lib/communication-copy";
import { adminAudit } from "@/lib/admin-audit";
import {
  ORGANISATION_ACCESS_AUDIT,
  organisationAccessAuditEvent,
  type OrganisationAccessActorKind,
} from "@/lib/access/organisation-access-audit";
import { OrganisationAccessError } from "@/lib/access/organisation-access-error";
import { normalizeOrganisationAccessEmail } from "@/lib/access/organisation-access-email";
import {
  ORGANISATION_INVITE_EMAIL_MISMATCH_MESSAGE,
  evaluateOrganisationInviteAcceptance,
  organisationAccessRoleLabel,
} from "@/lib/access/organisation-access-invite-policy";
import {
  buildOrganisationAccessInviteUrl,
  generateOrganisationAccessInviteToken,
  hashOrganisationAccessInviteToken,
  invitationEmailSent,
  organisationAccessInviteExpiresAt,
  resolveOrganisationAccessInviteStatus,
  type OrganisationAccessInviteRow,
} from "@/lib/access/organisation-access-invite-token";
import { organisationWorkspaceHref } from "@/lib/access/organisation-workspace";
import type { OrganisationAccessRole } from "@/lib/access/roles";

type AccessInviteContext = {
  id: string;
  organisation_id: string;
  role: OrganisationAccessRole | string;
  property_id: string | null;
  space_id: string | null;
  email: string;
  email_normalized: string;
  status: string;
  user_id: string | null;
};

export type OrganisationInvitePreview =
  | {
      valid: true;
      organisationName: string;
      role: string;
      roleLabel: string;
      headline: string;
      propertyName: string | null;
      spaceTitle: string | null;
      invitedEmail: string;
      expiresAt: string;
    }
  | { valid: false; error: string; status?: string };

export type IssueOrganisationAccessInvitationResult = {
  invitationId: string;
  emailSent: boolean;
};

export async function revokePendingOrganisationAccessInvitations(
  admin: SupabaseClient,
  accessId: string,
  actorUserId: string | null
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("organisation_access_invitations")
    .update({
      status: "revoked",
      revoked_at: nowIso,
      revoked_by: actorUserId,
    })
    .eq("organisation_access_id", accessId)
    .eq("status", "pending");

  if (error) {
    console.error("[organisation-invite] revoke pending invitations failed", error);
  }
}

async function expireInvitationIfNeeded(
  admin: SupabaseClient,
  token: OrganisationAccessInviteRow
) {
  const status = resolveOrganisationAccessInviteStatus(token);
  if (status === "expired" && token.status === "pending") {
    await admin
      .from("organisation_access_invitations")
      .update({ status: "expired" })
      .eq("id", token.id)
      .eq("status", "pending");
  }
  return status;
}

async function loadInvitationContextNames(
  admin: SupabaseClient,
  access: AccessInviteContext
): Promise<{
  organisationName: string;
  propertyName: string | null;
  spaceTitle: string | null;
  organisationStatus: string | null;
}> {
  const { data: organisation } = await admin
    .from("organisations")
    .select("id, name, status")
    .eq("id", access.organisation_id)
    .maybeSingle();

  let propertyName: string | null = null;
  if (access.property_id) {
    const { data: property } = await admin
      .from("properties")
      .select("id, name")
      .eq("id", access.property_id)
      .maybeSingle();
    propertyName = (property as { name?: string } | null)?.name?.trim() || null;
  }

  let spaceTitle: string | null = null;
  if (access.space_id) {
    const { data: space } = await admin
      .from("spaces")
      .select("id, title")
      .eq("id", access.space_id)
      .maybeSingle();
    spaceTitle = (space as { title?: string | null } | null)?.title?.trim() || null;
  }

  return {
    organisationName:
      (organisation as { name?: string } | null)?.name?.trim() || "this organisation",
    propertyName,
    spaceTitle,
    organisationStatus: (organisation as { status?: string } | null)?.status ?? null,
  };
}

async function sendOrganisationAccessInviteEmail(params: {
  to: string;
  organisationName: string;
  role: string;
  propertyName: string | null;
  spaceTitle: string | null;
  inviteUrl: string;
}): Promise<boolean> {
  const copy = buildOrganisationAccessInviteCopy({
    organisationName: params.organisationName,
    role: params.role,
    propertyName: params.propertyName,
    spaceTitle: params.spaceTitle,
  });
  const rendered = renderEmailLayout({
    preheader: copy.emailPreheader,
    title: copy.emailTitle,
    bodyLines: copy.emailBodyLines,
    primaryCTA: { label: copy.ctaLabel, href: params.inviteUrl },
    footerRole: copy.emailFooterRole,
  });

  const result = await sendEmail({
    to: params.to,
    subject: copy.emailSubject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!invitationEmailSent(result)) {
    console.error("[organisation-invite] invitation email was not sent", {
      to: params.to,
      subject: copy.emailSubject,
    });
    return false;
  }
  return true;
}

export async function issueOrganisationAccessInvitation(
  admin: SupabaseClient,
  params: {
    access: AccessInviteContext;
    actorUserId: string;
    actorKind: OrganisationAccessActorKind;
    auditAction:
      | typeof ORGANISATION_ACCESS_AUDIT.invitationCreated
      | typeof ORGANISATION_ACCESS_AUDIT.invitationResent;
  }
): Promise<IssueOrganisationAccessInvitationResult> {
  if (params.access.status !== "pending" || params.access.user_id) {
    throw new OrganisationAccessError(
      409,
      "Only pending invitations can be sent.",
      "access_not_pending"
    );
  }

  const names = await loadInvitationContextNames(admin, params.access);
  if (names.organisationStatus !== "active") {
    throw new OrganisationAccessError(
      400,
      "This organisation is no longer active.",
      "organisation_inactive"
    );
  }

  await revokePendingOrganisationAccessInvitations(
    admin,
    params.access.id,
    params.actorUserId
  );

  const rawToken = generateOrganisationAccessInviteToken();
  const tokenHash = hashOrganisationAccessInviteToken(rawToken);
  const expiresAt = organisationAccessInviteExpiresAt(14);

  const { data: inserted, error: insertErr } = await admin
    .from("organisation_access_invitations")
    .insert({
      organisation_access_id: params.access.id,
      organisation_id: params.access.organisation_id,
      email: params.access.email_normalized,
      email_normalized: params.access.email_normalized,
      token_hash: tokenHash,
      created_by: params.actorUserId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[organisation-invite] invitation insert failed", insertErr);
    throw new OrganisationAccessError(
      500,
      "Could not create the invitation.",
      "invitation_create_failed"
    );
  }

  const inviteUrl = buildOrganisationAccessInviteUrl(rawToken);
  const emailSent = await sendOrganisationAccessInviteEmail({
    to: params.access.email_normalized,
    organisationName: names.organisationName,
    role: params.access.role,
    propertyName: names.propertyName,
    spaceTitle: names.spaceTitle,
    inviteUrl,
  });

  await adminAudit(
    organisationAccessAuditEvent({
      action: params.auditAction,
      actorUserId: params.actorUserId,
      actorKind: params.actorKind,
      organisationId: params.access.organisation_id,
      accessId: params.access.id,
      role: params.access.role,
      propertyId: params.access.property_id,
      spaceId: params.access.space_id,
      next: {
        invitation_id: (inserted as { id: string }).id,
        email_sent: emailSent,
        expires_at: expiresAt,
      },
    })
  );

  return {
    invitationId: (inserted as { id: string }).id,
    emailSent,
  };
}

export async function loadOrganisationInvitePreview(
  admin: SupabaseClient,
  rawToken: string
): Promise<OrganisationInvitePreview> {
  const tokenHash = hashOrganisationAccessInviteToken(rawToken);
  const { data, error } = await admin
    .from("organisation_access_invitations")
    .select(
      "id, organisation_access_id, organisation_id, email, email_normalized, token_hash, status, expires_at, created_at, accepted_at, revoked_at, created_by, accepted_by, revoked_by"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, error: "Invitation link not found." };
  }

  const token = data as OrganisationAccessInviteRow;
  const status = await expireInvitationIfNeeded(admin, token);
  if (status !== "pending") {
    return {
      valid: false,
      error: "This invitation is no longer valid.",
      status,
    };
  }

  const { data: access, error: accessErr } = await admin
    .from("organisation_access")
    .select(
      "id, organisation_id, role, property_id, space_id, email, email_normalized, status, user_id"
    )
    .eq("id", token.organisation_access_id)
    .maybeSingle();

  if (accessErr || !access) {
    return { valid: false, error: "This invitation is no longer valid." };
  }

  const accessRow = access as AccessInviteContext;
  if (accessRow.status !== "pending" || accessRow.user_id) {
    return { valid: false, error: "This invitation is no longer valid." };
  }

  const names = await loadInvitationContextNames(admin, accessRow);
  if (names.organisationStatus !== "active") {
    return { valid: false, error: "This organisation is no longer active." };
  }

  const copy = buildOrganisationAccessInviteCopy({
    organisationName: names.organisationName,
    role: accessRow.role,
    propertyName: names.propertyName,
    spaceTitle: names.spaceTitle,
  });

  return {
    valid: true,
    organisationName: names.organisationName,
    role: accessRow.role,
    roleLabel: organisationAccessRoleLabel(accessRow.role),
    headline: copy.notificationMessage,
    propertyName: accessRow.role === "property_manager" ? names.propertyName : null,
    spaceTitle: accessRow.role === "space_manager" ? names.spaceTitle : null,
    invitedEmail: accessRow.email_normalized,
    expiresAt: token.expires_at,
  };
}

export async function acceptOrganisationAccessInvitation(
  admin: SupabaseClient,
  rawToken: string,
  session: { userId: string; email: string | null }
): Promise<{
  organisationId: string;
  role: string;
  redirectTo: string;
}> {
  const tokenHash = hashOrganisationAccessInviteToken(rawToken);
  const { data, error } = await admin
    .from("organisation_access_invitations")
    .select(
      "id, organisation_access_id, organisation_id, email, email_normalized, token_hash, status, expires_at, created_at, accepted_at, revoked_at, created_by, accepted_by, revoked_by"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    throw new OrganisationAccessError(404, "Invitation link not found.", "invitation_not_found");
  }

  const token = data as OrganisationAccessInviteRow;
  await expireInvitationIfNeeded(admin, token);

  const { data: access, error: accessErr } = await admin
    .from("organisation_access")
    .select(
      "id, organisation_id, role, property_id, space_id, email, email_normalized, status, user_id"
    )
    .eq("id", token.organisation_access_id)
    .maybeSingle();

  if (accessErr || !access) {
    throw new OrganisationAccessError(
      400,
      "This invitation is no longer valid.",
      "invitation_invalid"
    );
  }

  const accessRow = access as AccessInviteContext;
  const names = await loadInvitationContextNames(admin, accessRow);
  const evaluation = evaluateOrganisationInviteAcceptance({
    presentedTokenHash: tokenHash,
    invitation: {
      organisationAccessId: token.organisation_access_id,
      organisationId: token.organisation_id,
      emailNormalized: token.email_normalized,
      tokenHash: token.token_hash,
      status: resolveOrganisationAccessInviteStatus(token),
      expiresAt: token.expires_at,
    },
    access: {
      id: accessRow.id,
      organisationId: accessRow.organisation_id,
      status: accessRow.status,
      emailNormalized: accessRow.email_normalized,
      role: accessRow.role,
      userId: accessRow.user_id,
    },
    organisation: {
      id: accessRow.organisation_id,
      status: names.organisationStatus || "inactive",
    },
    session: {
      userId: session.userId,
      emailNormalized: normalizeOrganisationAccessEmail(session.email),
    },
  });

  if (!evaluation.ok) {
    throw new OrganisationAccessError(
      evaluation.status,
      evaluation.error,
      evaluation.code
    );
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", session.userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: session.userId,
        email: normalizeOrganisationAccessEmail(session.email),
      } as never,
      { onConflict: "id" }
    );
    if (profileErr) {
      console.error("[organisation-invite] profile backstop failed", profileErr);
      throw new OrganisationAccessError(
        500,
        "Could not initialize your profile.",
        "profile_failed"
      );
    }
  }

  const { data: rpcData, error: rpcError } = await admin.rpc(
    "accept_organisation_access_invitation",
    {
      p_user_id: session.userId,
      p_token_hash: tokenHash,
    }
  );

  if (rpcError) {
    const message = rpcError.message || "";
    if (message.includes("invitation_email_mismatch")) {
      throw new OrganisationAccessError(
        403,
        ORGANISATION_INVITE_EMAIL_MISMATCH_MESSAGE,
        "invitation_email_mismatch"
      );
    }
    if (message.includes("invitation_expired")) {
      throw new OrganisationAccessError(
        400,
        "This invitation link has expired.",
        "invitation_expired"
      );
    }
    if (message.includes("invitation_not_found")) {
      throw new OrganisationAccessError(
        404,
        "Invitation link not found.",
        "invitation_not_found"
      );
    }
    if (
      message.includes("invitation_revoked") ||
      message.includes("invitation_accepted") ||
      message.includes("access_not_pending") ||
      message.includes("organisation_inactive")
    ) {
      throw new OrganisationAccessError(
        400,
        "This invitation is no longer valid.",
        "invitation_invalid"
      );
    }
    throw new OrganisationAccessError(500, "Could not accept this invitation.", "accept_failed");
  }

  const payload = (rpcData ?? {}) as {
    organisation_id?: string;
    role?: string;
    access_id?: string;
    property_id?: string | null;
    space_id?: string | null;
  };

  await adminAudit(
    organisationAccessAuditEvent({
      action: ORGANISATION_ACCESS_AUDIT.invitationAccepted,
      actorUserId: session.userId,
      actorKind: "access_holder",
      organisationId: payload.organisation_id || accessRow.organisation_id,
      accessId: payload.access_id || accessRow.id,
      role: payload.role || accessRow.role,
      propertyId: payload.property_id ?? accessRow.property_id,
      spaceId: payload.space_id ?? accessRow.space_id,
      previous: { status: "pending", user_id: null },
      next: { status: "active", user_id: session.userId },
    })
  );

  const organisationId = payload.organisation_id || accessRow.organisation_id;
  const role = payload.role || accessRow.role;
  const redirectTo =
    role === "org_admin"
      ? organisationWorkspaceHref("/dashboard/people", organisationId)
      : organisationWorkspaceHref("/dashboard", organisationId);

  return { organisationId, role, redirectTo };
}
