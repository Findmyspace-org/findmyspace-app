import type { CrmProfile } from "./types";

export const SPACE_PLACE_ACCESS_DENIED_MESSAGE =
  "The Space Place is only for invited FindMySpace Spacers.";

export const SPACER_INVITE_HELPER =
  "Spacers are people who help FindMySpace sign up spaces.";

export const SPACER_INVITE_DISCLAIMER =
  "Spacers are internal acquisition team members. This is not for property owners or renters.";

export function isSpacePlaceRole(
  role: string | null | undefined
): role is "admin" | "spacer" {
  return role === "admin" || role === "spacer";
}

export function hasSpacePlaceAccess(
  profile: Pick<CrmProfile, "active" | "role"> | null | undefined
): boolean {
  if (!profile?.active) return false;
  return isSpacePlaceRole(profile.role);
}

export function canAccessSpacePlaceTeam(role: string | null | undefined): boolean {
  return role === "admin";
}
