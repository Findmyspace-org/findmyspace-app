import type { CrmRole } from "@/lib/space-place/constants";
import { isPlatformAdminRole } from "@/lib/admin-roles";

/** Full cross-organisation CRM desktop workspace (Admin of Admins / Main Admin). */
export function canAccessCrmDesktop(input: {
  crmRole: CrmRole | string | null | undefined;
  platformRole: string | null | undefined;
}): boolean {
  if (input.crmRole === "admin") return true;
  return isPlatformAdminRole(input.platformRole);
}

export const CRM_DESKTOP_ACCESS_DENIED =
  "The CRM desktop workspace is only available to Main Admins and platform administrators.";
