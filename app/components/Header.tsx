"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AuthModal from "@/app/components/AuthModal";
import { sanitizeNextPath } from "@/lib/auth-redirect";
import {
  Home,
  Search,
  LayoutDashboard,
  HousePlus,
  Building2,
  ShieldCheck,
  LogIn,
  LogOut,
  UserPlus,
  Menu,
  Bell,
  Clock3,
  FileText,
  CheckCircle2,
  Landmark,
  MessageSquare,
  HelpCircle,
  Inbox,
  FileBadge,
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
    | "booking_message"
    | "listing_question"
    | "listing_status"
    | "notice";
  /** When set, row comes from `notifications` table and can be marked read. */
  tableRowId?: string;
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [authNextPath, setAuthNextPath] = useState("/");

  const [myBookingActionCount, setMyBookingActionCount] = useState(0);
  const [bookingRequestActionCount, setBookingRequestActionCount] = useState(0);
  const [adminActionCount, setAdminActionCount] = useState(0);
  const [notifications, setNotifications] = useState<ActionNotification[]>([]);
  const [bellRefresh, setBellRefresh] = useState(0);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  /**
   * Extra pending listing questions for the Comms badge.
   *
   * Why "extra": `bookingRequestActionCount` already absorbs unread
   * `listing_question` notifications (see OWNER_BADGE_NOTIFICATION_TYPES
   * below). To avoid double-counting, this number captures only the pending
   * listing questions that are NOT already represented by an unread
   * notification — i.e. the gap that opens when a host marks the notification
   * read but hasn't actually answered the question yet.
   *
   * Calculated as: max(0, pendingHostQuestions - unreadListingQuestionNotifs).
   */
  const [pendingListingQuestionCount, setPendingListingQuestionCount] =
    useState(0);

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
        setMessageUnreadCount(0);
        setPendingListingQuestionCount(0);
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
        setMessageUnreadCount(0);
        setPendingListingQuestionCount(0);
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

        // Notification table unread rows (badge uses actionable types only)
        const DROPDOWN_NOTIFICATION_TYPES = new Set([
          "payment_needed",
          "booking_request",
          "booking_declined",
          "booking_expired",
          "booking_confirmed",
          "booking_paid",
          "payment_received",
          "booking_message",
          "identity_submitted",
          "bank_submitted",
          "identity_verified",
          "identity_rejected",
          "bank_verified",
          "bank_rejected",
          "listing_question",
          "listing_question_answered",
          "listing_submitted",
          "listing_pending",
          "listing_rejected",
          "listing_activated",
          "ownership_proof_verified",
        ]);

        const RENTER_BADGE_NOTIFICATION_TYPES = new Set([
          "payment_needed",
          "booking_message",
          "listing_question_answered",
        ]);
        const OWNER_BADGE_NOTIFICATION_TYPES = new Set([
          "booking_request",
          "booking_message",
          "listing_question",
          "listing_pending",
          "listing_rejected",
          "listing_activated",
          "ownership_proof_verified",
          "identity_verified",
          "identity_rejected",
          "bank_verified",
          "bank_rejected",
        ]);
        const ADMIN_BADGE_NOTIFICATION_TYPES = new Set([
          "payment_received",
          "identity_submitted",
          "bank_submitted",
        ]);

        const { count: messageUnreadExact, error: messageCountError } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("type", "booking_message")
          .eq("is_read", false);

        if (mounted) {
          if (!messageCountError && messageUnreadExact !== null) {
            setMessageUnreadCount(messageUnreadExact);
          } else if (messageCountError) {
            setMessageUnreadCount(0);
          }
        }

        // -------------------------------------------------------------------
        // Pending listing-question count for the Comms badge.
        //
        // We separately count:
        //   (a) pending host listing questions  (listing_yes_no_questions)
        //   (b) unread `listing_question` notifications for this user
        //
        // The Comms badge already counts (b) via OWNER_BADGE_NOTIFICATION_TYPES
        // below, so to avoid double-counting we add only the gap:
        //   extra = max(0, pendingQuestions - unreadListingQuestionNotifs)
        //
        // This captures the case where a host clicked the bell row (marking
        // the notification read) without actually answering the question.
        //
        // On any failure we default to 0 — never break header rendering.
        // -------------------------------------------------------------------
        let pendingQuestionsCount = 0;
        if (isHost) {
          try {
            const {
              count: pendingHostQ,
              error: pendingHostError,
            } = await supabase
              .from("listing_yes_no_questions")
              .select("id", { count: "exact", head: true })
              .eq("owner_id", userId)
              .eq("status", "pending");
            if (pendingHostError) {
              console.warn(
                "Pending listing questions count failed:",
                pendingHostError
              );
            } else if (typeof pendingHostQ === "number") {
              pendingQuestionsCount = pendingHostQ;
            }
          } catch (err) {
            console.warn("Pending listing questions count threw:", err);
          }
        }

        let unreadListingQuestionNotifs = 0;
        try {
          const {
            count: lqNotifCount,
            error: lqNotifError,
          } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("type", "listing_question")
            .eq("is_read", false);
          if (lqNotifError) {
            console.warn(
              "Unread listing_question notifications count failed:",
              lqNotifError
            );
          } else if (typeof lqNotifCount === "number") {
            unreadListingQuestionNotifs = lqNotifCount;
          }
        } catch (err) {
          console.warn("Unread listing_question notif count threw:", err);
        }

        if (mounted) {
          setPendingListingQuestionCount(
            Math.max(0, pendingQuestionsCount - unreadListingQuestionNotifs)
          );
        }

        const { data: notificationRows, error: notificationsError } = await supabase
          .from("notifications")
          .select(
            "id, user_id, role, type, title, href, is_read, created_at, related_entity_type, related_entity_id"
          )
          .eq("user_id", userId)
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(25);

        let renterDbBadge = 0;
        let ownerDbBadge = 0;
        let adminDbBadge = 0;

        if (!notificationsError) {
          const rows = (notificationRows || []) as {
            id: string;
            type: string | null;
            title: string | null;
            href: string | null;
            related_entity_type?: string | null;
            related_entity_id?: string | null;
          }[];

          renterDbBadge = rows.filter((row) =>
            RENTER_BADGE_NOTIFICATION_TYPES.has(row.type || "")
          ).length;
          ownerDbBadge = rows.filter((row) =>
            OWNER_BADGE_NOTIFICATION_TYPES.has(row.type || "")
          ).length;
          adminDbBadge = rows.filter((row) =>
            ADMIN_BADGE_NOTIFICATION_TYPES.has(row.type || "")
          ).length;

          rows.forEach((row) => {
            const t = row.type || "";
            if (!DROPDOWN_NOTIFICATION_TYPES.has(t)) return;

            let mappedType: ActionNotification["type"];
            if (t === "payment_needed") mappedType = "payment";
            else if (t === "booking_request") mappedType = "request";
            else if (t === "booking_declined" || t === "booking_expired") mappedType = "notice";
            else if (t === "booking_confirmed") mappedType = "booking_confirmed";
            else if (t === "booking_paid") mappedType = "booking_paid";
            else if (t === "booking_message") mappedType = "booking_message";
            else if (t === "listing_question" || t === "listing_question_answered")
              mappedType = "listing_question";
            else if (
              t === "listing_submitted" ||
              t === "listing_pending" ||
              t === "listing_rejected" ||
              t === "listing_activated" ||
              t === "ownership_proof_verified" ||
              t === "identity_verified" ||
              t === "identity_rejected" ||
              t === "bank_verified" ||
              t === "bank_rejected"
            ) {
              mappedType = "listing_status";
            } else if (
              t === "payment_received" ||
              t === "identity_submitted" ||
              t === "bank_submitted"
            ) {
              mappedType = "admin";
            } else {
              return;
            }

            const bookingThreadId =
              t === "booking_message" &&
              row.related_entity_type === "booking" &&
              row.related_entity_id
                ? row.related_entity_id
                : null;

            const href =
              bookingThreadId
                ? `/dashboard/messages/${bookingThreadId}`
                : row.href ||
                  (mappedType === "payment" || mappedType === "notice"
                    ? "/dashboard/my-bookings"
                    : mappedType === "request"
                      ? "/dashboard/requests"
                      : mappedType === "booking_paid"
                        ? "/dashboard/requests"
                        : mappedType === "booking_message"
                          ? "/dashboard/messages"
                          : mappedType === "admin"
                            ? t === "identity_submitted" || t === "bank_submitted"
                              ? "/admin/verification"
                              : "/admin/bookings"
                            : "/dashboard");

            pushUniqueNotification({
              id: `notif-${row.id}`,
              title: row.title || "Notification",
              href,
              type: mappedType,
              tableRowId: row.id,
            });
          });
        }

        if (mounted) {
          setMyBookingActionCount(Math.max(renterCount, renterDbBadge));
          setBookingRequestActionCount(Math.max(hostCount, ownerDbBadge));
          setAdminActionCount(Math.max(nextAdminCount, adminDbBadge));
          setNotifications(nextNotifications);
        }
      } catch (error) {
        console.error("Failed to load action counts:", error);
        if (!mounted) return;
        setMyBookingActionCount(0);
        setBookingRequestActionCount(0);
        setAdminActionCount(0);
        setMessageUnreadCount(0);
        setPendingListingQuestionCount(0);
        setNotifications([]);
      }
    }

    loadActionCounts();

    return () => {
      mounted = false;
    };
  }, [userId, isHost, isAdmin, bellRefresh]);

  useEffect(() => {
    const bump = () => setBellRefresh((v) => v + 1);
    window.addEventListener("fms-inbox-refresh", bump);
    return () => window.removeEventListener("fms-inbox-refresh", bump);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => setBellRefresh((v) => v + 1)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!pathname?.startsWith("/dashboard/messages")) return;
    setBellRefresh((v) => v + 1);
  }, [pathname]);

  useEffect(() => {
    if (loading) return;

    const shouldOpenLogin = searchParams.get("login") === "1";
    if (!shouldOpenLogin) return;

    const safeNext = sanitizeNextPath(searchParams.get("next"), pathname || "/");

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("login");
    currentUrl.searchParams.delete("next");
    const cleanUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;

    if (sessionEmail) {
      window.location.replace(safeNext);
      return;
    }

    setAuthMode("login");
    setAuthNextPath(safeNext);
    setAuthModalOpen(true);
    router.replace(cleanUrl);
  }, [loading, pathname, router, searchParams, sessionEmail]);

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
    setMessageUnreadCount(0);
    setNotifications([]);

    window.location.replace("/");
  }

  function openLoginModal() {
    setMenuOpen(false);
    setBellOpen(false);
    setAuthMode("login");
    setAuthNextPath(pathname || "/");
    setAuthModalOpen(true);
  }

  function openSignupModal() {
    setMenuOpen(false);
    setBellOpen(false);
    setAuthMode("signup");
    setAuthNextPath(pathname || "/");
    setAuthModalOpen(true);
  }

  function handleListSpaceClick() {
    setMenuOpen(false);

    if (!sessionEmail) {
      setAuthMode("signup");
      setAuthNextPath("/dashboard/become-host");
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

  /**
   * Single source of truth for the Comms unread badge.
   *
   * `pendingListingQuestionCount` is the de-duplicated extra (see comment
   * on its useState), so adding it here cannot double-count listing
   * questions whose notifications are still unread.
   */
  const commsBadgeCount =
    messageUnreadCount +
    totalNotificationCount +
    pendingListingQuestionCount;

  // Workspace-based primary navigation.
  //
  // Goal: the burger menu answers "what role am I in right now?", not "what
  // feature do I want?". Every workspace owns its own contextual nav once the
  // user lands inside its dashboard, so we deliberately do NOT surface
  // Messages, Notifications, Listing questions, Finance, My listings,
  // Booking requests, or Host settings here — those routes still work and
  // are reached from inside their respective workspace.
  const menuSections: MenuSection[] = [
    {
      title: "Explore",
      items: [
        { label: "Homepage", href: "/", icon: Home },
        { label: "Browse spaces", href: "/spaces", icon: Search },
      ],
    },
  ];

  if (!loading && isLoggedIn) {
    menuSections.push({
      title: "My account",
      items: [
        { label: "My dashboard", href: "/dashboard", icon: LayoutDashboard },
      ],
    });

    menuSections.push({
      title: "Hosting",
      items: isHost
        ? [
            {
              label: "Host dashboard",
              href: "/dashboard/owner",
              icon: LayoutDashboard,
            },
          ]
        : [
            {
              label: "Become a host",
              href: "/dashboard/become-host",
              icon: HousePlus,
            },
          ],
    });

    if (isAdmin) {
      menuSections.push({
        title: "Admin",
        items: [
          {
            label: "Admin dashboard",
            href: "/admin",
            icon: ShieldCheck,
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
            {/* Browse spaces — workspace-agnostic primary discovery link.
                Hidden on mobile to avoid overcrowding; mobile users still
                reach it via the burger menu under Explore. */}
            <Link
              href="/spaces"
              className="hidden h-10 items-center rounded-md px-3 text-sm font-medium text-[#192a3a] transition-colors duration-200 hover:bg-gray-50 sm:inline-flex sm:h-11 sm:px-4"
            >
              Browse spaces
            </Link>

            {/* Single primary CTA in the top bar. Logged-out users tap this
                and the existing handler routes them through the auth modal
                before continuing to /dashboard/become-host or /dashboard/new-space. */}
            <button
              type="button"
              onClick={handleListSpaceClick}
              className="fms-button-primary inline-flex h-10 items-center !rounded-md px-3 text-sm font-medium shadow-[0_1px_2px_rgba(12,29,47,0.18)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#0a1726] sm:h-11 sm:px-4"
            >
              List space
            </button>

            {!loading && isLoggedIn && (() => {
              const commsLabel =
                commsBadgeCount > 0
                  ? `Comms Center, ${commsBadgeCount} unread`
                  : "Comms Center";
              return (
                <Link
                  href="/dashboard/comms"
                  className="relative flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] hover:bg-gray-50 sm:h-11 sm:w-11"
                  aria-label={commsLabel}
                >
                  <Inbox className="h-5 w-5" aria-hidden />
                  {commsBadgeCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#c1121f] px-1 text-[10px] font-semibold text-white">
                      {commsBadgeCount > 99 ? "99+" : commsBadgeCount}
                    </span>
                  ) : null}
                </Link>
              );
            })()}

            {/* The legacy bell-dropdown (notifications popover) was retired in
                favour of the single Comms Center icon above. The /dashboard/notifications
                archive remains reachable from inside Comms Center and via deep
                links. The block below is left commented as historical context
                while we observe Comms adoption — to be deleted in a follow-up. */}
            {false && !loading && isLoggedIn && (
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
                              onClick={async (e) => {
                                setBellOpen(false);
                                if (!notification.tableRowId) return;
                                e.preventDefault();
                                try {
                                  const {
                                    data: { session },
                                  } = await supabase.auth.getSession();
                                  if (session?.access_token) {
                                    await fetch("/api/notifications/read", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${session.access_token}`,
                                      },
                                      body: JSON.stringify({
                                        notificationId: notification.tableRowId,
                                      }),
                                    });
                                    setBellRefresh((v) => v + 1);
                                  }
                                } catch {
                                  /* non-fatal */
                                }
                                router.push(notification.href);
                              }}
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
                              ) : notification.type === "listing_question" ? (
                                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#c1121f]" />
                              ) : notification.type === "listing_status" ? (
                                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0f2740]" />
                              ) : notification.type === "notice" ? (
                                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />
                              ) : (
                                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#192a3a]" />
                              )}
                              <span>{notification.title}</span>
                            </Link>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                        <Link
                          href="/dashboard/comms"
                          onClick={() => setBellOpen(false)}
                          className="flex items-center justify-center gap-1.5 rounded-md bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#c1121f] hover:bg-[#ffe7ea]"
                        >
                          <Inbox className="h-3.5 w-3.5" aria-hidden />
                          Open Comms Center
                          <span aria-hidden>→</span>
                        </Link>
                        <Link
                          href="/dashboard/notifications"
                          onClick={() => setBellOpen(false)}
                          className="flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-[#475569] hover:bg-gray-100"
                        >
                          View all notifications
                          <span aria-hidden>→</span>
                        </Link>
                      </div>
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

                    {/* Persistent footer: Terms first, then auth controls. */}
                    <div className="rounded-md border border-gray-200 bg-white px-2 py-2">
                      <Link
                        href="/terms"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[#192a3a] transition hover:bg-gray-100"
                      >
                        <FileBadge className="h-4 w-4 shrink-0 text-[#475569]" />
                        <span>Terms &amp; Conditions</span>
                      </Link>

                      {!loading && isLoggedIn ? (
                        <button
                          onClick={handleLogout}
                          className="mt-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4 shrink-0 text-red-600" />
                          <span>Log out</span>
                        </button>
                      ) : !loading ? (
                        <>
                          <button
                            type="button"
                            onClick={openLoginModal}
                            className="mt-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-[#192a3a] transition hover:bg-gray-100"
                          >
                            <LogIn className="h-4 w-4 shrink-0 text-[#192a3a]" />
                            <span>Log in</span>
                          </button>
                          <button
                            type="button"
                            onClick={openSignupModal}
                            className="mt-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-[#192a3a] transition hover:bg-gray-100"
                          >
                            <UserPlus className="h-4 w-4 shrink-0 text-[#192a3a]" />
                            <span>Sign up</span>
                          </button>
                        </>
                      ) : null}
                    </div>
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
        nextPath={authNextPath || pathname || "/"}
        onClose={() => setAuthModalOpen(false)}
        onSwitchMode={(mode) => setAuthMode(mode)}
      />
    </>
  );
}