"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Building2,
  ClipboardList,
  Compass,
  History,
  Inbox,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAdminCommsUnreadCount } from "@/lib/admin-comms-badge";

export type AdminNavKey =
  | "dashboard"
  | "comms"
  | "activity"
  | "users"
  | "bookings"
  | "spaces"
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

type NavItem = {
  key: AdminNavKey;
  href: string;
  label: string;
  icon?: typeof LayoutDashboard;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Operations",
    items: [
      { key: "dashboard", href: "/admin", label: "Dashboard", icon: LayoutDashboard },
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
      { key: "venue-scout", href: "/admin/venue-scout", label: "Venue Scout", icon: Compass },
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
      },
      {
        key: "space-place-crm",
        href: "/space-place",
        label: "Space Place CRM",
        icon: Users,
      },
    ],
  },
  {
    title: "Marketplace",
    items: [
      { key: "listings", href: "/admin/listings", label: "Listings", icon: ClipboardList },
      { key: "spaces", href: "/admin/spaces", label: "Spaces", icon: Building2 },
      { key: "bookings", href: "/admin/bookings", label: "Bookings" },
      { key: "messages", href: "/admin/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    title: "Administration",
    items: [
      { key: "users", href: "/admin/users", label: "Users", icon: Users },
      { key: "activity", href: "/admin/activity", label: "Activity", icon: History },
      { key: "finance", href: "/admin/finance", label: "Finance" },
      {
        key: "space-advisors",
        href: "/admin/space-advisors",
        label: "Space Advisors",
        icon: Share2,
      },
    ],
  },
];

const COMMS_ITEM: NavItem = {
  key: "comms",
  href: "/dashboard/comms?context=admin",
  label: "Comms",
  icon: Bell,
};

function NavLink({
  item,
  active,
  badge,
}: {
  item: NavItem;
  active: boolean;
  badge?: ReactNode;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-4 py-2 text-sm ${
        active
          ? "border-[#192a3a] bg-[#192a3a] text-white"
          : "border-gray-300 hover:bg-gray-50"
      }`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {item.label}
      {badge}
    </Link>
  );
}

export function AdminNav({
  current,
  badges,
}: {
  current?: AdminNavKey;
  badges?: Partial<Record<AdminNavKey, ReactNode>>;
}) {
  const [commsUnread, setCommsUnread] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadCommsCount() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mounted) {
        if (mounted) setCommsUnread(0);
        return;
      }
      const count = await fetchAdminCommsUnreadCount(user.id);
      if (mounted) setCommsUnread(count);
    }

    void loadCommsCount();

    const onRefresh = () => void loadCommsCount();
    window.addEventListener("fms-inbox-refresh", onRefresh);
    return () => {
      mounted = false;
      window.removeEventListener("fms-inbox-refresh", onRefresh);
    };
  }, []);

  const commsBadge =
    badges?.comms ??
    (commsUnread > 0 ? (
      <span
        className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
          current === "comms"
            ? "bg-white text-[#192a3a]"
            : "bg-[#c1121f] text-white"
        }`}
      >
        {commsUnread > 99 ? "99+" : commsUnread}
      </span>
    ) : null);

  return (
    <nav className="mb-6 space-y-4" aria-label="Admin navigation">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <p className="w-full text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:w-auto sm:mr-2">
          Inbox
        </p>
        <NavLink
          item={COMMS_ITEM}
          active={current === "comms"}
          badge={commsBadge}
        />
      </div>

      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {section.title}
          </p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0">
            {section.items.map((item) => (
              <NavLink
                key={item.key}
                item={item}
                active={current === item.key}
                badge={badges?.[item.key]}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
