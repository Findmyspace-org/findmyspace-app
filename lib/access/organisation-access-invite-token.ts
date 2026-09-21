import { createHash, randomBytes } from "crypto";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

export const ORGANISATION_ACCESS_INVITE_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;

export type OrganisationAccessInviteStatus =
  (typeof ORGANISATION_ACCESS_INVITE_STATUSES)[number];

export function generateOrganisationAccessInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashOrganisationAccessInviteToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function organisationAccessInviteExpiresAt(days = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function buildOrganisationAccessInviteUrl(token: string): string {
  const base = getCanonicalPublicSiteUrl();
  return `${base.replace(/\/$/, "")}/organisation-invite/${encodeURIComponent(token)}`;
}

export function isOrganisationAccessInviteExpired(
  expiresAt: string | null | undefined,
  now = Date.now()
): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < now;
}

export type OrganisationAccessInviteRow = {
  id: string;
  organisation_access_id: string;
  organisation_id: string;
  email: string;
  email_normalized: string;
  token_hash: string;
  status: OrganisationAccessInviteStatus | string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  accepted_by: string | null;
  revoked_by: string | null;
};

export function resolveOrganisationAccessInviteStatus(
  row: Pick<OrganisationAccessInviteRow, "status" | "expires_at">,
  now = Date.now()
): OrganisationAccessInviteStatus {
  if (row.status === "pending" && isOrganisationAccessInviteExpired(row.expires_at, now)) {
    return "expired";
  }
  return row.status as OrganisationAccessInviteStatus;
}

export function invitationEmailSent(result: { ok?: boolean } | null | undefined): boolean {
  return result?.ok === true;
}
