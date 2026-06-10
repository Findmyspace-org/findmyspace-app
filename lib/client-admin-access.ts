import { isPlatformAdminRole } from "@/lib/admin-roles";

/** Client-side check for admin workspace pages (admin or super_admin). */
export function hasAdminUiAccess(
  role: string | null | undefined,
  adminAccessDisabled?: boolean | null
): boolean {
  if (adminAccessDisabled) return false;
  return isPlatformAdminRole(role);
}
