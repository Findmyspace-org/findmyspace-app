"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import OwnerVerificationAlerts from "@/app/components/OwnerVerificationAlerts";
import {
  Home,
  Search,
  LayoutDashboard,
  CalendarCheck,
  HousePlus,
  Building2,
  ClipboardList,
  Settings,
  ShieldCheck,
  BadgeCheck,
  UserPlus,
  Mail,
  Shield,
} from "lucide-react";

type ProfileRow = {
  id: string;
  role: string | null;
  is_host: boolean | null;
};

type DashboardItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
};

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);

  const [myBookingActionCount, setMyBookingActionCount] = useState(0);
  const [bookingRequestActionCount, setBookingRequestActionCount] = useState(0);

  useEffect(() => {
    loadUserContext();
  }, []);

  async function loadUserContext() {
    setLoadingContext(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadingContext(false);
      return;
    }

    setEmail(user.email ?? null);

    const { data: rawProfile } = await (supabase
      .from("profiles") as any)
      .select("id, role, is_host")
      .eq("id", user.id)
      .single();

    const profile = rawProfile as ProfileRow | null;

    setRole(profile?.role || "user");
    setIsHost(profile?.is_host === true);

    // 🔔 Renter actions
    const { data: renterBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("renter_id", user.id)
      .eq("status", "accepted_awaiting_payment")
      .eq("payment_status", "awaiting_payment");

    setMyBookingActionCount((renterBookings || []).length);

    // 🔔 Host actions
    if (profile?.is_host) {
      const { data: hostRequests } = await supabase
        .from("bookings")
        .select("id")
        .eq("owner_id", user.id)
        .in("status", ["pending", "pending_owner"]);

      setBookingRequestActionCount((hostRequests || []).length);
    }

    setLoadingContext(false);
  }

  const exploreItems: DashboardItem[] = [
    { label: "Homepage", href: "/", icon: Home },
    { label: "Browse spaces", href: "/spaces", icon: Search },
  ];

  const accountItems: DashboardItem[] = [
    { label: "My dashboard", href: "/dashboard", icon: LayoutDashboard },
    {
      label: "My bookings",
      href: "/dashboard/my-bookings",
      icon: CalendarCheck,
      badgeCount: myBookingActionCount,
    },
  ];

  const hostingItems: DashboardItem[] = isHost
    ? [
        { label: "List a space", href: "/dashboard/new-space", icon: HousePlus },
        { label: "My Spaces", href: "/dashboard/listings", icon: Building2 },
        {
          label: "Requests",
          href: "/dashboard/requests",
          icon: ClipboardList,
          badgeCount: bookingRequestActionCount,
        },
        { label: "Host settings", href: "/dashboard/verification", icon: Settings },
      ]
    : [
        { label: "Become a host", href: "/dashboard/become-host", icon: UserPlus },
      ];

  const adminItems: DashboardItem[] = [
    { label: "Manage spaces", href: "/admin/spaces", icon: ShieldCheck },
    { label: "Verification queue", href: "/admin/verification", icon: BadgeCheck },
  ];

  return (
    <RequireAuth>
      <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
        <div className="mx-auto max-w-6xl">

          {/* HEADER */}
          <div className="mb-8">
            <h1 className="mb-1 text-3xl font-semibold">Dashboard</h1>
            <p className="text-sm text-gray-600">
              Navigate your account, spaces, requests, and bookings.
            </p>

            {/* ✅ NEW CLEAN TOP BAR */}
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {loadingContext ? (
                <p>Loading your dashboard...</p>
              ) : (
                <div className="flex items-center justify-between">

                  {/* EMAIL */}
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span>{email || "Unknown"}</span>
                  </div>

                  {/* ROLE */}
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-500" />
                    <span className="rounded-full bg-[#192a3a] px-3 py-1 text-xs text-white">
                      {role === "admin" ? "Admin" : "User"}
                    </span>
                  </div>

                </div>
              )}
            </div>
          </div>

          {/* ACTION PANEL */}
          {(myBookingActionCount > 0 || bookingRequestActionCount > 0) && (
            <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="mb-1 font-medium">Action needed</p>

              {myBookingActionCount > 0 && (
                <p>• {myBookingActionCount} booking(s) awaiting payment</p>
              )}

              {bookingRequestActionCount > 0 && (
                <p>• {bookingRequestActionCount} request(s) to review</p>
              )}
            </div>
          )}

          {/* VERIFICATION */}
          {isHost && (
            <div className="mb-6">
              <OwnerVerificationAlerts />
            </div>
          )}

          {/* GRID SECTIONS */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardSection title="Explore" items={exploreItems} />
            <DashboardSection title="My account" items={accountItems} />
            <DashboardSection title="Hosting" items={hostingItems} />
            {role === "admin" && (
              <DashboardSection title="Admin" items={adminItems} />
            )}
          </div>

        </div>
      </main>
    </RequireAuth>
  );
}

function DashboardSection({
  title,
  items,
}: {
  title: string;
  items: DashboardItem[];
}) {
  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="px-1 pb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={`${title}-${item.label}`}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#192a3a] hover:bg-gray-100"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-[#192a3a]" />
                <span>{item.label}</span>
              </div>

              {item.badgeCount && item.badgeCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                  {item.badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}