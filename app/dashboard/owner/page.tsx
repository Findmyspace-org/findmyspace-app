"use client";

/**
 * /dashboard/owner — host workspace overview.
 *
 * IA model:
 *   - This page is the primary destination for hosts. After they land here
 *     the burger menu should rarely be needed; all hosting tasks are reached
 *     through the workspace sidebar (lg+) or horizontal pill tabs (mobile).
 *   - Routes for listings, requests, comms, calendar, finance, verification
 *     and listing questions are preserved as-is and linked from this page.
 *
 * The previous implementation rendered an ad-hoc top nav strip that
 * duplicated the global header; that's now replaced by `DashboardShell`.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  HelpCircle,
  HousePlus,
  Inbox,
  Landmark,
  LayoutDashboard,
  Loader2,
  Mail,
  Settings,
  UserCircle2,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import DashboardShell from "@/app/components/DashboardShell";
import { HOST_NAV } from "@/lib/dashboard-nav";
import OwnerVerificationAlerts from "@/app/components/OwnerVerificationAlerts";
import RequireAuth from "@/app/components/RequireAuth";

type OwnerDashboardListing = {
  id: string;
  title: string | null;
  suburb: string | null;
  city: string | null;
  status: string | null;
  verification_status: string | null;
  created_at?: string | null;
};

type OwnerDashboardBooking = {
  id: string;
  space_id: string;
  status: string | null;
  payment_status: string | null;
  start_at: string;
  end_at: string;
  total_price: number | null;
  created_at?: string | null;
  space?: {
    title: string | null;
  } | null;
  renter?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
};

type OwnerProfile = {
  id: string;
  id_verification_status?: string | null;
  is_host?: boolean | null;
};

function formatCompactMoney(amount: number) {
  return `R ${amount.toLocaleString("en-ZA")}`;
}

export default function HostDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listings, setListings] = useState<OwnerDashboardListing[]>([]);
  const [bookings, setBookings] = useState<OwnerDashboardBooking[]>([]);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [pendingQuestionsCount, setPendingQuestionsCount] = useState(0);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          setError("Please log in to view your host dashboard.");
          setLoading(false);
          return;
        }

        const { data: profileData } = await (supabase.from("profiles") as any)
          .select("id, id_verification_status, is_host")
          .eq("id", user.id)
          .single();

        setProfile((profileData || null) as OwnerProfile | null);

        const { data: listingData, error: listingError } = await (supabase
          .from("spaces") as any)
          .select(
            "id, title, suburb, city, status, verification_status, created_at"
          )
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false });

        if (listingError) throw listingError;

        const nextListings = (listingData || []) as OwnerDashboardListing[];
        setListings(nextListings);

        const listingIds = nextListings.map((listing) => listing.id);

        if (listingIds.length === 0) {
          setBookings([]);
        } else {
          const { data: bookingData, error: bookingError } = await (supabase
            .from("bookings") as any)
            .select(
              `
                id,
                space_id,
                status,
                payment_status,
                start_at,
                end_at,
                total_price,
                created_at,
                space:spaces(title),
                renter:profiles!bookings_renter_id_fkey(first_name, last_name, email)
              `
            )
            .in("space_id", listingIds)
            .order("created_at", { ascending: false });

          if (bookingError) throw bookingError;

          setBookings((bookingData || []) as OwnerDashboardBooking[]);
        }

        // Pending listing yes/no questions — primary inbox metric for hosts.
        try {
          const { count } = await (supabase.from(
            "listing_yes_no_questions"
          ) as any)
            .select("id", { count: "exact", head: true })
            .eq("owner_id", user.id)
            .eq("status", "pending");
          if (typeof count === "number") setPendingQuestionsCount(count);
        } catch (qErr) {
          console.warn("Pending listing questions count failed:", qErr);
        }
      } catch (loadError: any) {
        setError(loadError?.message || "Could not load host dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const activeListingsCount = useMemo(
    () => listings.filter((listing) => listing.status === "active").length,
    [listings]
  );

  const pendingRequestsCount = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === "pending" || booking.status === "pending_owner"
      ).length,
    [bookings]
  );

  const awaitingPaymentCount = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === "approved" ||
          booking.status === "accepted_awaiting_payment" ||
          booking.payment_status === "awaiting_payment"
      ).length,
    [bookings]
  );

  const confirmedBookingsCount = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === "paid_confirmed" ||
          booking.status === "confirmed" ||
          booking.status === "completed"
      ).length,
    [bookings]
  );

  const monthlyIncome = useMemo(() => {
    const now = new Date();
    return bookings.reduce((sum, booking) => {
      const isConfirmed =
        booking.status === "paid_confirmed" ||
        booking.status === "confirmed" ||
        booking.status === "completed";
      if (!isConfirmed || !booking.created_at) return sum;
      const created = new Date(booking.created_at);
      const sameMonth =
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth();
      if (!sameMonth) return sum;
      return sum + Number(booking.total_price || 0);
    }, 0);
  }, [bookings]);

  const pendingListingApprovalCount = useMemo(
    () =>
      listings.filter(
        (listing) =>
          listing.verification_status === "pending" ||
          listing.verification_status === "needs_clarification" ||
          listing.status === "pending"
      ).length,
    [listings]
  );

  const profileNeedsAttention = useMemo(
    () => profile?.id_verification_status !== "verified",
    [profile]
  );

  return (
    <RequireAuth>
      <DashboardShell
        workspaceLabel="Hosting"
        pageTitle="Host dashboard"
        pageSubtitle="Respond to requests, keep listings up to date, and track earnings — all in one workspace."
        navItems={HOST_NAV}
        activeHref="/dashboard/owner"
      >
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-8 text-sm text-gray-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading your host dashboard…
          </div>
        ) : (
          <>
            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {/* Verification reminders — only render when relevant. */}
            <OwnerVerificationAlerts />

            {/* TOP METRICS — what hosts most often act on. */}
            <section aria-labelledby="host-overview-metrics">
              <h2
                id="host-overview-metrics"
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Today
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
                <MetricCard
                  title="Pending booking requests"
                  value={pendingRequestsCount}
                  subtitle="Waiting for your response"
                  icon={<Mail className="h-6 w-6" aria-hidden />}
                  href="/dashboard/requests"
                  highlight={pendingRequestsCount > 0}
                />
                <MetricCard
                  title="Pending questions"
                  value={pendingQuestionsCount}
                  subtitle="Yes/no questions from renters"
                  icon={<HelpCircle className="h-6 w-6" aria-hidden />}
                  href="/dashboard/comms?view=hosting"
                  highlight={pendingQuestionsCount > 0}
                />
                <MetricCard
                  title="Revenue this month"
                  value={formatCompactMoney(monthlyIncome)}
                  subtitle="Confirmed booking income"
                  icon={<Wallet className="h-6 w-6" aria-hidden />}
                  href="/dashboard/finance"
                />
                <MetricCard
                  title="Listings awaiting approval"
                  value={pendingListingApprovalCount}
                  subtitle={
                    pendingListingApprovalCount > 0
                      ? "Items in admin review"
                      : `${activeListingsCount} active listing${
                          activeListingsCount === 1 ? "" : "s"
                        }`
                  }
                  icon={<BadgeCheck className="h-6 w-6" aria-hidden />}
                  href="/dashboard/listings"
                  highlight={pendingListingApprovalCount > 0}
                />
              </div>
            </section>

            {/* PRIMARY WORKSPACE SECTIONS — main host actions. */}
            <section aria-labelledby="host-overview-workspace">
              <h2
                id="host-overview-workspace"
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Workspace
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <WorkspaceCard
                  title="My listings"
                  description="Manage spaces, photos, pricing and availability."
                  icon={<Building2 className="h-5 w-5" aria-hidden />}
                  href="/dashboard/listings"
                  meta={`${activeListingsCount} active`}
                />
                <WorkspaceCard
                  title="Booking requests"
                  description="Approve or decline pending requests on your listings."
                  icon={<ClipboardList className="h-5 w-5" aria-hidden />}
                  href="/dashboard/requests"
                  meta={
                    pendingRequestsCount > 0
                      ? `${pendingRequestsCount} pending`
                      : "All caught up"
                  }
                  emphasised={pendingRequestsCount > 0}
                />
                <WorkspaceCard
                  title="Comms"
                  description="Renter questions, booking messages and platform updates."
                  icon={<Inbox className="h-5 w-5" aria-hidden />}
                  href="/dashboard/comms?view=hosting"
                  meta={
                    pendingQuestionsCount > 0
                      ? `${pendingQuestionsCount} to answer`
                      : "Inbox"
                  }
                  emphasised={pendingQuestionsCount > 0}
                />
              </div>
            </section>

            {/* SECONDARY — operational details surfaced at a glance. */}
            <section aria-labelledby="host-overview-detail">
              <h2
                id="host-overview-detail"
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Operations
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <DetailCard
                  title="Awaiting payment"
                  value={awaitingPaymentCount}
                  subtitle="Approved bookings waiting on the renter"
                  icon={<CreditCard className="h-5 w-5" aria-hidden />}
                  href="/dashboard/requests"
                  highlight={awaitingPaymentCount > 0}
                />
                <DetailCard
                  title="Confirmed bookings"
                  value={confirmedBookingsCount}
                  subtitle="Paid and on the calendar"
                  icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
                  href="/dashboard/calendar"
                />
                <DetailCard
                  title="Profile & verification"
                  value={profileNeedsAttention ? "Action" : "OK"}
                  subtitle={
                    profileNeedsAttention
                      ? "ID verification required"
                      : "Profile verified"
                  }
                  icon={
                    profileNeedsAttention ? (
                      <AlertCircle className="h-5 w-5" aria-hidden />
                    ) : (
                      <UserCircle2 className="h-5 w-5" aria-hidden />
                    )
                  }
                  href="/dashboard/verification"
                  highlight={profileNeedsAttention}
                />
              </div>
            </section>

            {/* SECONDARY TOOLS — calendar, verification, finance shortcuts.
                Mirrors the sidebar but as tactile chips for users who prefer
                buttons to a tree. */}
            <section aria-labelledby="host-overview-tools">
              <h2
                id="host-overview-tools"
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Tools
              </h2>
              <div className="flex flex-wrap gap-2">
                <ToolChip
                  href="/dashboard/calendar"
                  icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
                >
                  Calendar
                </ToolChip>
                <ToolChip
                  href="/dashboard/verification"
                  icon={<Settings className="h-3.5 w-3.5" aria-hidden />}
                >
                  Verification &amp; settings
                </ToolChip>
                <ToolChip
                  href="/dashboard/finance"
                  icon={<Landmark className="h-3.5 w-3.5" aria-hidden />}
                >
                  Finance
                </ToolChip>
                <ToolChip
                  href="/dashboard/new-space"
                  icon={<HousePlus className="h-3.5 w-3.5" aria-hidden />}
                >
                  List a new space
                </ToolChip>
                <ToolChip
                  href="/dashboard"
                  icon={<LayoutDashboard className="h-3.5 w-3.5" aria-hidden />}
                >
                  Switch to my dashboard
                </ToolChip>
              </div>
            </section>
          </>
        )}
      </DashboardShell>
    </RequireAuth>
  );
}

