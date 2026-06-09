"use client";

/**
 * /dashboard — renter workspace overview.
 *
 * IA model:
 *   - The renter dashboard is the primary navigation home for everything
 *     related to bookings the user has made (or is about to make).
 *   - Workspace-level navigation lives in `DashboardShell`. This page renders
 *     the Overview tab.
 *   - Other workspace destinations (My bookings, Comms, Payments, Account
 *     settings) navigate to existing routes — those routes are intentionally
 *     left untouched so deep links and existing flows keep working.
 *
 * Data philosophy:
 *   - Lightweight summary fetches only. Detail pages own their own loading.
 *   - Anything we can't load defaults to 0 / empty so the workspace never
 *     blocks rendering.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import OwnerVerificationAlerts from "@/app/components/OwnerVerificationAlerts";
import DashboardShell from "@/app/components/DashboardShell";
import { RENTER_NAV } from "@/lib/dashboard-nav";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarCheck,
  CalendarClock,
  CreditCard,
  Heart,
  Inbox,
  Loader2,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";

type ProfileRow = {
  id: string;
  role: string | null;
  is_host: boolean | null;
  first_name: string | null;
};

type RenterBookingRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  start_at: string | null;
  end_at: string | null;
  total_price: number | null;
  space?: {
    title: string | null;
    suburb: string | null;
    city: string | null;
  } | null;
};

type RecentNotificationRow = {
  id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  href: string | null;
  is_read: boolean | null;
  created_at: string | null;
};

function formatBookingStart(start: string | null): string {
  if (!start) return "Date TBC";
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return "Date TBC";
  return d.toLocaleString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export default function RenterDashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);

  const [bookings, setBookings] = useState<RenterBookingRow[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentNotificationRow[]>(
    []
  );
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);
  const [savedSpacesCount, setSavedSpacesCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAll() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) setLoading(false);
        return;
      }
      if (!mounted) return;
      setEmail(user.email ?? null);

      // 1) Profile — feeds welcome line + admin/host gating.
      try {
        const { data } = await (supabase.from("profiles") as any)
          .select("id, role, is_host, first_name")
          .eq("id", user.id)
          .single();
        const profile = (data as ProfileRow | null) || null;
        if (mounted) {
          setRole(profile?.role || "user");
          setIsHost(profile?.is_host === true);
          setFirstName(profile?.first_name || null);
        }
      } catch (err) {
        console.warn("renter dashboard profile load failed:", err);
      }

      // 2) Renter bookings — drives totals + upcoming + pending payment.
      try {
        const { data } = await (supabase.from("bookings") as any)
          .select(
            `id, status, payment_status, start_at, end_at, total_price,
             space:spaces(title, suburb, city)`
          )
          .eq("renter_id", user.id)
          .order("start_at", { ascending: false })
          .limit(40);
        if (mounted) setBookings((data as RenterBookingRow[]) || []);
      } catch (err) {
        console.warn("renter dashboard bookings load failed:", err);
      }

      // 3) Recent activity — most-recent unread notifications.
      try {
        const { data } = await (supabase.from("notifications") as any)
          .select("id, type, title, message, href, is_read, read_at, created_at")
          .eq("user_id", user.id)
          .is("read_at", null)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(4);
        if (mounted) setRecentActivity((data as RecentNotificationRow[]) || []);
      } catch (err) {
        console.warn("renter dashboard recent activity load failed:", err);
      }

      // 4) Unread comms count — surface on the Recent comms card.
      try {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null)
          .is("archived_at", null);
        if (mounted && typeof count === "number") {
          setUnreadCommsCount(count);
        }
      } catch (err) {
        console.warn("renter dashboard unread comms count failed:", err);
      }

      // 5) Saved spaces (user_favourites) — degrades gracefully if the
      // table or RLS isn't available for this user.
      try {
        const { count } = await (supabase
          .from("user_favourites" as never) as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (mounted && typeof count === "number") {
          setSavedSpacesCount(count);
        }
      } catch (err) {
        if (mounted) setSavedSpacesCount(null);
      }

      if (mounted) setLoading(false);
    }

    loadAll();
    return () => {
      mounted = false;
    };
  }, []);

  const pendingPaymentCount = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status === "accepted_awaiting_payment" &&
          b.payment_status === "awaiting_payment"
      ).length,
    [bookings]
  );

  const totalBookings = bookings.length;

  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => {
        if (!b.start_at) return false;
        const t = new Date(b.start_at).getTime();
        if (Number.isNaN(t)) return false;
        if (t < now) return false;
        return (
          b.status === "paid_confirmed" ||
          b.status === "confirmed" ||
          b.status === "completed" ||
          b.status === "accepted_awaiting_payment"
        );
      })
      .sort(
        (a, b) =>
          new Date(a.start_at || 0).getTime() -
          new Date(b.start_at || 0).getTime()
      )
      .slice(0, 3);
  }, [bookings]);

  const welcomeName = firstName?.trim() || (email ? email.split("@")[0] : null);

  return (
    <RequireAuth>
      <DashboardShell
        workspaceLabel="My account"
        pageTitle={
          welcomeName ? `Welcome back, ${welcomeName}` : "Welcome back"
        }
        pageSubtitle="Bookings, comms and payments — all in one place."
        pageEyebrowPill={
          role === "admin" ? (
            <span className="inline-flex items-center rounded-full bg-[#0c1d2f] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Admin
            </span>
          ) : null
        }
        navItems={RENTER_NAV}
        activeHref="/dashboard"
      >
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-8 text-sm text-gray-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading your dashboard…
          </div>
        ) : (
          <>
            {/* Action banner — only when there is something to act on. */}
            {pendingPaymentCount > 0 ? (
              <ActionBanner
                title={`${pendingPaymentCount} booking${
                  pendingPaymentCount === 1 ? "" : "s"
                } awaiting payment`}
                description="Pay now to confirm your booking before it expires."
                href="/dashboard/my-bookings"
                ctaLabel="Pay now"
              />
            ) : null}

            {/* Host verification reminders only render when the user is
                a host whose verification still needs attention. */}
            {isHost ? <OwnerVerificationAlerts /> : null}

            {/* PRIMARY CARDS — three workspace summaries. */}
            <section aria-labelledby="renter-overview-primary">
              <h2
                id="renter-overview-primary"
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                At a glance
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
                <SummaryCard
                  title="My bookings"
                  value={totalBookings}
                  subtitle={
                    totalBookings === 0
                      ? "No bookings yet — explore spaces to get started."
                      : "All bookings you've made on FindMySpace."
                  }
                  icon={<CalendarCheck className="h-6 w-6" aria-hidden />}
                  href="/dashboard/my-bookings"
                />
                <SummaryCard
                  title="Pending actions"
                  value={pendingPaymentCount}
                  subtitle={
                    pendingPaymentCount > 0
                      ? "Payments waiting to be completed."
                      : "Nothing needs your attention right now."
                  }
                  icon={<CreditCard className="h-6 w-6" aria-hidden />}
                  href="/dashboard/my-bookings"
                  highlight={pendingPaymentCount > 0}
                />
                <SummaryCard
                  title="Recent comms"
                  value={unreadCommsCount}
                  subtitle={
                    unreadCommsCount > 0
                      ? "Unread messages, questions and updates."
                      : "You're all caught up."
                  }
                  icon={<Inbox className="h-6 w-6" aria-hidden />}
                  href="/dashboard/comms?view=bookings"
                />
              </div>
            </section>

            {/* SECONDARY SECTIONS — recent context. */}
            <section aria-labelledby="renter-overview-secondary">
              <h2
                id="renter-overview-secondary"
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Recent
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {/* Upcoming bookings */}
                <PanelCard
                  title="Upcoming bookings"
                  icon={<CalendarClock className="h-4 w-4" aria-hidden />}
                  footer={
                    <Link
                      href="/dashboard/my-bookings"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0c1d2f] hover:underline"
                    >
                      Open my bookings
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  }
                >
                  {upcomingBookings.length === 0 ? (
                    <EmptyMini text="No upcoming bookings yet." />
                  ) : (
                    <ul className="space-y-2">
                      {upcomingBookings.map((b) => {
                        const where = [b.space?.suburb, b.space?.city]
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <li
                            key={b.id}
                            className="rounded-xl border border-gray-200 bg-white px-3 py-2"
                          >
                            <p className="truncate text-sm font-medium text-[#0c1d2f]">
                              {b.space?.title || "Booking"}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {formatBookingStart(b.start_at)}
                              {where ? ` · ${where}` : ""}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </PanelCard>

                {/* Recent activity */}
                <PanelCard
                  title="Recent activity"
                  icon={<Bell className="h-4 w-4" aria-hidden />}
                  footer={
                    <Link
                      href="/dashboard/notifications"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0c1d2f] hover:underline"
                    >
                      View all activity
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  }
                >
                  {recentActivity.length === 0 ? (
                    <EmptyMini text="No new updates right now." />
                  ) : (
                    <ul className="space-y-2">
                      {recentActivity.slice(0, 3).map((n) => (
                        <li
                          key={n.id}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2"
                        >
                          <Link
                            href={n.href || "/dashboard/comms"}
                            className="block min-w-0"
                          >
                            <p className="truncate text-sm font-medium text-[#0c1d2f]">
                              {n.title || "Notification"}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {formatRelativeShort(n.created_at)}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </PanelCard>

                {/* Saved spaces — placeholder until /dashboard/favourites
                    has its own home. user_favourites already powers the
                    heart on listings and the count below. */}
                <PanelCard
                  title="Saved spaces"
                  icon={<Heart className="h-4 w-4" aria-hidden />}
                  footer={
                    <Link
                      href="/spaces"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0c1d2f] hover:underline"
                    >
                      Discover more spaces
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  }
                >
                  {savedSpacesCount && savedSpacesCount > 0 ? (
                    <p className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[#0c1d2f]">
                      <span className="font-semibold">{savedSpacesCount}</span>{" "}
                      space{savedSpacesCount === 1 ? "" : "s"} saved.
                      <span className="block text-xs text-gray-500">
                        A dedicated page is coming soon.
                      </span>
                    </p>
                  ) : (
                    <EmptyMini
                      text="Tap the heart on listings you love to save them here."
                      icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
                    />
                  )}
                </PanelCard>
              </div>
            </section>

            {/* QUICK LINKS — chips, not full cards, to keep the surface calm. */}
            <section aria-labelledby="renter-overview-quicklinks">
              <h2
                id="renter-overview-quicklinks"
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Quick links
              </h2>
              <div className="flex flex-wrap gap-2">
                <QuickLinkChip
                  href="/dashboard/my-bookings"
                  icon={<CreditCard className="h-3.5 w-3.5" aria-hidden />}
                >
                  Payments
                </QuickLinkChip>
                <QuickLinkChip
                  href="/dashboard/verification"
                  icon={<Settings className="h-3.5 w-3.5" aria-hidden />}
                >
                  Account settings
                </QuickLinkChip>
                <QuickLinkChip
                  href="/spaces"
                  icon={<Search className="h-3.5 w-3.5" aria-hidden />}
                >
                  Browse spaces
                </QuickLinkChip>
                {isHost ? (
                  <QuickLinkChip
                    href="/dashboard/owner"
                    icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden />}
                  >
                    Switch to host dashboard
                  </QuickLinkChip>
                ) : null}
              </div>
            </section>
          </>
        )}
      </DashboardShell>
    </RequireAuth>
  );
}

// ---------------------------------------------------------------------------
// Small UI primitives, scoped to this page so other dashboards can copy /
// adapt them without coupling.
// ---------------------------------------------------------------------------

function ActionBanner({
  title,
  description,
  href,
  ctaLabel,
}: {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="mt-0.5 text-xs text-amber-800">{description}</p>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#0c1d2f] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#0a1726]"
        >
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  href,
  highlight = false,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  href: string;
  highlight?: boolean;
}) {
  // The card is intentionally dense on mobile (2-col grid of compact stat
  // tiles, ~88px tall) and grows into a richer card from `sm:` upwards. This
  // keeps the renter "At a glance" row scannable without filling a phone
  // screen.
  return (
    <Link
      href={href}
      className={`group block rounded-2xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md sm:p-4 ${
        highlight ? "border-amber-300 bg-amber-50/30" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-gray-500 sm:text-[12px]">
            {title}
          </p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-[#0c1d2f] sm:mt-1 sm:text-3xl">
            {value}
          </p>
          {/* Subtitle is hidden on mobile to keep tiles compact. */}
          <p className="mt-2 hidden text-xs leading-relaxed text-gray-600 sm:block">
            {subtitle}
          </p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f7f9fb] text-[#0c1d2f] sm:h-10 sm:w-10 sm:rounded-xl [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-6 sm:[&>svg]:w-6">
          {icon}
        </span>
      </div>
      <p className="mt-3 hidden items-center gap-1 text-xs font-semibold text-[#0c1d2f] opacity-0 transition group-hover:opacity-100 sm:inline-flex">
        Open
        <ArrowRight className="h-3 w-3" aria-hidden />
      </p>
    </Link>
  );
}

function PanelCard({
  title,
  icon,
  children,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0c1d2f] sm:mb-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f7f9fb] text-[#0c1d2f] sm:h-7 sm:w-7">
          {icon}
        </span>
        {title}
      </div>
      <div className="flex-1">{children}</div>
      {footer ? <div className="mt-3 pt-1">{footer}</div> : null}
    </div>
  );
}

function EmptyMini({
  text,
  icon,
}: {
  text: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-[#fbfcfd] px-3 py-3 text-xs text-gray-600">
      {icon || <Sparkles className="h-3.5 w-3.5" aria-hidden />}
      <span>{text}</span>
    </div>
  );
}

function QuickLinkChip({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0c1d2f] shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:bg-[#fbfcfd]"
    >
      <span className="text-[#475569]">{icon}</span>
      {children}
    </Link>
  );
}
