"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import {
  ADMIN_COMMS_ITEM,
  ADMIN_NAV_SECTIONS,
  isAdminNavItemActive,
  type AdminNavKey,
} from "@/lib/admin-navigation";
import { useAdminRole } from "@/lib/use-admin-role";

type BadgeMap = Partial<Record<AdminNavKey | "comms", number>>;

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
  external,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  badge?: ReactNode;
  external?: boolean;
  onNavigate?: () => void;
}) {
  const className = `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    active
      ? "bg-[#192a3a] text-white"
      : "text-gray-700 hover:bg-gray-100 hover:text-[#192a3a]"
  }`;

  const content = (
    <>
      <Icon
        className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-gray-500 group-hover:text-[#192a3a]"}`}
      />
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {badge}
          {external ? (
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
          ) : null}
        </>
      ) : null}
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={collapsed ? label : undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={className}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

function CountBadge({
  count,
  active,
}: {
  count: number;
  active: boolean;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
        active ? "bg-white text-[#192a3a]" : "bg-[#c1121f] text-white"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AdminSidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  badges = {},
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  badges?: BadgeMap;
}) {
  const pathname = usePathname() || "";
  const { isSuperAdmin } = useAdminRole();

  const commsActive = pathname.startsWith("/admin/comms");

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-gray-200 bg-white transition-transform lg:static lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      } ${collapsed ? "w-[72px]" : "w-64"}`}
    >
      <div
        className={`flex h-14 shrink-0 items-center border-b border-gray-200 px-3 ${
          collapsed ? "justify-center" : "gap-2"
        }`}
      >
        <Link href="/admin" className="flex min-w-0 items-center gap-2">
          <Image
            src="/map-pin.png"
            alt="FindMySpace"
            width={28}
            height={28}
            className="shrink-0"
          />
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-[#192a3a]">
                FindMySpace
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                Admin
              </p>
            </div>
          ) : null}
        </Link>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-2 py-3"
        aria-label="Admin navigation"
      >
        <div className="mb-4">
          {!collapsed ? (
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Inbox
            </p>
          ) : null}
          <SidebarLink
            href={ADMIN_COMMS_ITEM.href}
            label={ADMIN_COMMS_ITEM.label}
            icon={ADMIN_COMMS_ITEM.icon}
            active={commsActive}
            collapsed={collapsed}
            badge={
              <CountBadge
                count={badges.comms ?? 0}
                active={commsActive}
              />
            }
          />
        </div>

        {ADMIN_NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            {!collapsed ? (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {section.title}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {section.items
                .filter((item) => !item.superAdminOnly || isSuperAdmin)
                .map((item) => {
                const active = isAdminNavItemActive(pathname, item);
                const badgeCount = badges[item.key as keyof BadgeMap];
                return (
                  <li key={item.key}>
                    <SidebarLink
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={active}
                      collapsed={collapsed}
                      external={item.external}
                      badge={
                        typeof badgeCount === "number" ? (
                          <CountBadge count={badgeCount} active={active} />
                        ) : undefined
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-200 p-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 lg:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
