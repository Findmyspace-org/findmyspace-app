"use client";

import { useEffect, useMemo, useState } from "react";
import { hostingNavItems } from "@/lib/dashboard-nav";
import type { DashboardNavItem } from "@/app/components/DashboardShell";
import {
  hostingHref,
  resolveHostingOrganisationId,
  type HostingAccessSummary,
} from "@/lib/access/hosting-access";
import { fetchHostingAccessSummary } from "@/lib/hosting-access-client";

const EMPTY_SUMMARY: HostingAccessSummary = {
  hasHostingAccess: false,
  isGlobalAdmin: false,
  isOrganisationAdmin: false,
  isPropertyManager: false,
  isSpaceManager: false,
  isLegacyHost: false,
  showProperties: false,
  showFinance: false,
  showPeople: false,
  showVerification: false,
  showCreateSpace: false,
  organisationIds: [],
  primaryOrganisationId: null,
};

export function useHostingWorkspace(requestedId?: string | null) {
  const [summary, setSummary] = useState<HostingAccessSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchHostingAccessSummary()
      .then((next) => {
        if (mounted) setSummary(next);
      })
      .catch(() => {
        if (mounted) setSummary(EMPTY_SUMMARY);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const organisationId = useMemo(
    () =>
      resolveHostingOrganisationId({
        requestedId: requestedId ?? null,
        organisationIds: summary.organisationIds,
        primaryOrganisationId: summary.primaryOrganisationId,
      }),
    [requestedId, summary.organisationIds, summary.primaryOrganisationId]
  );

  const navItems: DashboardNavItem[] = useMemo(
    () => hostingNavItems(summary, organisationId),
    [summary, organisationId]
  );

  return {
    summary,
    loading,
    organisationId,
    navItems,
    ownerHref: hostingHref("/dashboard/owner", organisationId),
    listingsHref: hostingHref("/dashboard/listings", organisationId),
  };
}
