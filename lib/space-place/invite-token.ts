import { randomBytes } from "crypto";

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function inviteExpiresAt(days = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function buildSpacerInviteUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/space-place/join?token=${encodeURIComponent(token)}`;
}
