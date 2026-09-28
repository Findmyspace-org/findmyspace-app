"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  Compass,
  LayoutDashboard,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { V2_PREVIEW_HREF } from "@/lib/v2/ui-version";
import { useV2PreviewIdentity } from "./V2PreviewGate";

type V2NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  requiresPlatformAdmin?: boolean;
};

const V2_FOUNDATION_NAV: V2NavigationItem[] = [
  {
    label: "Preview",
    href: V2_PREVIEW_HREF,
    icon: LayoutDashboard,
  },
  {
    label: "Browse",
    href: "/spaces",
    icon: Compass,
  },
  {
    label: "Bookings",
    href: "/dashboard/my-bookings",
    icon: CalendarCheck,
  },
  {
    label: "Hosting",
    href: "/dashboard/owner",
    icon: Building2,
    requiresPlatformAdmin: true,
  },
  {
    label: "Platform",
    href: "/admin",
    icon: ShieldCheck,
    requiresPlatformAdmin: true,
  },
];

function useAvailableNavigation() {
  const identity = useV2PreviewIdentity();
  return V2_FOUNDATION_NAV.filter(
    (item) => !item.requiresPlatformAdmin || identity.isPlatformAdmin
  );
}

function isActiveNavigationItem(pathname: string, href: string) {
  const hrefPath = href.split("?")[0];
  return pathname === hrefPath;
}

export function V2DesktopNavigation() {
  const pathname = usePathname();
  const items = useAvailableNavigation();

  return (
    <nav className="fms-v2-desktop-nav" aria-label="V2 preview navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActiveNavigationItem(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="fms-v2-desktop-nav-item"
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function V2MobileNavigation() {
  const pathname = usePathname();
  const items = useAvailableNavigation();

  return (
    <nav className="fms-v2-mobile-nav" aria-label="V2 preview navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActiveNavigationItem(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="fms-v2-mobile-nav-item"
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
