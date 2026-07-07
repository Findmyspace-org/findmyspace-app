"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { UnsavedChangesProvider } from "@/app/components/UnsavedChangesProvider";
import { SpacePlaceProvider } from "@/app/space-place/SpacePlaceContext";
import { CrmDesktopProvider, useCrmDesktop } from "./CrmDesktopContext";
import { CrmDesktopSidebar } from "./CrmDesktopSidebar";
import { CrmDesktopTopBar } from "./CrmDesktopTopBar";
import { CrmQuickActionProvider } from "./CrmQuickActionProvider";
import { CrmRefreshProvider } from "@/lib/crm-desktop/crm-refresh";
import { CRM_DESKTOP_ACCESS_DENIED } from "@/lib/crm-desktop/access";

function CrmDesktopAccessGate({ children }: { children: React.ReactNode }) {
  const { loading, error, canAccessDesktop } = useCrmDesktop();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f8] text-sm text-gray-600">
        Loading CRM workspace…
      </div>
    );
  }

  if (!canAccessDesktop) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f8] p-6">
        <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-bold text-red-800">Access denied</h1>
          <p className="mt-2 text-sm text-red-700">
            {error || CRM_DESKTOP_ACCESS_DENIED}
          </p>
          <p className="mt-3 text-sm text-red-700">
            Team members can continue using the{" "}
            <a href="/space-place" className="font-medium underline">
              mobile CRM
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function CrmDesktopShellInner({
  children,
  title,
  subtitle,
  addLabel,
  onAdd,
  showSearch,
  filters,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  addLabel?: string;
  onAdd?: () => void;
  showSearch?: boolean;
  filters?: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("crm-desktop-sidebar-collapsed");
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const resolvedTitle =
    title ||
    (pathname.startsWith("/admin/crm/marketing")
      ? "Marketing"
      : (
          {
            "/admin/crm": "Overview",
            "/admin/crm/today": "Today",
            "/admin/crm/activities": "Activities",
            "/admin/crm/pipeline": "Pipeline",
            "/admin/crm/organisations": "Organisations",
            "/admin/crm/spaces": "Spaces",
            "/admin/crm/contacts": "Contacts",
            "/admin/crm/tasks": "Tasks",
            "/admin/crm/communication": "Communication",
            "/admin/crm/marketing": "Marketing",
            "/admin/crm/search": "Search",
          }[pathname] ?? "CRM"
        ));

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#f4f6f8] text-[#192a3a]">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <CrmDesktopSidebar
        collapsed={collapsed}
        mobileOpen={sidebarOpen}
        onToggleCollapse={() => {
          setCollapsed((current) => {
            const next = !current;
            try {
              window.localStorage.setItem(
                "crm-desktop-sidebar-collapsed",
                next ? "1" : "0"
              );
            } catch {
              /* ignore */
            }
            return next;
          });
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <CrmDesktopTopBar
          title={resolvedTitle}
          subtitle={subtitle}
          onOpenSidebar={() => setSidebarOpen(true)}
          addLabel={addLabel}
          onAdd={onAdd}
          showSearch={showSearch}
          filters={filters}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function CrmDesktopShell({
  children,
  ...props
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  addLabel?: string;
  onAdd?: () => void;
  showSearch?: boolean;
  filters?: React.ReactNode;
}) {
  return (
    <UnsavedChangesProvider>
      <CrmDesktopProvider>
        <SpacePlaceProvider>
          <CrmRefreshProvider>
            <CrmQuickActionProvider>
              <CrmDesktopAccessGate>
                <CrmDesktopShellInner {...props}>{children}</CrmDesktopShellInner>
              </CrmDesktopAccessGate>
            </CrmQuickActionProvider>
          </CrmRefreshProvider>
        </SpacePlaceProvider>
      </CrmDesktopProvider>
    </UnsavedChangesProvider>
  );
}
