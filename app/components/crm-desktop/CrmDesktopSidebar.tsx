"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { GuardedLink } from "@/app/components/UnsavedChangesProvider";
import {
  CRM_DESKTOP_NAV,
  CRM_MOBILE_LINK,
  isCrmDesktopNavActive,
  type CrmDesktopNavItem,
} from "@/lib/crm-desktop/navigation";

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: CrmDesktopNavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const className = `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    active
      ? "bg-[#192a3a] text-white"
      : "text-gray-700 hover:bg-gray-100 hover:text-[#192a3a]"
  }`;

  return (
    <GuardedLink
      href={item.href}
      className={className}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-gray-500 group-hover:text-[#192a3a]"}`}
      />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
    </GuardedLink>
  );
}

export function CrmDesktopSidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
}) {
  const pathname = usePathname() || "";

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-gray-200 bg-white transition-transform lg:static lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      } ${collapsed ? "w-[72px]" : "w-64"}`}
    >
      <div
        className={`flex h-14 items-center border-b border-gray-200 px-3 ${
          collapsed ? "justify-center" : "gap-2"
        }`}
      >
        {!collapsed ? (
          <Link href="/admin/crm" className="flex min-w-0 flex-1 items-center gap-2">
            <Image src="/logo.png" alt="FindMySpace" width={28} height={28} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#192a3a]">CRM</p>
              <p className="truncate text-[10px] text-gray-500">Space Place</p>
            </div>
          </Link>
        ) : (
          <Link href="/admin/crm" title="CRM overview">
            <Image src="/logo.png" alt="FindMySpace" width={28} height={28} />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden rounded-md p-1 text-gray-500 hover:bg-gray-100 lg:inline-flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {CRM_DESKTOP_NAV.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={isCrmDesktopNavActive(pathname, item)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="border-t border-gray-200 p-3">
        <a
          href={CRM_MOBILE_LINK.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? CRM_MOBILE_LINK.label : undefined}
        >
          <CRM_MOBILE_LINK.icon className="h-4 w-4 shrink-0 text-gray-500" />
          {!collapsed ? (
            <>
              <span className="flex-1">{CRM_MOBILE_LINK.label}</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-50" />
            </>
          ) : null}
        </a>
        {!collapsed ? (
          <GuardedLink
            href="/admin"
            className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            ← Admin dashboard
          </GuardedLink>
        ) : null}
      </div>
    </aside>
  );
}
