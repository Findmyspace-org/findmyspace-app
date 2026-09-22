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
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import DashboardShell from "@/app/components/DashboardShell";
import { useHostingWorkspace } from "@/lib/use-hosting-workspace";
import OwnerVerificationAlerts from "@/app/components/OwnerVerificationAlerts";
import RequireAuth from "@/app/components/RequireAuth";
import {
  HostingOpsStrip,
  HostingSectionLabel,
  HostingSummaryStrip,
  HostingWorkspaceList,
  HostingWorkspaceRow,
  hostingPrimaryActionClass,
} from "@/app/components/hosting/hosting-ui";
import { hostingHref } from "@/lib/access/hosting-access";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { fetchOrganisationCommercial } from "@/lib/organisation-commercial-client";
import type { OrganisationCommercialBundle } from "@/lib/organisation-commercial-dto";
import {
  hostingOverviewVerificationKind,
  organisationOverviewCard,
} from "@/lib/hosting-overview-commercial";
import {
  hostingOverviewOpsItems,
  hostingOverviewSummaryItems,
} from "@/lib/hosting-overview-layout";

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

function HostDashboardPageContent() {
  const searchParams = useSearchParams();
  const requestedOrganisationId = searchParams.get(ORGANISATION_QUERY_PARAM);
  const hosting = useHostingWorkspace(requestedOrganisationId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listings, setListings] = useState<OwnerDashboardListing[]>([]);
  const [bookings, setBookings] = useState<OwnerDashboardBooking[]>([]);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [pendingQuestionsCount, setPendingQuestionsCount] = useState(0);
  const [commercial, setCommercial] =
    useState<OrganisationCommercialBundle | null>(null);

  const verificationKind = hostingOverviewVerificationKind({
    organisationId: hosting.organisationId,
    showOrganisationCommercial: hosting.summary.showOrganisationCommercial,
    isLegacyHost: hosting.summary.isLegacyHost,
  });
  const orgHref = (pathname: string) =>
    hostingHref(pathname, hosting.organisationId);

  useEffect(() => {
    if (hosting.loading) return;
    if (!hosting.summary.hasHostingAccess) {
      window.location.replace("/dashboard/become-host");
    }
  }, [hosting.loading, hosting.summary.hasHostingAccess]);

  useEffect(() => {
    if (verificationKind !== "organisation" || !hosting.organisationId) {
      setCommercial(null);
      return;
    }
    const organisationId = hosting.organisationId;
    let mounted = true;
    fetchOrganisationCommercial(organisationId)
      .then((bundle) => {
        if (mounted) setCommercial(bundle);
      })
      .catch(() => {
        if (mounted) setCommercial(null);
      });
    return () => {
      mounted = false;
    };
  }, [verificationKind, hosting.organisationId]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { session },
          error: authError,
        } = await supabase.auth.getSession();

        if (authError || !session?.user) {
          setError("Please log in to view Hosting.");
          setLoading(false);
          return;
        }

        const user = session.user;

        const { data: profileData } = await (supabase.from("profiles") as any)
          .select("id, id_verification_status, is_host")
          .eq("id", user.id)
          .single();

        setProfile((profileData || null) as OwnerProfile | null);

        const { fetchManagedSpaces } = await import("@/lib/host-managed-spaces-client");
        const managed = session.access_token
          ? await fetchManagedSpaces(session.access_token)
          : [];
        const nextListings = managed.map((space) => ({
          id: space.id,
          title: space.title,
          suburb: space.suburb ?? null,
          city: space.city ?? null,
          status: space.status ?? null,
          verification_status: null,
          created_at: null,
        })) as OwnerDashboardListing[];
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
        setError(loadError?.message || "Could not load Hosting.");
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

  const organisationCard = useMemo(() => {
    if (verificationKind !== "organisation" || !hosting.organisationId) {
      return null;
    }
    if (!commercial?.payout_readiness) return null;
    return organisationOverviewCard({
      organisationId: hosting.organisationId,
      payout: commercial.payout_readiness,
      verificationStatus: commercial.commercial?.verification_status ?? null,
      verificationSubmittedAt: commercial.commercial?.submitted_at ?? null,
      verificationRejectionReason:
        commercial.commercial?.rejection_reason ?? null,
    });
  }, [commercial, hosting.organisationId, verificationKind]);

  const summaryItems = hostingOverviewSummaryItems({
    pendingRequestsCount,
    pendingQuestionsCount,
    monthlyIncomeLabel: formatCompactMoney(monthlyIncome),
    activeListingsCount,
    pendingListingApprovalCount,
    showFinance: hosting.summary.showFinance,
    requestsHref: orgHref("/dashboard/requests"),
    commsHref: orgHref("/dashboard/comms?view=hosting"),
    financeHref: orgHref("/dashboard/finance"),
    listingsHref: orgHref("/dashboard/listings"),
  });

  const opsItems = hostingOverviewOpsItems({
    awaitingPaymentCount,
    confirmedBookingsCount,
    requestsHref: orgHref("/dashboard/requests"),
    calendarHref: orgHref("/dashboard/calendar"),
    organisationCard,
    personalVerification:
      verificationKind === "personal"
        ? {
            needsAttention: profileNeedsAttention,
            href: "/dashboard/verification",
          }
        : null,
  });

  return (
    <RequireAuth>
      <DashboardShell
        workspaceLabel="Hosting"
        pageTitle="Overview"
        navItems={hosting.navItems}
        activeHref="/dashboard/owner"
        pageActions={
          hosting.summary.showCreateSpace ? (
            <Link
              href={orgHref("/dashboard/new-space")}
              className={hostingPrimaryActionClass}
            >
              List a space
            </Link>
          ) : null
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading Hosting…
          </div>
        ) : (
          <>
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {verificationKind === "personal" ? <OwnerVerificationAlerts /> : null}

            <HostingSummaryStrip items={summaryItems} />

            <section aria-labelledby="host-overview-workspace">
              <HostingSectionLabel id="host-overview-workspace">
                Workspace
              </HostingSectionLabel>
              <HostingWorkspaceList labelledBy="host-overview-workspace">
                <HostingWorkspaceRow
                  title="My spaces"
                  description="Manage the spaces people can book."
                  href={orgHref("/dashboard/listings")}
                  status={
                    pendingListingApprovalCount > 0
                      ? `${pendingListingApprovalCount} pending review`
                      : `${activeListingsCount} active`
                  }
                  attention={pendingListingApprovalCount > 0}
                />
                <HostingWorkspaceRow
                  title="Booking requests"
                  description="Approve or decline pending requests."
                  href={orgHref("/dashboard/requests")}
                  status={
                    pendingRequestsCount > 0
                      ? `${pendingRequestsCount} pending`
                      : "All caught up"
                  }
                  attention={pendingRequestsCount > 0}
                />
                <HostingWorkspaceRow
                  title="Comms"
                  description="Renter questions and booking messages."
                  href={orgHref("/dashboard/comms?view=hosting")}
                  status={
                    pendingQuestionsCount > 0
                      ? `${pendingQuestionsCount} to answer`
                      : "Inbox"
                  }
                  attention={pendingQuestionsCount > 0}
                />
              </HostingWorkspaceList>
            </section>

            <section aria-labelledby="host-overview-detail">
              <HostingSectionLabel id="host-overview-detail">
                Operations
              </HostingSectionLabel>
              <HostingOpsStrip items={opsItems} />
            </section>
          </>
        )}
      </DashboardShell>
    </RequireAuth>
  );
}

export default function HostDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 px-6 py-10 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading Hosting…
        </div>
      }
    >
      <HostDashboardPageContent />
    </Suspense>
  );
}
