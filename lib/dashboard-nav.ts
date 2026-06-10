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
} from "lucide-react";

import type { DashboardNavItem } from "@/app/components/DashboardShell";

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
    href: "/dashboard/my-bookings#payments",
    icon: CreditCard,
  },
  {
    label: "Account settings",
    href: "/dashboard/verification",
    icon: Settings,
  },
];

export const HOST_NAV: DashboardNavItem[] = [
  {
    label: "Overview",
    href: "/dashboard/owner",
    icon: LayoutDashboard,
  },
  {
    label: "My listings",
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
    icon: Landmark,
    matchPrefix: true,
  },
  {
    label: "Verification & settings",
    href: "/dashboard/verification",
    icon: Settings,
    matchPrefix: true,
  },
];
