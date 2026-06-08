"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Compass,
  History,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";

export type AdminNavKey =
  | "dashboard"
  | "activity"
  | "users"
  | "bookings"
  | "spaces"
  | "listings"
  | "venue-scout"
  | "unclaimed-listings"
  | "listing-reviews"
  | "listing-enquiries"
  | "verification"
  | "messages"
  | "finance"
  | "space-advisors";

type NavItem = {
  key: AdminNavKey;
  href: string;
  label: string;
  icon?: typeof LayoutDashboard;
};

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { key: "activity", href: "/admin/activity", label: "Activity", icon: History },
  { key: "users", href: "/admin/users", label: "Users", icon: Users },
  { key: "bookings", href: "/admin/bookings", label: "Bookings" },
  { key: "spaces", href: "/admin/spaces", label: "Spaces", icon: Building2 },
  { key: "listings", href: "/admin/listings", label: "Listings", icon: ClipboardList },
  { key: "venue-scout", href: "/admin/venue-scout", label: "Venue Scout", icon: Compass },
  {
    key: "unclaimed-listings",
    href: "/admin/unclaimed-listings",
    label: "Unclaimed listings",
    icon: Building2,
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
  { key: "verification", href: "/admin/verification", label: "Verification", icon: ShieldCheck },
  { key: "messages", href: "/admin/messages", label: "Messages", icon: MessageSquare },
  { key: "finance", href: "/admin/finance", label: "Finance" },
  {
    key: "space-advisors",
    href: "/admin/space-advisors",
    label: "Space Advisors",
    icon: Share2,
  },
];

export function AdminNav({
  current,
  badges,
}: {
  current?: AdminNavKey;
  badges?: Partial<Record<AdminNavKey, ReactNode>>;
}) {
  return (
    <div className="mb-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 md:gap-3">
      {NAV_ITEMS.map(({ key, href, label, icon: Icon }) => {
        const active = current === key;
        return (
          <Link
            key={key}
            href={href}
            className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-4 py-2 text-sm ${
              active
                ? "border-[#192a3a] bg-[#192a3a] text-white"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {label}
            {badges?.[key]}
          </Link>
        );
      })}
    </div>
  );
}
