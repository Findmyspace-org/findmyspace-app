"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UnsavedChangesProvider } from "@/app/components/UnsavedChangesProvider";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";
import { useAdminInboxCounts } from "@/lib/use-admin-inbox-counts";
import { AdminRoleProvider, useAdminRole } from "@/lib/use-admin-role";

function AdminAccessDenied({ message }: { message: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f8] p-6">
      <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-800">Access denied</h1>
        <p className="mt-2 text-sm text-red-700">{message}</p>
      </div>
    </div>
  );
}

function AdminSessionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f8] p-6">
      <div className="max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-amber-900">Admin session unavailable</h1>
        <p className="mt-2 text-sm text-amber-800">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function AdminShellLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f8] p-6 text-sm text-gray-600">
      Loading admin workspace…
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminRoleProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </AdminRoleProvider>
  );
}

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    loading: roleLoading,
    signedIn,
    isAdmin,
    isSuperAdmin,
    adminAccessDisabled,
    sessionError,
    email,
    refresh,
  } = useAdminRole();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { counts } = useAdminInboxCounts(isAdmin);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("admin-sidebar-collapsed");
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (roleLoading || signedIn) return;
    const next = encodeURIComponent(pathname || "/admin");
    router.replace(`/login?next=${next}`);
  }, [roleLoading, signedIn, pathname, router]);

  if (roleLoading) {
    return <AdminShellLoading />;
  }

  if (!signedIn) {
    return <AdminShellLoading />;
  }

  if (sessionError) {
    return <AdminSessionError message={sessionError} onRetry={refresh} />;
  }

  if (!isAdmin) {
    return (
      <AdminAccessDenied
        message={
          adminAccessDisabled
            ? "Your admin access is disabled."
            : "You do not have admin access to this area."
        }
      />
    );
  }

  const badges = {
    comms: counts.unread,
    "listing-enquiries": counts.modules.listingEnquiries,
    "listing-claim-interests": counts.modules.listingClaimInterests,
    "listing-reviews": counts.modules.listingReviews,
    verification: counts.modules.verification,
  };

  return (
    <UnsavedChangesProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-[#f4f6f8] text-[#192a3a]">
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={() => {
            setCollapsed((current) => {
              const next = !current;
              try {
                window.localStorage.setItem(
                  "admin-sidebar-collapsed",
                  next ? "1" : "0"
                );
              } catch {
                /* ignore */
              }
              return next;
            });
          }}
          mobileOpen={sidebarOpen}
          badges={badges}
          isSuperAdmin={isSuperAdmin}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopBar
            onOpenSidebar={() => setSidebarOpen(true)}
            unreadCount={counts.unread}
            actionRequiredCount={counts.actionRequired}
            profileEmail={email}
          />
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </div>
      </div>
    </UnsavedChangesProvider>
  );
}