// ---------------------------------------------------------------------------
// UI primitives, scoped to the host dashboard.
// ---------------------------------------------------------------------------

function MetricCard({
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
  // Mirror the renter SummaryCard behaviour: compact tile on mobile, richer
  // card on desktop. Hosts often have 4 metric cards so on phones we want a
  // tight 2-col grid that fits above the fold.
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
          <p className="mt-0.5 break-words text-2xl font-semibold tracking-tight text-[#0c1d2f] sm:mt-1 sm:text-3xl">
            {value}
          </p>
          {/* Subtitle hidden on mobile to keep tiles short. */}
          <p className="mt-2 hidden text-xs leading-relaxed text-gray-600 sm:block">
            {subtitle}
          </p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f7f9fb] text-[#0c1d2f] sm:h-10 sm:w-10 sm:rounded-xl [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-6 sm:[&>svg]:w-6">
          {icon}
        </span>
      </div>
    </Link>
  );
}

function WorkspaceCard({
  title,
  description,
  icon,
  href,
  meta,
  emphasised = false,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  meta?: string;
  emphasised?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col rounded-2xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md sm:p-4 ${
        emphasised ? "border-[#0c1d2f]/40 bg-[#fbfcfd]" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0c1d2f] text-white">
          {icon}
        </span>
        <p className="text-sm font-semibold text-[#0c1d2f]">{title}</p>
      </div>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-gray-600">
        {description}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        {meta ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              emphasised
                ? "bg-[#0c1d2f] text-white"
                : "bg-[#f7f9fb] text-[#475569]"
            }`}
          >
            {meta}
          </span>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 font-semibold text-[#0c1d2f] opacity-0 transition group-hover:opacity-100">
          Open
          <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function DetailCard({
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
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col rounded-2xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md sm:p-4 ${
        highlight ? "border-amber-300 bg-amber-50/30" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f7f9fb] text-[#0c1d2f] sm:h-7 sm:w-7">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-[#0c1d2f]">
        {value}
      </p>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-gray-600">
        {subtitle}
      </p>
    </Link>
  );
}

function ToolChip({
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
