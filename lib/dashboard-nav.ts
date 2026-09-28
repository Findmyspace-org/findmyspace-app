/**
 * Shared workspace navigation definitions for the renter and host dashboards.
 *
 * Defining these in one place lets every page that lives inside a workspace
 * (overview, my-bookings, listings, requests, comms, calendar, finance,
 * verification, …) wrap itself in the same `DashboardShell` with consistent
 * tabs/sidebar entries — so the user always feels like they are inside one
 * connected dashboard environment instead of separate disconnected pages.
 *
 * IMPORTANT: do NOT delete any href here without first confirming the route
 * still exists. Each entry maps to a real page and is also reachable through
 * deep links (e.g. notifications, emails). Removing an entry here breaks
 * navigation but does not remove the underlying route.
 */

import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Inbox,
  Landmark,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

import type { DashboardNavItem } from "@/app/components/DashboardShell";
import type { HostingAccessSummary } from "@/lib/access/hosting-access";
import { hostingHref } from "@/lib/access/hosting-access";

export const RENTER_PAYMENTS_HREF = "/dashboard/my-bookings#payments";
export const RENTER_PAYMENTS_HASH = "payments";

export function splitDashboardNavHref(href: string): {
  pathname: string;
  hash: string;
} {
  const [beforeHash, hash = ""] = href.split("#");
  return {
    pathname: beforeHash.split("?")[0] || "",
    hash,
  };
}

export function dashboardNavItemIsActive(
  item: Pick<DashboardNavItem, "href" | "matchPrefix">,
  input: {
    pathname: string | null;
    hash?: string;
    activeHref?: string;
    items?: Array<Pick<DashboardNavItem, "href">>;
  }
): boolean {
  const active = splitDashboardNavHref(input.activeHref || "");
  const currentPathname = active.pathname || input.pathname || "";
  const currentHash = (
    active.hash ||
    (input.hash || "").replace(/^#/, "")
  ).replace(/^#/, "");
  const itemLoc = splitDashboardNavHref(item.href);

  if (itemLoc.hash) {
    return currentPathname === itemLoc.pathname && currentHash === itemLoc.hash;
  }

  if (!currentPathname) return false;
  const pathMatches = item.matchPrefix
    ? currentPathname === itemLoc.pathname ||
      currentPathname.startsWith(`${itemLoc.pathname}/`)
    : currentPathname === itemLoc.pathname;
  if (!pathMatches) return false;

  if (currentHash && currentPathname === itemLoc.pathname) {
    const hashClaimed = (input.items || []).some((other) => {
      const otherLoc = splitDashboardNavHref(other.href);
      return (
        otherLoc.pathname === itemLoc.pathname && otherLoc.hash === currentHash
      );
    });
    if (hashClaimed) return false;
  }
  return true;
}

function hostingNavLabel(
  item: DashboardNavItem,
  summary: HostingAccessSummary
): string {
  const spaceManagerOnly =
    summary.isSpaceManager &&
    !summary.isOrganisationAdmin &&
    !summary.isPropertyManager &&
    !summary.isLegacyHost &&
    !summary.isGlobalAdmin;
  const propertyManagerView =
    summary.isPropertyManager &&
    !summary.isOrganisationAdmin &&
    !summary.isGlobalAdmin;

  if (item.href === "/dashboard/listings") {
    if (spaceManagerOnly) return "Managed space";
    if (propertyManagerView) return "Managed spaces";
  }
  if (item.href === "/dashboard/properties" && propertyManagerView) {
    return "Managed properties";
  }
  return item.label;
}

export const RENTER_NAV: DashboardNavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "My bookings",
    href: "/dashboard/my-bookings",
    icon: CalendarCheck,
    matchPrefix: true,
  },
  {
    label: "Comms",
    href: "/dashboard/comms?view=bookings",
    icon: Inbox,
  },
  {
    label: "Payments",
    href: RENTER_PAYMENTS_HREF,
    icon: CreditCard,
  },
];

export const HOST_NAV: DashboardNavItem[] = [
  {
    label: "Overview",
    href: "/dashboard/owner",
    icon: LayoutDashboard,
  },
  {
    label: "My spaces",
    href: "/dashboard/listings",
    icon: Building2,
    matchPrefix: true,
  },
  {
    label: "My properties",
    href: "/dashboard/properties",
    icon: Landmark,
    matchPrefix: true,
  },
  {
    label: "Booking requests",
    href: "/dashboard/requests",
    icon: ClipboardList,
    matchPrefix: true,
  },
  {
    label: "Comms",
    href: "/dashboard/comms?view=hosting",
    icon: Inbox,
  },
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    icon: CalendarDays,
    matchPrefix: true,
  },
  {
    label: "Finance",
    href: "/dashboard/finance",
    icon: Wallet,
    matchPrefix: true,
  },
  {
    label: "People",
    href: "/dashboard/people",
    icon: Users,
    matchPrefix: true,
  },
  {
    label: "Organisation",
    href: "/dashboard/organisation",
    icon: Building2,
    matchPrefix: true,
  },
  {
    label: "Verification & payouts",
    href: "/dashboard/verification",
    icon: Settings,
    matchPrefix: true,
  },
];

/**
 * Role-aware Hosting nav. Space Managers do not receive People, My properties,
 * or organisation-wide finance. Organisation Admins and legacy hosts keep the
 * full Hosting set.
 */
export function hostingNavItems(
  summary: HostingAccessSummary,
  organisationId: string | null = summary.primaryOrganisationId
): DashboardNavItem[] {
  return HOST_NAV.filter((item) => {
    if (item.href === "/dashboard/properties") return summary.showProperties;
    if (item.href === "/dashboard/finance") return summary.showFinance;
    if (item.href === "/dashboard/people") return summary.showPeople;
    if (item.href === "/dashboard/organisation")
      return summary.showOrganisationCommercial;
    if (item.href === "/dashboard/verification") return summary.showVerification;
    return true;
  }).map((item) => ({
    ...item,
    label: hostingNavLabel(item, summary),
    href: hostingHref(item.href, organisationId),
  }));
}
