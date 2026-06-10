/** Public marketplace visibility / interaction mode (separate from workflow status). */

export const PUBLIC_LISTING_MODES = ["off", "enquiry", "live"] as const;

export type PublicListingMode = (typeof PUBLIC_LISTING_MODES)[number];

export const PUBLIC_LISTING_MODE_OFF = "off" as const;
export const PUBLIC_LISTING_MODE_ENQUIRY = "enquiry" as const;
export const PUBLIC_LISTING_MODE_LIVE = "live" as const;

/** Statuses where admin may set enquiry mode (without override). */
export const ADMIN_ENQUIRY_ELIGIBLE_STATUSES = [
  "draft",
  "unclaimed",
  "owner_claimed",
  "pending_verification",
  "active",
] as const;

export const ADMIN_ENQUIRY_BLOCKED_STATUSES = ["rejected", "deleted"] as const;

export type SpaceListingModeFields = {
  status?: string | null;
  public_listing_mode?: string | null;
};

export function normalizePublicListingMode(
  mode: string | null | undefined
): PublicListingMode {
  if (mode === PUBLIC_LISTING_MODE_ENQUIRY) return PUBLIC_LISTING_MODE_ENQUIRY;
  if (mode === PUBLIC_LISTING_MODE_LIVE) return PUBLIC_LISTING_MODE_LIVE;
  return PUBLIC_LISTING_MODE_OFF;
}

export function isPublicListingMode(
  mode: string | null | undefined
): mode is typeof PUBLIC_LISTING_MODE_ENQUIRY | typeof PUBLIC_LISTING_MODE_LIVE {
  return (
    mode === PUBLIC_LISTING_MODE_ENQUIRY || mode === PUBLIC_LISTING_MODE_LIVE
  );
}

export function isEnquiryListingMode(mode: string | null | undefined): boolean {
  return mode === PUBLIC_LISTING_MODE_ENQUIRY;
}

export function isLiveBookableMode(mode: string | null | undefined): boolean {
  return mode === PUBLIC_LISTING_MODE_LIVE;
}

export function isSpacePubliclyVisible(
  space: SpaceListingModeFields | string | null | undefined
): boolean {
  if (typeof space === "string") {
    return isPublicListingMode(space);
  }
  return isPublicListingMode(space?.public_listing_mode);
}

export function canAdminSetEnquiryMode(
  status: string | null | undefined,
  options?: { overrideNeedsChanges?: boolean }
): boolean {
  const s = status || "";
  if ((ADMIN_ENQUIRY_BLOCKED_STATUSES as readonly string[]).includes(s)) {
    return false;
  }
  if (s === "needs_changes") {
    return Boolean(options?.overrideNeedsChanges);
  }
  return (ADMIN_ENQUIRY_ELIGIBLE_STATUSES as readonly string[]).includes(s);
}

export function publicListingModeLabel(
  mode: string | null | undefined
): string {
  switch (normalizePublicListingMode(mode)) {
    case PUBLIC_LISTING_MODE_ENQUIRY:
      return "Public enquiry-only";
    case PUBLIC_LISTING_MODE_LIVE:
      return "Live / bookable";
    default:
      return "Hidden";
  }
}
