"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  Compass,
  Home,
  type LucideIcon,
} from "lucide-react";
import { V2_PREVIEW_HREF } from "@/lib/v2/ui-version";

type V2NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const V2_DESKTOP_NAV: V2NavigationItem[] = [
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
];

const V2_MOBILE_NAV: V2NavigationItem[] = [
  {
    label: "Home",
    href: V2_PREVIEW_HREF,
    icon: Home,
  },
  ...V2_DESKTOP_NAV,
];

function isActiveNavigationItem(pathname: string, href: string) {
  const hrefPath = href.split("?")[0];
  return pathname === hrefPath;
}

export function V2DesktopNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fms-v2-desktop-nav" aria-label="V2 preview navigation">
      {V2_DESKTOP_NAV.map((item) => {
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

  return (
    <nav className="fms-v2-mobile-nav" aria-label="V2 preview navigation">
      {V2_MOBILE_NAV.map((item) => {
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
