import type { CrmProfile } from "./types";

export const SPACE_PLACE_ACCESS_DENIED_MESSAGE =
  "The Space Place is only for invited FindMySpace Spacers.";

export const SPACER_INVITE_HELPER =
  "Spacers are people who help FindMySpace sign up spaces.";

export const SPACER_INVITE_DISCLAIMER =
  "Spacers are internal acquisition team members. This is not for property owners or renters.";

export function isSpacePlaceRole(
  role: string | null | undefined
): role is "admin" | "spacer" | "office_manager" {
  return role === "admin" || role === "spacer" || role === "office_manager";
}

/** Admins and office managers (task managers). */
export function isCrmTaskManager(role: string | null | undefined): boolean {
  return role === "admin" || role === "office_manager";
}

/** Full organisation/contact visibility (not restricted to assigned_to). */
export function canViewAllCrmOrganisations(
  role: string | null | undefined
): boolean {
  return isCrmTaskManager(role);
}

/** Admins and office managers can reassign any task from the UI. */
export function canReassignCrmTasks(role: string | null | undefined): boolean {
  return isCrmTaskManager(role);
}

/** Admins and office managers can import/link CRM emails. */
export function canManageCrmEmail(role: string | null | undefined): boolean {
  return canReassignCrmTasks(role);
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
