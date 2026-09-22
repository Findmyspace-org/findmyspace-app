"use client";

import { useEffect, useMemo, useState } from "react";
import { hostingNavItems } from "@/lib/dashboard-nav";
import type { DashboardNavItem } from "@/app/components/DashboardShell";
import { useSearchParams } from "next/navigation";
import {
  hostingHref,
  type HostingAccessSummary,
} from "@/lib/access/hosting-access";
import {
  hostingContextFromSummary,
  hostingContextHrefOrganisationId,
  hostingContextOrganisationId,
  type HostingContext,
} from "@/lib/access/hosting-context";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
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
  showOrganisationCommercial: false,
  showVerification: false,
  showCreateSpace: false,
  organisationIds: [],
  primaryOrganisationId: null,
};

export function useHostingWorkspace(requestedId?: string | null) {
  const searchParams = useSearchParams();
  const requestedFromUrl = searchParams.get(ORGANISATION_QUERY_PARAM);
  const requestedOrganisationId =
    requestedId !== undefined ? requestedId : requestedFromUrl;
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

  const context: HostingContext = useMemo(
    () => hostingContextFromSummary(summary, requestedOrganisationId),
    [requestedOrganisationId, summary]
  );
  const organisationId = hostingContextOrganisationId(context);
  const hrefOrganisationId = hostingContextHrefOrganisationId(
    context,
    requestedOrganisationId
  );

  const navItems: DashboardNavItem[] = useMemo(
    () => hostingNavItems(summary, hrefOrganisationId),
    [summary, hrefOrganisationId]
  );

  return {
    summary,
    loading,
    context,
    organisationId,
    requestedOrganisationId: requestedOrganisationId?.trim() || null,
    hrefOrganisationId,
    navItems,
    ownerHref: hostingHref("/dashboard/owner", hrefOrganisationId),
    listingsHref: hostingHref("/dashboard/listings", hrefOrganisationId),
    propertiesHref: hostingHref("/dashboard/properties", hrefOrganisationId),
  };
}
