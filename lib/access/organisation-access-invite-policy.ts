import { normalizeOrganisationAccessEmail } from "@/lib/access/organisation-access-email";
import { resolveOrganisationAccessInviteStatus } from "@/lib/access/organisation-access-invite-token";
import type { OrganisationAccessRole } from "@/lib/access/roles";

export const ORGANISATION_INVITE_EMAIL_MISMATCH_MESSAGE =
  "This invitation was sent to another email address. Sign in with the invited email to continue.";

export type OrganisationInviteAcceptanceInput = {
  presentedTokenHash: string;
  invitation: {
    organisationAccessId: string;
    organisationId: string;
    emailNormalized: string;
    tokenHash: string;
    status: string;
    expiresAt: string;
  };
  access: {
    id: string;
    organisationId: string;
    status: string;
    emailNormalized: string;
    role: OrganisationAccessRole | string;
    userId: string | null;
  };
  organisation: {
    id: string;
    status: string;
  };
  session: {
    userId: string;
    emailNormalized: string | null;
  };
  now?: number;
};

export type OrganisationInviteAcceptanceDenied = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

export type OrganisationInviteAcceptanceAllowed = {
  ok: true;
};

export function organisationAccessRoleLabel(role: string): string {
  if (role === "org_admin") return "Organisation Admin";
  if (role === "property_manager") return "Property Manager";
  if (role === "space_manager") return "Space Manager";
  return role;
}

export function invitationEmailsMatch(input: {
  sessionEmail: string | null | undefined;
  invitationEmail: string | null | undefined;
  grantEmail: string | null | undefined;
}): boolean {
  const sessionEmail = normalizeOrganisationAccessEmail(input.sessionEmail);
  const invitationEmail = normalizeOrganisationAccessEmail(input.invitationEmail);
  const grantEmail = normalizeOrganisationAccessEmail(input.grantEmail);
  return Boolean(
    sessionEmail &&
      invitationEmail &&
      grantEmail &&
      sessionEmail === invitationEmail &&
      sessionEmail === grantEmail
  );
}

export function evaluateOrganisationInviteAcceptance(
  input: OrganisationInviteAcceptanceInput
): OrganisationInviteAcceptanceAllowed | OrganisationInviteAcceptanceDenied {
  if (!input.session.userId) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Unauthorized.",
    };
  }

  if (input.presentedTokenHash !== input.invitation.tokenHash) {
    return {
      ok: false,
      status: 404,
      code: "invitation_not_found",
      error: "Invitation link not found.",
    };
  }

  const inviteStatus = resolveOrganisationAccessInviteStatus(
    {
      status: input.invitation.status,
      expires_at: input.invitation.expiresAt,
    },
    input.now
  );

  if (inviteStatus === "expired") {
    return {
      ok: false,
      status: 400,
      code: "invitation_expired",
      error: "This invitation link has expired.",
    };
  }

  if (inviteStatus === "revoked") {
    return {
      ok: false,
      status: 400,
      code: "invitation_revoked",
      error: "This invitation is no longer valid.",
    };
  }

  if (inviteStatus === "accepted") {
    return {
      ok: false,
      status: 400,
      code: "invitation_accepted",
      error: "This invitation has already been accepted.",
    };
  }

  if (inviteStatus !== "pending") {
    return {
      ok: false,
      status: 400,
      code: "invitation_invalid",
      error: "This invitation is no longer valid.",
    };
  }

  if (
    input.access.id !== input.invitation.organisationAccessId ||
    input.access.organisationId !== input.invitation.organisationId ||
    input.organisation.id !== input.invitation.organisationId
  ) {
    return {
      ok: false,
      status: 400,
      code: "invitation_invalid",
      error: "This invitation is no longer valid.",
    };
  }

  if (input.organisation.status !== "active") {
    return {
      ok: false,
      status: 400,
      code: "organisation_inactive",
      error: "This organisation is no longer active.",
    };
  }

  if (input.access.status === "revoked") {
    return {
      ok: false,
      status: 400,
      code: "access_revoked",
      error: "This invitation is no longer valid.",
    };
  }

  if (input.access.status === "active" || input.access.userId) {
    return {
      ok: false,
      status: 400,
      code: "access_not_pending",
      error: "This invitation is no longer valid.",
    };
  }

  if (input.access.status !== "pending") {
    return {
      ok: false,
      status: 400,
      code: "access_not_pending",
      error: "This invitation is no longer valid.",
    };
  }

  if (
    !invitationEmailsMatch({
      sessionEmail: input.session.emailNormalized,
      invitationEmail: input.invitation.emailNormalized,
      grantEmail: input.access.emailNormalized,
    })
  ) {
    return {
      ok: false,
      status: 403,
      code: "invitation_email_mismatch",
      error: ORGANISATION_INVITE_EMAIL_MISMATCH_MESSAGE,
    };
  }

  return { ok: true };
}
