import { createHash, randomBytes } from "crypto";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

export const PROPERTY_INVITE_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;

export type PropertyInviteStatus = (typeof PROPERTY_INVITE_STATUSES)[number];

export function generatePropertyInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPropertyInviteToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function propertyInviteExpiresAt(days = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function buildPropertyInviteUrl(token: string): string {
  const base = getCanonicalPublicSiteUrl();
  return `${base.replace(/\/$/, "")}/property-invite/${encodeURIComponent(token)}`;
}

export function isPropertyInviteExpired(
  expiresAt: string | null | undefined
): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

export type PropertyInviteRow = {
  id: string;
  property_id: string;
  token_hash: string;
  owner_email: string;
  created_by: string | null;
  accepted_by: string | null;
  status: PropertyInviteStatus | string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export function resolvePropertyInviteStatus(
  row: Pick<PropertyInviteRow, "status" | "expires_at">
): PropertyInviteStatus {
  if (row.status === "pending" && isPropertyInviteExpired(row.expires_at)) {
    return "expired";
  }
  return row.status as PropertyInviteStatus;
}

export function publicPropertyInviteFields(row: PropertyInviteRow) {
  const status = resolvePropertyInviteStatus(row);
  return {
    id: row.id,
    property_id: row.property_id,
    owner_email: row.owner_email,
    created_by: row.created_by,
    accepted_by: row.accepted_by,
    status,
    expires_at: row.expires_at,
    used_at: row.used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  };
}
