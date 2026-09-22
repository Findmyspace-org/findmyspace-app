export const ORGANISATION_COMMERCIAL_AUDIT = {
  created: "organisation.created",
  commercialUpdated: "organisation.commercial.updated",
  verificationSubmitted: "organisation.verification.submitted",
  verificationResubmitted: "organisation.verification.resubmitted",
  verificationVerified: "organisation.verification.verified",
  verificationRejected: "organisation.verification.rejected",
  bankSubmitted: "organisation.bank.submitted",
  bankUpdated: "organisation.bank.updated",
  bankSuperseded: "organisation.bank.superseded",
  bankVerified: "organisation.bank.verified",
  bankRejected: "organisation.bank.rejected",
} as const;

export type OrganisationCommercialAuditAction =
  (typeof ORGANISATION_COMMERCIAL_AUDIT)[keyof typeof ORGANISATION_COMMERCIAL_AUDIT];

export type OrganisationCommercialActorKind =
  | "global_admin"
  | "organisation_admin";

export function organisationCommercialActorKind(isGlobalAdmin: boolean): OrganisationCommercialActorKind {
  return isGlobalAdmin ? "global_admin" : "organisation_admin";
}

export function organisationCommercialAuditEvent(input: {
  action: OrganisationCommercialAuditAction;
  actorUserId: string;
  actorKind: OrganisationCommercialActorKind;
  organisationId: string;
  targetType?: string;
  targetId?: string | null;
  reason?: string | null;
  method?: string | null;
  previous?: Record<string, unknown> | null;
  next?: Record<string, unknown> | null;
}): {
  action: OrganisationCommercialAuditAction;
  actorUserId: string;
  targetType: string;
  targetId: string;
  reason?: string;
  meta: Record<string, unknown>;
} {
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    targetType: input.targetType ?? "organisation",
    targetId: input.targetId ?? input.organisationId,
    reason: input.reason ?? undefined,
    meta: {
      actor_kind: input.actorKind,
      organisation_id: input.organisationId,
      method: input.method ?? null,
      previous: input.previous ?? null,
      next: input.next ?? null,
    },
  };
}
