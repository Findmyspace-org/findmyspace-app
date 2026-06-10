export const ADMIN_ROLE = "admin" as const;
export const SUPER_ADMIN_ROLE = "super_admin" as const;
export const DEFAULT_USER_ROLE = "user" as const;

export const PLATFORM_ADMIN_ROLES = [ADMIN_ROLE, SUPER_ADMIN_ROLE] as const;

export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];

export function isPlatformAdminRole(
  role: string | null | undefined
): role is PlatformAdminRole {
  return PLATFORM_ADMIN_ROLES.includes(role as PlatformAdminRole);
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === SUPER_ADMIN_ROLE;
}

export function adminRoleLabel(role: string | null | undefined): string {
  if (role === SUPER_ADMIN_ROLE) return "Super Admin";
  if (role === ADMIN_ROLE) return "Admin";
  return role || "User";
}
