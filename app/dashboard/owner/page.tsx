"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Home,
  Landmark,
  LayoutDashboard,
  Mail,
  UserCircle2,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

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
};

type StatCardProps = {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle: string;
  href: string;
  highlight?: boolean;
};

function formatCompactMoney(amount: number) {
  return `R ${amount.toLocaleString("en-ZA")}`;
}

function getStatValueClass(value: string | number) {
  const stringValue = String(value);

  if (typeof value === "number") {
    return "text-4xl";
  }

  if (stringValue.length <= 4) {
    return "text-4xl";
  }

  if (stringValue.length <= 8) {
    return "text-3xl";
  }

  return "text-2xl leading-tight";
}

function StatCard({ title, value, icon, subtitle, href, highlight = false }: StatCardProps) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border bg-white p-4 shadow-sm transition hover:border-gray-300 hover:bg-[#fbfcfd] ${highlight ? "border-amber-300 bg-amber-50/30" : "border-gray-200"}`}
    >
      <div className="flex min-h-[120px] items-stretch justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <p className="text-[13px] font-medium text-gray-500">{title}</p>
          </div>
          <p className="max-w-[26ch] text-sm leading-6 text-gray-600">{subtitle}</p>
        </div>

        <div className="flex w-[132px] shrink-0 flex-col items-center justify-between border-l border-gray-200 pl-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-[#f7f9fb] text-[#192a3a]">
            {icon}
          </div>
          <p
            className={`w-full break-words text-center font-semibold tracking-tight text-[#192a3a] ${getStatValueClass(
              value
            )}`}
          >
            {value}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function OwnerDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listings, setListings] = useState<OwnerDashboardListing[]>([]);
  const [bookings, setBookings] = useState<OwnerDashboardBooking[]>([]);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);

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
          setError("Please log in to view your owner dashboard.");
          setLoading(false);
          return;
        }

        const { data: profileData } = await (supabase.from("profiles") as any)
          .select("id, id_verification_status")
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

        if (listingError) {
          throw listingError;
        }

        const nextListings = (listingData || []) as OwnerDashboardListing[];
        setListings(nextListings);

        const listingIds = nextListings.map((listing) => listing.id);

        if (listingIds.length === 0) {
          setBookings([]);
          setLoading(false);
          return;
        }

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

        if (bookingError) {
          throw bookingError;
        }

        setBookings((bookingData || []) as OwnerDashboardBooking[]);
      } catch (loadError: any) {
        setError(loadError?.message || "Could not load owner dashboard.");
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

  const pendingListingVerificationCount = useMemo(
    () =>
      listings.filter(
        (listing) =>
          listing.verification_status === "pending" ||
          listing.verification_status === "needs_clarification"
      ).length,
    [listings]
  );

  const activeVerifiedListingsCount = useMemo(
    () =>
      listings.filter(
        (listing) =>
          listing.status === "active" && listing.verification_status === "verified"
      ).length,
    [listings]
  );

  const profileNeedsAttention = useMemo(
    () => profile?.id_verification_status !== "verified",
    [profile]
  );

  return (
    <div className="min-h-screen bg-[#f7f9fb]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4">
          <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-[#192a3a] shadow-sm">
            <LayoutDashboard className="h-4 w-4" />
            <span>Overview</span>
          </div>
          <Link
            href="/dashboard/listings"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]"
          >
            <Home className="h-4 w-4" />
            <span>Listings</span>
          </Link>
          <Link
            href="/dashboard/requests"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]"
          >
            <ClipboardList className="h-4 w-4" />
            <span>Requests</span>
          </Link>
          <Link
            href="/dashboard/calendar"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]"
          >
            <CalendarDays className="h-4 w-4" />
            <span>Calendar</span>
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]"
          >
            <Landmark className="h-4 w-4" />
            <span>Finance</span>
          </button>
        </div>

        <div className="mb-6 rounded-md border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            Owner dashboard
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#192a3a] sm:text-3xl">
            Manage your spaces with confidence
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            See what needs attention, respond to booking requests quickly, and keep
            track of your listings, availability, and payments from one place.
          </p>

        </div>

        {error && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Active listings"
            value={activeListingsCount}
            icon={<Home className="h-7 w-7" />}
            subtitle="Visible to renters"
            href="/dashboard/listings"
          />
          <StatCard
            title="Pending requests"
            value={pendingRequestsCount}
            icon={<Mail className="h-7 w-7" />}
            subtitle="Waiting for your response"
            href="/dashboard/requests"
            highlight={pendingRequestsCount > 0}
          />
          <StatCard
            title="Awaiting payment"
            value={awaitingPaymentCount}
            icon={<CreditCard className="h-7 w-7" />}
            subtitle="Waiting for renter payment"
            href="/dashboard/requests"
            highlight={awaitingPaymentCount > 0}
          />
          <StatCard
            title="Confirmed bookings"
            value={confirmedBookingsCount}
            icon={<CheckCircle2 className="h-7 w-7" />}
            subtitle="Paid and confirmed"
            href="/dashboard/calendar"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="Income for the month"
            value={formatCompactMoney(monthlyIncome)}
            icon={<Wallet className="h-7 w-7" />}
            subtitle="Confirmed booking income"
            href="/dashboard/finance"
          />
          <StatCard
            title="Manage profile"
            value={profileNeedsAttention ? "!" : "OK"}
            icon={profileNeedsAttention ? <AlertCircle className="h-7 w-7" /> : <UserCircle2 className="h-7 w-7" />}
            subtitle={profileNeedsAttention ? "ID verification required" : "Profile up to date"}
            href="/dashboard/verification"
            highlight={profileNeedsAttention}
          />
          <StatCard
            title="Listing verification"
            value={pendingListingVerificationCount > 0 ? "Pending" : activeVerifiedListingsCount}
            icon={<BadgeCheck className="h-7 w-7" />}
            subtitle={pendingListingVerificationCount > 0 ? `${pendingListingVerificationCount} items need review` : pendingListingVerificationCount === 0 && activeVerifiedListingsCount === 0 ? "None" : `${activeVerifiedListingsCount} active verified`}
            href="/dashboard/listings"
            highlight={pendingListingVerificationCount > 0}
          />
        </div>
      </div>
    </div>
  );
}