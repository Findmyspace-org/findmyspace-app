"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";
import { adminApiFetch } from "@/lib/admin-api-client";

type NavBadges = Partial<
  Record<
    | "comms"
    | "listing-enquiries"
    | "listing-claim-interests"
    | "listing-reviews"
    | "messages"
    | "verification",
    number
  >
>;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [badges, setBadges] = useState<NavBadges>({});

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
    let mounted = true;

    async function loadBadges() {
      try {
        const queue = (await adminApiFetch("/api/admin/action-queue")) as {
          newListingEnquiries?: number;
          newClaimInterests?: number;
          pendingListingReviews?: number;
          pendingIdentityVerification?: number;
          pendingBankVerification?: number;
        };

        if (!mounted) return;

        setBadges({
          "listing-enquiries": queue.newListingEnquiries ?? 0,
          "listing-claim-interests": queue.newClaimInterests ?? 0,
          "listing-reviews": queue.pendingListingReviews ?? 0,
          verification:
            (queue.pendingIdentityVerification ?? 0) +
            (queue.pendingBankVerification ?? 0),
        });
      } catch {
        if (mounted) setBadges({});
      }
    }

    void loadBadges();
    return () => {
      mounted = false;
    };
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("admin-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
        onToggleCollapse={toggleCollapsed}
        mobileOpen={sidebarOpen}
        badges={badges}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          badges={badges}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
