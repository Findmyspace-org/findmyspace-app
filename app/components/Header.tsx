"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AuthModal from "@/app/components/AuthModal";
import {
  Home,
  Search,
  LayoutDashboard,
  CalendarCheck,
  HousePlus,
  Building2,
  ClipboardList,
  Settings,
  Landmark,
  ShieldCheck,
  BadgeCheck,
  LogIn,
  LogOut,
  UserPlus,
  Menu,
  Bell,
  Clock3,
  FileText,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";

type MenuItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

type ActionNotification = {
  id: string;
  title: string;
  href: string;
  type:
    | "payment"
    | "request"
    | "admin"
    | "booking_confirmed"
    | "booking_paid"
    | "booking_message";
};

export default function Header() {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLDivElement | null>(null);

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const [myBookingActionCount, setMyBookingActionCount] = useState(0);
  const [bookingRequestActionCount, setBookingRequestActionCount] = useState(0);
  const [adminActionCount, setAdminActionCount] = useState(0);
  const [notifications, setNotifications] = useState<ActionNotification[]>([]);

  const hideHeader = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    let mounted = true;

    async function initUser() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (error || !user) {
          setSessionEmail(null);
          setUserId(null);
          setIsAdmin(false);
          setIsHost(false);
        } else {
          setSessionEmail(user.email ?? null);
          setUserId(user.id);
        }
      } catch (error) {
        console.error("Initial auth check failed:", error);
        if (!mounted) return;
        setSessionEmail(null);
        setUserId(null);
        setIsAdmin(false);
        setIsHost(false);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setSessionEmail(session.user.email ?? null);
        setUserId(session.user.id);
        setAuthModalOpen(false);
      } else {
        setSessionEmail(null);
        setUserId(null);
        setIsAdmin(false);
        setIsHost(false);
        setMyBookingActionCount(0);
        setBookingRequestActionCount(0);
        setAdminActionCount(0);
        setNotifications([]);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadUserProfile() {
      if (!userId) {
        setIsAdmin(false);
        setIsHost(false);
        return;
      }

      try {
        const { data, error } = await (supabase.from("profiles") as any)
          .select("role, is_host")
          .eq("id", userId)
          .single();

        if (!mounted) return;

        if (error) {
          setIsAdmin(false);
          setIsHost(false);
          return;
        }

        setIsAdmin(data?.role === "admin");
        setIsHost(data?.is_host === true);
      } catch (error) {
        console.error("Profile load failed:", error);
        if (!mounted) return;
        setIsAdmin(false);
        setIsHost(false);
      }
    }

    loadUserProfile();

    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    let mounted = true;

    async function loadActionCounts() {
      if (!userId) {
        setMyBookingActionCount(0);
        setBookingRequestActionCount(0);
        setAdminActionCount(0);
        setNotifications([]);
        return;
      }

      try {
        const nextNotifications: ActionNotification[] = [];

        function pushUniqueNotification(item: ActionNotification) {
          const exists = nextNotifications.some((existing) => existing.id === item.id);
          if (!exists) {
            nextNotifications.push(item);
          }
        }

        const { data: renterBookings, error: renterError } = await supabase
          .from("bookings")
          .select("id, status, payment_status")
          .eq("renter_id", userId)
          .eq("status", "accepted_awaiting_payment")
          .eq("payment_status", "awaiting_payment");

        const renterCount = renterError ? 0 : (renterBookings || []).length;

        if (mounted) {
          setMyBookingActionCount(renterCount);
        }

        (renterBookings || []).forEach((booking: any) => {
          pushUniqueNotification({
            id: `payment-${booking.id}`,
            title: "Payment needed for your booking",
            href: "/dashboard/my-bookings",
            type: "payment",
          });
        });

        let hostCount = 0;

        if (isHost) {
          const { data: hostRequests, error: hostError } = await supabase
            .from("bookings")
            .select("id, status")
            .eq("owner_id", userId)
            .in("status", ["pending", "pending_owner"]);

          hostCount = hostError ? 0 : (hostRequests || []).length;

          (hostRequests || []).forEach((booking: any) => {
            pushUniqueNotification({
              id: `request-${booking.id}`,
              title: "New booking request needs review",
              href: "/dashboard/requests",
              type: "request",
            });
          });
        }

        if (mounted) {
          setBookingRequestActionCount(hostCount);
        }

        let nextAdminCount = 0;

        if (isAdmin) {
          // Pending listings
          const { data: pendingSpaces, error: spacesError } = await supabase
            .from("spaces")
            .select("id")
            .eq("status", "pending");

          const pendingSpacesCount = spacesError ? 0 : (pendingSpaces || []).length;

          if (pendingSpacesCount > 0) {
            pushUniqueNotification({
              id: "admin-spaces",
              title: `${pendingSpacesCount} listing${pendingSpacesCount > 1 ? "s" : ""} need review`,
              href: "/admin/spaces",
              type: "admin",
            });
          }

          // Pending owner verification
          const { data: pendingOwner, error: ownerError } = await supabase
            .from("profiles")
            .select("id")
            .eq("is_host", true)
            .eq("owner_verification_status", "pending");

          const pendingOwnerCount = ownerError ? 0 : (pendingOwner || []).length;

          if (pendingOwnerCount > 0) {
            pushUniqueNotification({
              id: "admin-owner",
              title: `${pendingOwnerCount} owner verification${pendingOwnerCount > 1 ? "s" : ""} pending`,
              href: "/admin/verification",
              type: "admin",
            });
          }

          // Pending bank verification
          const { data: pendingBank, error: bankError } = await supabase
            .from("profiles")
            .select("id")
            .eq("is_host", true)
            .eq("bank_verification_status", "pending");

          const pendingBankCount = bankError ? 0 : (pendingBank || []).length;

          if (pendingBankCount > 0) {
            pushUniqueNotification({
              id: "admin-bank",
              title: `${pendingBankCount} bank verification${pendingBankCount > 1 ? "s" : ""} pending`,
              href: "/admin/verification",
              type: "admin",
            });
          }

          nextAdminCount = pendingSpacesCount + pendingOwnerCount + pendingBankCount;
        }

        // Notification table unread notifications
        const { data: notificationRows, error: notificationsError } = await supabase
          .from("notifications")
          .select("id, user_id, role, type, title, href, is_read, created_at")
          .eq("user_id", userId)
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!notificationsError) {
          ((notificationRows || []) as {
            id: string;
            type: string | null;
            title: string | null;
            href: string | null;
          }[]).forEach((row) => {
            if (
              row.type !== "booking_confirmed" &&
              row.type !== "booking_paid" &&
              row.type !== "payment_received" &&
              row.type !== "booking_message"
            ) {
              return;
            }

            const mappedType: ActionNotification["type"] =
              row.type === "booking_confirmed"
                ? "booking_confirmed"
                : row.type === "booking_paid"
                ? "booking_paid"
                : row.type === "booking_message"
                ? "booking_message"
                : "admin";

            pushUniqueNotification({
              id: `notif-${row.id}`,
              title: row.title || "Notification",
              href:
                row.href ||
                (mappedType === "booking_confirmed"
                  ? "/dashboard/my-bookings"
                  : mappedType === "booking_paid"
                  ? "/dashboard/requests"
                  : mappedType === "booking_message"
                  ? "/dashboard/my-bookings"
                  : "/dashboard"),
              type: mappedType,
            });
          });
        }

        const renterNotificationCount = nextNotifications.filter(
          (item) =>
            item.type === "payment" ||
            item.type === "booking_confirmed" ||
            item.type === "booking_message"
        ).length;

        const ownerNotificationCount = nextNotifications.filter(
          (item) =>
            item.type === "request" ||
            item.type === "booking_paid" ||
            item.type === "booking_message"
        ).length;

        const adminNotificationCount = nextNotifications.filter(
          (item) => item.type === "admin"
        ).length;

        if (mounted) {
          setMyBookingActionCount(Math.max(renterCount, renterNotificationCount));
          setBookingRequestActionCount(Math.max(hostCount, ownerNotificationCount));
          setAdminActionCount(Math.max(nextAdminCount, adminNotificationCount));
          setNotifications(nextNotifications);
        }
      } catch (error) {
        console.error("Failed to load action counts:", error);
        if (!mounted) return;
        setMyBookingActionCount(0);
        setBookingRequestActionCount(0);
        setAdminActionCount(0);
        setNotifications([]);
      }
    }

    loadActionCounts();

    return () => {
      mounted = false;
    };
  }, [userId, isHost, isAdmin]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }

      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setBellOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setBellOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleLogout() {
    setMenuOpen(false);
    setBellOpen(false);

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout failed:", error);
    }

    setSessionEmail(null);
    setUserId(null);
    setIsAdmin(false);
    setIsHost(false);
    setMyBookingActionCount(0);
    setBookingRequestActionCount(0);
    setAdminActionCount(0);
    setNotifications([]);

    window.location.replace("/");
  }

  function openLoginModal() {
    setMenuOpen(false);
    setBellOpen(false);
    setAuthMode("login");
    setAuthModalOpen(true);
  }

  function openSignupModal() {
    setMenuOpen(false);
    setBellOpen(false);
    setAuthMode("signup");
    setAuthModalOpen(true);
  }

  function handleListSpaceClick() {
    setMenuOpen(false);

    if (!sessionEmail) {
      setAuthMode("signup");
      setAuthModalOpen(true);
      return;
    }

    if (isHost) {
      window.location.href = "/dashboard/new-space";
      return;
    }

    window.location.href = "/dashboard/become-host";
  }

  if (hideHeader) {
    return null;
  }

  const isLoggedIn = Boolean(sessionEmail);
  const totalNotificationCount =
    myBookingActionCount + bookingRequestActionCount + adminActionCount;

  const menuSections: MenuSection[] = [
    {
      title: "Explore",
      items: [
        { label: "Homepage", href: "/", icon: Home },
        { label: "Browse spaces", href: "/spaces", icon: Search },
        { label: "Terms & Conditions", href: "/terms", icon: Settings },
      ],
    },
  ];

  if (!loading && isLoggedIn) {
    menuSections.push({
      title: "My account",
      items: [
        { label: "My dashboard", href: "/dashboard", icon: LayoutDashboard },
        {
          label: "My bookings",
          href: "/dashboard/my-bookings",
          icon: CalendarCheck,
          badgeCount: myBookingActionCount,
        },
      ],
    });

    if (isHost) {
      menuSections.push({
        title: "Hosting",
        items: [
          { label: "Dashboard", href: "/dashboard/owner", icon: LayoutDashboard },
          { label: "List a space", onClick: handleListSpaceClick, icon: HousePlus },
          { label: "My listings", href: "/dashboard/listings", icon: Building2 },
          {
            label: "Bookings & Request",
            href: "/dashboard/requests",
            icon: ClipboardList,
            badgeCount: bookingRequestActionCount,
          },
          {
            label: "Host Admin",
            href: "/dashboard/verification?step=overview",
            icon: Settings,
          },
          {
            label: "Finance",
            href: "/dashboard/finance",
            icon: Landmark,
          },
        ],
      });
    } else {
      menuSections.push({
        title: "Hosting",
        items: [
          { label: "Become a host", href: "/dashboard/become-host", icon: HousePlus },
        ],
      });
    }

    if (isAdmin) {
      menuSections.push({
        title: "Admin",
        items: [
          {
            label: "Admin dashboard",
            href: "/admin",
            icon: LayoutDashboard,
          },
          {
            label: "Manage users",
            href: "/admin#users-section",
            icon: UserPlus,
          },
          {
            label: "Manage spaces",
            href: "/admin/spaces",
            icon: Building2,
          },
          {
            label: "Verification queue",
            href: "/admin/verification",
            icon: BadgeCheck,
            badgeCount: adminActionCount,
          },
        ],
      });
    }
  }

  return (
    <>
      <header className="relative z-[100] w-full border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-6">
          <Link href="/" className="flex shrink-0 items-center">
            <Image
              src="/logo.png"
              alt="FindMySpace"
              width={150}
              height={48}
              priority
              className="h-12 w-auto shrink-0 hover:opacity-80"
            />
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-1.5 md:gap-2">
            {loading ? null : !isLoggedIn ? (
              <button
                type="button"
                onClick={openLoginModal}
                className="fms-button-primary inline-flex h-10 items-center !rounded-md px-3 text-sm font-medium shadow-[0_1px_2px_rgba(12,29,47,0.18)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#0a1726] sm:h-11 sm:px-4"
              >
                Login
              </button>
            ) : isHost ? (
              <button
                type="button"
                onClick={handleListSpaceClick}
                className="fms-button-primary inline-flex h-10 items-center !rounded-md px-3 text-sm font-medium shadow-[0_1px_2px_rgba(12,29,47,0.18)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#0a1726] sm:h-11 sm:px-4"
              >
                List space
              </button>
            ) : (
              <Link
                href="/dashboard/become-host"
                className="fms-button-primary inline-flex h-10 items-center !rounded-md px-3 text-sm font-medium shadow-[0_1px_2px_rgba(12,29,47,0.18)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#0a1726] sm:h-11 sm:px-4"
              >
                Host with us
              </Link>
            )}

            <div className="hidden sm:block">
              {loading ? null : isLoggedIn ? (
                <button
                  onClick={handleLogout}
                  className="fms-button-secondary inline-flex h-10 items-center !rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-[#192a3a] transition-colors duration-200 hover:border-gray-400 hover:bg-gray-50 sm:h-11 sm:px-4"
                >
                  Log out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openSignupModal}
                  className="fms-button-secondary inline-flex h-10 items-center !rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-[#192a3a] transition-colors duration-200 hover:border-gray-400 hover:bg-gray-50 sm:h-11 sm:px-4"
                >
                  Sign up
                </button>
              )}
            </div>

            {!loading && isLoggedIn && (
              <div className="relative" ref={bellRef}>
                <button
                  type="button"
                  onClick={() => setBellOpen((prev) => !prev)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] hover:bg-gray-50 sm:h-11 sm:w-11"
                  aria-label="Notifications"
                  aria-expanded={bellOpen}
                >
                  <Bell className="h-5 w-5" />
                  {totalNotificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                      {totalNotificationCount}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <div className="absolute right-0 top-14 z-[120] w-[320px] rounded-md border border-gray-200 bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Notifications
                      </div>

                      {notifications.length === 0 ? (
                        <div className="rounded-md bg-[#f8fafb] px-3 py-3 text-sm text-gray-600">
                          No actions needed right now.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {notifications.map((notification) => (
                            <Link
                              key={notification.id}
                              href={notification.href}
                              onClick={() => setBellOpen(false)}
                              className="flex items-start gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[#192a3a] hover:bg-gray-100"
                            >
                              {notification.type === "payment" ? (
                                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                              ) : notification.type === "request" ? (
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                              ) : notification.type === "booking_confirmed" ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                              ) : notification.type === "booking_paid" ? (
                                <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
                              ) : notification.type === "booking_message" ? (
                                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                              ) : (
                                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#192a3a]" />
                              )}
                              <span>{notification.title}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] hover:bg-gray-50 sm:h-11 sm:w-11"
                aria-label="Open menu"
                aria-expanded={menuOpen}
              >
                <Menu className="h-5 w-5" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-14 z-[120] w-[320px] rounded-md border border-gray-200 bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                  {!loading && isLoggedIn && sessionEmail && (
                    <div className="mb-2 rounded-md border border-gray-200 bg-[#f8fafb] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Signed in
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-[#192a3a]">
                        {sessionEmail}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {menuSections.map((section) => (
                      <div
                        key={section.title}
                        className="rounded-md border border-gray-200 bg-white px-2 py-2"
                      >
                        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {section.title}
                        </div>

                        <div className="space-y-0.5">
                          {section.items.map((item) => {
                            const Icon = item.icon;

                            if (item.href) {
                              return (
                                <Link
                                  key={`${section.title}-${item.label}`}
                                  href={item.href}
                                  onClick={() => setMenuOpen(false)}
                                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[#192a3a] transition hover:bg-gray-100"
                                >
                                  <div className="flex items-center gap-3">
                                    <Icon className="h-4 w-4 shrink-0 text-[#192a3a]" />
                                    <span>{item.label}</span>
                                  </div>

                                  {item.badgeCount && item.badgeCount > 0 ? (
                                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                                      {item.badgeCount}
                                    </span>
                                  ) : null}
                                </Link>
                              );
                            }

                            return (
                              <button
                                key={`${section.title}-${item.label}`}
                                type="button"
                                onClick={item.onClick}
                                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-[#192a3a] transition hover:bg-gray-100"
                              >
                                <div className="flex items-center gap-3">
                                  <Icon className="h-4 w-4 shrink-0 text-[#192a3a]" />
                                  <span>{item.label}</span>
                                </div>

                                {item.badgeCount && item.badgeCount > 0 ? (
                                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                                    {item.badgeCount}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {!loading && isLoggedIn && (
                      <div className="rounded-md border border-gray-200 bg-white px-2 py-2">
                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4 shrink-0 text-red-600" />
                          <span>Log out</span>
                        </button>
                      </div>
                    )}

                    {!loading && !isLoggedIn && (
                      <div className="rounded-md border border-gray-200 bg-white px-2 py-2">
                        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Account
                        </div>

                        <div className="space-y-0.5">
                          <button
                            type="button"
                            onClick={openLoginModal}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-[#192a3a] transition hover:bg-gray-100"
                          >
                            <LogIn className="h-4 w-4 shrink-0 text-[#192a3a]" />
                            <span>Log in</span>
                          </button>

                          <button
                            type="button"
                            onClick={openSignupModal}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-[#192a3a] transition hover:bg-gray-100"
                          >
                            <UserPlus className="h-4 w-4 shrink-0 text-[#192a3a]" />
                            <span>Sign up</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <AuthModal
        open={authModalOpen}
        mode={authMode}
        nextPath={pathname || "/"}
        onClose={() => setAuthModalOpen(false)}
        onSwitchMode={(mode) => setAuthMode(mode)}
      />
    </>
  );
}