"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApiFetch } from "@/lib/admin-api-client";
import type { AdminInboxCounts } from "@/lib/admin-inbox-counts";

const EMPTY_COUNTS: AdminInboxCounts = {
  unread: 0,
  actionRequired: 0,
  modules: {
    listingEnquiries: 0,
    listingClaimInterests: 0,
    listingReviews: 0,
    verification: 0,
    pendingBookingPayments: 0,
  },
};

export function useAdminInboxCounts() {
  const [counts, setCounts] = useState<AdminInboxCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = (await adminApiFetch("/api/admin/inbox-counts")) as AdminInboxCounts;
      setCounts({
        unread: data.unread ?? 0,
        actionRequired: data.actionRequired ?? 0,
        modules: {
          listingEnquiries: data.modules?.listingEnquiries ?? 0,
          listingClaimInterests: data.modules?.listingClaimInterests ?? 0,
          listingReviews: data.modules?.listingReviews ?? 0,
          verification: data.modules?.verification ?? 0,
          pendingBookingPayments: data.modules?.pendingBookingPayments ?? 0,
        },
      });
    } catch {
      setCounts(EMPTY_COUNTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    function onRefresh() {
      void refresh();
    }

    window.addEventListener("fms-inbox-refresh", onRefresh);
    window.addEventListener("fms-admin-badge-refresh", onRefresh);
    return () => {
      window.removeEventListener("fms-inbox-refresh", onRefresh);
      window.removeEventListener("fms-admin-badge-refresh", onRefresh);
    };
  }, [refresh]);

  return { counts, loading, refresh };
}
