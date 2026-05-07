"use client";

/**
 * DashboardShell — workspace-style chrome for the renter / host dashboards.
 *
 * Renders a header band (workspace eyebrow + title + optional subtitle) and a
 * contextual navigation surface that adapts:
 *   - lg and up  → vertical sidebar on the left
 *   - below lg   → horizontal scrolling pill tabs above the content
 *
 * The shell is intentionally lightweight: it does not fetch data or depend on
 * routes outside its own props, so the same component can host any workspace
 * (renter, host, future admin redesign).
 *
 * IMPORTANT: this is contextual workspace navigation. It must NOT duplicate
 * the global burger menu's primary entries (My dashboard / Host dashboard /
 * Admin dashboard) — those still live in the header.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export type DashboardNavItem = {
  /** Visible label. */
  label: string;
  /** Destination — must be a real route to avoid dead links. */
  href: string;
  /** Lucide-style icon component. */
  icon: React.ComponentType<{ className?: string }>;
  /**
   * When true the active state matches both the exact path and any subroute
   * (`href` + "/..."). Use sparingly — usually only on the workspace landing
   * routes that own a section.
   */
  matchPrefix?: boolean;
  /** Optional unread / pending count rendered as a small red pill. */
  badgeCount?: number;
};

type DashboardShellProps = {
  /** Eyebrow above the title — e.g. "My account", "Hosting", "Admin". */
  workspaceLabel: string;
  /** Main page title — e.g. "Welcome back", "Host dashboard". */
  pageTitle: string;
  /** Supporting line under the title. Optional. */
  pageSubtitle?: string;
  /** Optional inline pill / chip rendered next to the title. */
  pageEyebrowPill?: React.ReactNode;
  /** Workspace nav items. Order matters — first item is shown leftmost. */
  navItems: DashboardNavItem[];
  /**
   * If provided, wins over URL-based active matching. Pass the `href` of the
   * nav item that should be highlighted (useful when a workspace has multiple
   * tabs that share the same route, e.g. Comms with `?view=`).
   */
  activeHref?: string;
  /** Workspace body. */
  children: React.ReactNode;
};

export default function DashboardShell({
  workspaceLabel,
  pageTitle,
  pageSubtitle,
  pageEyebrowPill,
  navItems,
  activeHref,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();

  function isActive(item: DashboardNavItem): boolean {
    if (activeHref) return activeHref === item.href;
    if (!pathname) return false;
    if (item.matchPrefix) {
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    }
    return pathname === item.href;
  }

  return (
    <div className="min-h-screen bg-[#f7f9fb] text-[#192a3a]">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-7 lg:px-8">
        {/* Heading band — calm, structured, premium. Tightened on mobile so
            the workspace nav sits closer to the top of the viewport. */}
        <header className="mb-3 sm:mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 sm:text-[11px]">
              {workspaceLabel}
            </p>
            {pageEyebrowPill ? (
              <span className="inline-flex items-center">{pageEyebrowPill}</span>
            ) : null}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#0c1d2f] sm:mt-1.5 sm:text-3xl">
            {pageTitle}
          </h1>
          {pageSubtitle ? (
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-600 sm:mt-2 sm:text-sm">
              {pageSubtitle}
            </p>
          ) : null}
        </header>

        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:gap-6">
          {/* Mobile + tablet: horizontal pill tabs. Scrolls if it overflows
              so we never end up with a wrapped, multi-row mess. */}
          <nav
            aria-label={`${workspaceLabel} navigation`}
            className="-mx-4 lg:hidden"
          >
            <ul className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <li key={item.href + item.label} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                        active
                          ? "border-[#0c1d2f] bg-[#0c1d2f] text-white shadow-sm"
                          : "border-gray-200 bg-white text-[#192a3a] hover:border-gray-300 hover:bg-[#fbfcfd]"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${
                          active ? "text-white" : "text-[#475569]"
                        }`}
                        aria-hidden
                      />
                      <span>{item.label}</span>
                      {item.badgeCount && item.badgeCount > 0 ? (
                        <span
                          className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                            active
                              ? "bg-white/15 text-white"
                              : "bg-[#c1121f] text-white"
                          }`}
                        >
                          {item.badgeCount > 99 ? "99+" : item.badgeCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Desktop sidebar. */}
          <aside
            aria-label={`${workspaceLabel} navigation`}
            className="hidden lg:block lg:w-60 lg:shrink-0"
          >
            <nav>
              <ul className="space-y-1 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
                {navItems.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href + item.label}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                          active
                            ? "bg-[#0c1d2f] text-white shadow-sm"
                            : "text-[#192a3a] hover:bg-gray-100"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              active
                                ? "text-white"
                                : "text-[#475569] group-hover:text-[#192a3a]"
                            }`}
                            aria-hidden
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badgeCount && item.badgeCount > 0 ? (
                          <span
                            className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                              active
                                ? "bg-white/15 text-white"
                                : "bg-[#c1121f] text-white"
                            }`}
                          >
                            {item.badgeCount > 99 ? "99+" : item.badgeCount}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* Workspace body. min-w-0 so children with overflow (tables,
              long titles, charts) can shrink correctly inside the flex row. */}
          <section className="min-w-0 flex-1 space-y-4 sm:space-y-6">
            {children}
          </section>
        </div>
      </div>
    </div>
  );
}
