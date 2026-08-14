import { createHash, randomBytes } from "crypto";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

export const SPACE_MANAGER_INVITE_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;

export type SpaceManagerInviteStatus =
  (typeof SPACE_MANAGER_INVITE_STATUSES)[number];

export function generateSpaceManagerInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSpaceManagerInviteToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function spaceManagerInviteExpiresAt(days = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function buildSpaceManagerInviteUrl(token: string): string {
  const base = getCanonicalPublicSiteUrl();
  return `${base.replace(/\/$/, "")}/space-manager-invite/${encodeURIComponent(token)}`;
}

export function isSpaceManagerInviteExpired(
  expiresAt: string | null | undefined
): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}
