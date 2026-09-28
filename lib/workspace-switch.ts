import type { HostingAccessSummary } from "@/lib/access/hosting-access";
import { hostingHref } from "@/lib/access/hosting-access";
import type { HostingContext } from "@/lib/access/hosting-context";
import {
  isPersonalHostingQueryValue,
  PERSONAL_HOSTING_LABEL,
  PERSONAL_HOSTING_QUERY_VALUE,
} from "@/lib/access/organisation-workspace";

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

export function isHostingDashboardPath(
  pathname: string,
  search: string = ""
): boolean {
  const path = pathname.split("?")[0];
  if (path === "/dashboard" || path === "/dashboard/") return false;
  if (path.startsWith("/dashboard/my-bookings")) return false;
  if (path.startsWith("/dashboard/become-host")) return false;
  if (path.startsWith("/dashboard/list-space")) return false;
  if (path === "/dashboard/comms") {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
    return params.get("view") === "hosting";
  }
  return path.startsWith("/dashboard/");
}

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
  if (isPersonalHostingQueryValue(input.organisationId)) {
    return PERSONAL_HOSTING_LABEL;
  }
  const name = input.organisations.find(
    (organisation) => organisation.id === input.organisationId
  )?.name;
  const trimmed = name?.trim() || "";
  return trimmed || null;
}

export type HostingWorkspaceOption = {
  value: string;
  label: string;
};

export type HostingWorkspaceSelectorModel = {
  selectedValue: string;
  selectedLabel: string;
  options: HostingWorkspaceOption[];
  showSelector: boolean;
};

export function canSelectPersonalHosting(
  summary: Pick<HostingAccessSummary, "isLegacyHost" | "isGlobalAdmin">
): boolean {
  return Boolean(summary.isLegacyHost || summary.isGlobalAdmin);
}

export function hostingWorkspaceOptions(input: {
  summary: Pick<
    HostingAccessSummary,
    "isLegacyHost" | "isGlobalAdmin" | "organisationIds"
  >;
  organisations: HostingOrganisationName[];
}): HostingWorkspaceOption[] {
  const options: HostingWorkspaceOption[] = [];
  if (canSelectPersonalHosting(input.summary)) {
    options.push({
      value: PERSONAL_HOSTING_QUERY_VALUE,
      label: PERSONAL_HOSTING_LABEL,
    });
  }
  const nameById = new Map(
    input.organisations.map((organisation) => [
      organisation.id,
      organisation.name.trim(),
    ])
  );
  for (const organisationId of input.summary.organisationIds) {
    const name = nameById.get(organisationId);
    options.push({
      value: organisationId,
      label: name || organisationId,
    });
  }
  return options;
}

export function hostingWorkspaceContextLabel(input: {
  context: HostingContext;
  organisations: HostingOrganisationName[];
}): string | null {
  if (input.context.kind === "personal") return PERSONAL_HOSTING_LABEL;
  if (input.context.kind === "unavailable") return "Not available";
  if (input.context.kind !== "organisation") return null;
  return hostingOrganisationContextName({
    organisationId: input.context.organisationId,
    organisations: input.organisations,
  });
}

export function hostingWorkspaceSelectorModel(input: {
  summary: HostingAccessSummary;
  context: HostingContext;
  organisations: HostingOrganisationName[];
  hrefOrganisationId: string | null;
}): HostingWorkspaceSelectorModel | null {
  if (!input.summary.hasHostingAccess) return null;
  const options = hostingWorkspaceOptions({
    summary: input.summary,
    organisations: input.organisations,
  });
  if (options.length === 0) return null;
  const selectedValue =
    input.hrefOrganisationId ||
    (input.context.kind === "personal" ? PERSONAL_HOSTING_QUERY_VALUE : "") ||
    options[0].value;
  const selectedLabel =
    hostingWorkspaceContextLabel({
      context: input.context,
      organisations: input.organisations,
    }) ||
    options.find((option) => option.value === selectedValue)?.label ||
    options[0].label;
  return {
    selectedValue,
    selectedLabel,
    options,
    showSelector: options.length > 1,
  };
}
