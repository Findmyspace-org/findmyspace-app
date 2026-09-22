"use client";

/**
 * DashboardShell — workspace-style chrome for the renter / host dashboards.
 *
 * Renders a header band (workspace eyebrow + title + optional subtitle) and a
 * contextual navigation surface that adapts:
 *   - lg and up  → vertical sidebar on the left
 *   - below lg   → horizontal scrolling pill tabs above the content
 *
 * The shell stays route-agnostic: pages pass nav items and titles. The
 * Booking | Hosting segmented selector is rendered here, top-right of the
 * heading band, so it stays consistent across every workspace page.
 *
 * IMPORTANT: this is contextual workspace navigation. It must NOT duplicate
 * the global burger menu's primary entries (Booking / Hosting /
 * Admin dashboard) — those still live in the header.
 */

import { GuardedLink, UnsavedChangesProvider } from "@/app/components/UnsavedChangesProvider";
import WorkspaceSwitch from "@/app/components/WorkspaceSwitch";
import { useWorkspaceChrome } from "@/lib/use-workspace-chrome";
import { workspaceKindFromLabel } from "@/lib/workspace-switch";
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
  /** Eyebrow above the title — e.g. "Booking", "Hosting", "Admin". */
  workspaceLabel: string;
  /** Main page title — e.g. "Welcome back", "Overview". */
  pageTitle: string;
  /**
   * Optional context under the title — e.g. the current Organisation name
   * or organisation selector. Pages own the contents so the same workspace
   * chrome can be reused without baking People-specific selection here.
   */
  pageContext?: React.ReactNode;
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
  /** Compact actions aligned with the page title (Hosting). Booking unused. */
  pageActions?: React.ReactNode;
  /** Workspace body. */
  children: React.ReactNode;
};

export default function DashboardShell({
  workspaceLabel,
  pageTitle,
  pageContext,
  pageSubtitle,
  pageEyebrowPill,
  navItems,
  activeHref,
  pageActions,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const workspaceKind = workspaceKindFromLabel(workspaceLabel);
  const chrome = useWorkspaceChrome(workspaceKind);
  const hosting = workspaceKind === "hosting";

  function isActive(item: DashboardNavItem): boolean {
    const itemPath = item.href.split("?")[0];
    if (activeHref) return activeHref.split("?")[0] === itemPath;
    if (!pathname) return false;
    if (item.matchPrefix) {
      return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
    }
    return pathname === itemPath;
  }

  return (
    <UnsavedChangesProvider>
      <div className="min-h-screen bg-[#f7f9fb] text-[#192a3a]">
      <div
        className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${
          hosting ? "py-4 sm:py-5" : "py-4 sm:py-7"
        }`}
      >
        {/* Heading band — calm, structured, premium. Tightened on mobile so
            the workspace nav sits closer to the top of the viewport. */}
        <header className={hosting ? "mb-3 sm:mb-4" : "mb-3 sm:mb-6"}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 sm:text-[11px]">
                  {workspaceLabel}
                </p>
                {workspaceKind === "hosting" && chrome.organisationName ? (
                  <>
                    <span className="text-[10px] text-gray-300 sm:text-[11px]" aria-hidden>
                      ·
                    </span>
                    <span className="min-w-0 truncate text-[11px] font-medium text-gray-600 sm:text-xs">
                      {chrome.organisationName}
                    </span>
                  </>
                ) : null}
                {pageEyebrowPill ? (
                  <span className="inline-flex items-center">{pageEyebrowPill}</span>
                ) : null}
              </div>
              <h1
                className={`mt-1 font-semibold tracking-tight text-[#0c1d2f] ${
                  hosting
                    ? "text-xl sm:text-2xl"
                    : "text-xl sm:mt-1.5 sm:text-3xl"
                }`}
              >
                {pageTitle}
              </h1>
              {pageContext ? <div className="mt-1 sm:mt-1.5">{pageContext}</div> : null}
              {pageSubtitle ? (
                <p
                  className={`mt-1 max-w-2xl leading-relaxed text-gray-600 ${
                    hosting ? "text-xs sm:text-sm" : "text-xs sm:mt-2 sm:text-sm"
                  }`}
                >
                  {pageSubtitle}
                </p>
              ) : null}
            </div>
            {chrome.selector || pageActions ? (
              <div className="flex flex-col items-stretch gap-2 self-end sm:items-end sm:self-auto">
                {chrome.selector ? (
                  <WorkspaceSwitch
                    active={chrome.selector.active}
                    bookingHref={chrome.selector.bookingHref}
                    hostingHref={chrome.selector.hostingHref}
                  />
                ) : null}
                {pageActions ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {pageActions}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <div
          className={`flex flex-col lg:flex-row ${
            hosting ? "gap-3 lg:gap-5" : "gap-3 sm:gap-4 lg:gap-6"
          }`}
        >
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
                    <GuardedLink
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border font-medium transition ${
                        hosting ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm"
                      } ${
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
                    </GuardedLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Desktop sidebar. */}
          <aside
            aria-label={`${workspaceLabel} navigation`}
            className={`hidden lg:block lg:shrink-0 ${
              hosting
                ? "lg:w-56 lg:border-r lg:border-gray-200 lg:pr-4"
                : "lg:w-60"
            }`}
          >
            <nav>
              <ul
                className={
                  hosting
                    ? "space-y-0.5"
                    : "space-y-1 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm"
                }
              >
                {navItems.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href + item.label}>
                      <GuardedLink
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`group flex items-center justify-between gap-2 font-medium transition ${
                          hosting
                            ? "rounded-lg px-2.5 py-2 text-[13px]"
                            : "gap-3 rounded-xl px-3 py-2.5 text-sm"
                        } ${
                          active
                            ? "bg-[#0c1d2f] text-white shadow-sm"
                            : hosting
                              ? "text-[#334155] hover:bg-white hover:text-[#0c1d2f]"
                              : "text-[#192a3a] hover:bg-gray-100"
                        }`}
                      >
                        <span className={`flex min-w-0 items-center ${hosting ? "gap-2.5" : "gap-3"}`}>
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
                      </GuardedLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* Workspace body. min-w-0 so children with overflow (tables,
              long titles, charts) can shrink correctly inside the flex row. */}
          <section
            className={`min-w-0 flex-1 ${
              hosting ? "space-y-3 sm:space-y-4" : "space-y-4 sm:space-y-6"
            }`}
          >
            {children}
          </section>
        </div>
      </div>
      </div>
    </UnsavedChangesProvider>
  );
}
