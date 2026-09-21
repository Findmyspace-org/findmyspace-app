import { hostingHref } from "@/lib/access/hosting-access";

/**
 * Booking ↔ Hosting workspace switch.
 *
 * Authority still comes from hasHostingAccess / the hosting access summary.
 * Organisation names and query params are display context only.
 */

export const BOOKING_WORKSPACE_LABEL = "Booking";
export const HOSTING_WORKSPACE_LABEL = "Hosting";
export const SWITCH_TO_HOSTING_LABEL = "Switch to Hosting";
export const SWITCH_TO_BOOKING_LABEL = "Switch to Booking";
export const BOOKING_HREF = "/dashboard";
export const HOSTING_OVERVIEW_PATH = "/dashboard/owner";

export type WorkspaceKind = "booking" | "hosting";

export type HostingOrganisationName = {
  id: string;
  name: string;
};

export type WorkspaceSelectorModel = {
  visible: boolean;
  active: WorkspaceKind;
  bookingHref: string;
  hostingHref: string;
};

export function workspaceKindFromLabel(label: string): WorkspaceKind | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "hosting") return "hosting";
  if (normalized === "booking" || normalized === "my account") return "booking";
  return null;
}

export function workspaceSelector(input: {
  kind: WorkspaceKind;
  hasHostingAccess: boolean;
  organisationId: string | null;
}): WorkspaceSelectorModel {
  return {
    visible: input.hasHostingAccess,
    active: input.kind,
    bookingHref: BOOKING_HREF,
    hostingHref: hostingHref(HOSTING_OVERVIEW_PATH, input.organisationId),
  };
}

export function workspaceSwitch(input: {
  kind: WorkspaceKind;
  hasHostingAccess: boolean;
  organisationId: string | null;
}): { href: string; label: string } | null {
  const selector = workspaceSelector(input);
  if (input.kind === "hosting") {
    return { href: selector.bookingHref, label: SWITCH_TO_BOOKING_LABEL };
  }
  if (!selector.visible) return null;
  return {
    href: selector.hostingHref,
    label: SWITCH_TO_HOSTING_LABEL,
  };
}

export function hostingOrganisationContextName(input: {
  organisationId: string | null;
  organisations: HostingOrganisationName[];
}): string | null {
  if (!input.organisationId) return null;
  const name = input.organisations.find(
    (organisation) => organisation.id === input.organisationId
  )?.name;
  const trimmed = name?.trim() || "";
  return trimmed || null;
}
