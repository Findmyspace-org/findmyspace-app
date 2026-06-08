import { createHash, randomBytes } from "crypto";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

export const LISTING_CLAIM_TOKEN_STATUSES = [
  "pending",
  "claimed",
  "revoked",
  "expired",
] as const;

export type ListingClaimTokenStatus = (typeof LISTING_CLAIM_TOKEN_STATUSES)[number];

export const OWNER_CLAIMED_STATUS = "owner_claimed" as const;

export const CLAIMABLE_SPACE_STATUSES = ["draft", "unclaimed"] as const;

export function generateClaimToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function claimTokenExpiresAt(days = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function buildListingClaimUrl(token: string): string {
  const base = getCanonicalPublicSiteUrl();
  return `${base.replace(/\/$/, "")}/claim-listing/${encodeURIComponent(token)}`;
}

export function isClaimTokenExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

export type ClaimTokenRow = {
  id: string;
  listing_id: string;
  token_hash: string;
  owner_email: string | null;
  created_by: string | null;
  claimed_by: string | null;
  status: ListingClaimTokenStatus | string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ClaimableSpaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  city: string | null;
  suburb: string | null;
  space_type: string | null;
  status: string | null;
  owner_id: string | null;
  created_by_admin: boolean | null;
  claimed_at: string | null;
};

export function isSpaceClaimable(space: ClaimableSpaceRow): boolean {
  if (!space.created_by_admin) return false;
  if (space.owner_id) return false;
  if (space.status === "active") return false;
  return CLAIMABLE_SPACE_STATUSES.includes(
    (space.status || "") as (typeof CLAIMABLE_SPACE_STATUSES)[number]
  );
}

export function resolveClaimTokenStatus(
  row: Pick<ClaimTokenRow, "status" | "expires_at">
): ListingClaimTokenStatus {
  if (row.status === "pending" && isClaimTokenExpired(row.expires_at)) {
    return "expired";
  }
  return row.status as ListingClaimTokenStatus;
}

export function publicClaimTokenFields(row: ClaimTokenRow) {
  const status = resolveClaimTokenStatus(row);
  return {
    id: row.id,
    listing_id: row.listing_id,
    owner_email: row.owner_email,
    created_by: row.created_by,
    claimed_by: row.claimed_by,
    status,
    expires_at: row.expires_at,
    used_at: row.used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  };
}
