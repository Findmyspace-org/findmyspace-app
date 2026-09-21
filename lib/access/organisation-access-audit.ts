export const ORGANISATION_ACCESS_AUDIT = {
  granted: "organisation_access.granted",
  pendingCreated: "organisation_access.pending_created",
  activated: "organisation_access.activated",
  revoked: "organisation_access.revoked",
  primaryChanged: "organisation_access.primary_changed",
  notifyPreferenceChanged: "organisation_access.notify_preference_changed",
  reassigned: "organisation_access.reassigned",
  invitationCreated: "organisation_access.invitation_created",
  invitationResent: "organisation_access.invitation_resent",
  invitationAccepted: "organisation_access.invitation_accepted",
} as const;

export type OrganisationAccessAuditAction =
  (typeof ORGANISATION_ACCESS_AUDIT)[keyof typeof ORGANISATION_ACCESS_AUDIT];

export type OrganisationAccessActorKind =
  | "global_admin"
  | "organisation_admin"
  | "access_holder";

export function organisationAccessActorKind(input: {
  isGlobalAdmin?: boolean;
  selfActivation?: boolean;
}): OrganisationAccessActorKind {
  if (input.selfActivation) return "access_holder";
  if (input.isGlobalAdmin) return "global_admin";
  return "organisation_admin";
}

export function auditActorKindLabel(kind: unknown): string | null {
  if (kind === "global_admin") return "Global Admin";
  if (kind === "organisation_admin") return "Organisation Admin";
  if (kind === "access_holder") return "Access holder";
  return null;
}

export function organisationAccessAuditEvent(input: {
  action: OrganisationAccessAuditAction;
  actorUserId: string;
  actorKind: OrganisationAccessActorKind;
  organisationId: string;
  accessId: string;
  role?: string | null;
  propertyId?: string | null;
  spaceId?: string | null;
  previous?: Record<string, unknown> | null;
  next?: Record<string, unknown> | null;
  reason?: string | null;
}): {
  action: OrganisationAccessAuditAction;
  actorUserId: string;
  targetType: "organisation_access";
  targetId: string;
  reason?: string;
  meta: Record<string, unknown>;
} {
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    targetType: "organisation_access",
    targetId: input.accessId,
    reason: input.reason ?? undefined,
    meta: {
      actor_kind: input.actorKind,
      organisation_id: input.organisationId,
      role: input.role ?? null,
      property_id: input.propertyId ?? null,
      space_id: input.spaceId ?? null,
      previous: input.previous ?? null,
      next: input.next ?? null,
    },
  };
}
