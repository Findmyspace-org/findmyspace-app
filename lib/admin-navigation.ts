import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Building2,
  ClipboardList,
  Compass,
  CreditCard,
  History,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  MessageSquare,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";

export type AdminNavKey =
  | "dashboard"
  | "comms"
  | "activity"
  | "users"
  | "bookings"
  | "spaces"
  | "spaces-all"
  | "listings"
  | "venue-scout"
  | "unclaimed-listings"
  | "properties"
  | "space-place-crm"
  | "listing-reviews"
  | "listing-enquiries"
  | "listing-claim-interests"
  | "verification"
  | "messages"
  | "finance"
  | "space-advisors";

export type AdminNavItem = {
  key: AdminNavKey;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match pathname prefix for active state (defaults to href without query). */
  matchPrefix?: string;
  external?: boolean;
};

export type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_COMMS_ITEM: AdminNavItem = {
  key: "comms",
  href: "/dashboard/comms?context=admin",
  label: "Comms",
  icon: Bell,
};

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    title: "Operations",
    items: [
      {
        key: "dashboard",
        href: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        matchPrefix: "/admin",
      },
      {
        key: "listing-reviews",
        href: "/admin/listing-reviews",
        label: "Listing reviews",
        icon: ClipboardList,
      },
      {
        key: "listing-enquiries",
        href: "/admin/listing-enquiries",
        label: "Listing enquiries",
        icon: Inbox,
      },
      {
        key: "listing-claim-interests",
        href: "/admin/listing-claim-interests",
        label: "Claim interests",
        icon: Link2,
      },
      {
        key: "verification",
        href: "/admin/verification",
        label: "Verification",
        icon: ShieldCheck,
      },
    ],
  },
  {
    title: "Acquisition",
    items: [
      {
        key: "venue-scout",
        href: "/admin/venue-scout",
        label: "Venue Scout",
        icon: Compass,
      },
      {
        key: "unclaimed-listings",
        href: "/admin/unclaimed-listings",
        label: "Unclaimed listings",
        icon: Building2,
      },
      {
        key: "properties",
        href: "/admin/properties",
        label: "Properties",
        icon: Building2,
        matchPrefix: "/admin/properties",
      },
      {
        key: "space-place-crm",
        href: "/space-place",
        label: "Space Place CRM",
        icon: Users,
        external: true,
      },
      {
        key: "spaces-all",
        href: "/admin/spaces/all",
        label: "All spaces",
        icon: LayoutGrid,
        matchPrefix: "/admin/spaces/all",
      },
    ],
  },
  {
    title: "Marketplace",
    items: [
      {
        key: "listings",
        href: "/admin/listings",
        label: "Listings",
        icon: ClipboardList,
      },
      {
        key: "spaces",
        href: "/admin/spaces",
        label: "Spaces",
        icon: Building2,
        matchPrefix: "/admin/spaces",
      },
      {
        key: "bookings",
        href: "/admin/bookings",
        label: "Bookings",
        icon: ClipboardList,
      },
      {
        key: "messages",
        href: "/admin/messages",
        label: "Messages",
        icon: MessageSquare,
      },
    ],
  },
  {
    title: "Commerce",
    items: [
      {
        key: "finance",
        href: "/admin/finance",
        label: "Finance / Payouts",
        icon: CreditCard,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      { key: "users", href: "/admin/users", label: "Users", icon: Users },
      { key: "activity", href: "/admin/activity", label: "Activity", icon: History },
      {
        key: "space-advisors",
        href: "/admin/space-advisors",
        label: "Space Advisors",
        icon: Share2,
      },
    ],
  },
];

export function isAdminNavItemActive(
  pathname: string,
  item: AdminNavItem
): boolean {
  const base = item.matchPrefix ?? item.href.split("?")[0];

  if (item.key === "dashboard") {
    return pathname === "/admin";
  }

  if (item.key === "spaces") {
    return (
      pathname === "/admin/spaces" ||
      (pathname.startsWith("/admin/spaces/") && !pathname.startsWith("/admin/spaces/all"))
    );
  }

  if (item.key === "spaces-all") {
    return pathname.startsWith("/admin/spaces/all");
  }

  if (item.key === "properties") {
    return pathname.startsWith("/admin/properties");
  }

  return pathname === base || pathname.startsWith(`${base}/`);
}
