import { hostingHref } from "@/lib/access/hosting-access";

/**
 * My Account ↔ Hosting workspace switch.
 *
 * Authority still comes from hasHostingAccess / the hosting access summary.
 * The organisation query string may be preserved as context only.
 */

export const MY_ACCOUNT_WORKSPACE_LABEL = "My account";
export const HOSTING_WORKSPACE_LABEL = "Hosting";
export const SWITCH_TO_HOSTING_LABEL = "Switch to Hosting";
export const SWITCH_TO_MY_ACCOUNT_LABEL = "Switch to My Account";
export const MY_ACCOUNT_HREF = "/dashboard";
export const HOSTING_OVERVIEW_PATH = "/dashboard/owner";

export type WorkspaceKind = "account" | "hosting";

export function workspaceKindFromLabel(label: string): WorkspaceKind | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "hosting") return "hosting";
  if (normalized === "my account") return "account";
  return null;
}

export function workspaceSwitch(input: {
  kind: WorkspaceKind;
  hasHostingAccess: boolean;
  organisationId: string | null;
}): { href: string; label: string } | null {
  if (input.kind === "hosting") {
    return { href: MY_ACCOUNT_HREF, label: SWITCH_TO_MY_ACCOUNT_LABEL };
  }
  if (!input.hasHostingAccess) return null;
  return {
    href: hostingHref(HOSTING_OVERVIEW_PATH, input.organisationId),
    label: SWITCH_TO_HOSTING_LABEL,
  };
}
