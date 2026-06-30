"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";
import { useAdminInboxCounts } from "@/lib/use-admin-inbox-counts";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { counts } = useAdminInboxCounts();

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

  const badges = {
    comms: counts.unread,
    "listing-enquiries": counts.modules.listingEnquiries,
    "listing-claim-interests": counts.modules.listingClaimInterests,
    "listing-reviews": counts.modules.listingReviews,
    verification: counts.modules.verification,
  };

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
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          unreadCount={counts.unread}
          actionRequiredCount={counts.actionRequired}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
