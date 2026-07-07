"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const OVERVIEW_STALE_KEY = "crm-overview-stale";

type CrmRefreshContextValue = {
  version: number;
  invalidate: () => void;
};

const CrmRefreshContext = createContext<CrmRefreshContextValue | null>(null);

export function CrmRefreshProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);

  const invalidate = useCallback(() => {
    setVersion((current) => current + 1);
    try {
      sessionStorage.setItem(OVERVIEW_STALE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      version,
      invalidate,
    }),
    [version, invalidate]
  );

  return (
    <CrmRefreshContext.Provider value={value}>
      {children}
    </CrmRefreshContext.Provider>
  );
}

export function useCrmRefresh() {
  const ctx = useContext(CrmRefreshContext);
  if (!ctx) {
    throw new Error("useCrmRefresh must be used within CrmRefreshProvider");
  }
  return ctx;
}

/** Returns true when overview data should be refetched on next mount. */
export function consumeCrmOverviewStale(): boolean {
  try {
    const stale = sessionStorage.getItem(OVERVIEW_STALE_KEY) === "1";
    if (stale) {
      sessionStorage.removeItem(OVERVIEW_STALE_KEY);
    }
    return stale;
  } catch {
    return false;
  }
}

/** Hook for overview page: refetch when invalidate() runs or stale flag is set. */
export function useCrmOverviewRefresh(onRefresh: () => void) {
  const { version } = useCrmRefresh();

  useEffect(() => {
    if (consumeCrmOverviewStale()) {
      onRefresh();
      return;
    }
    onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only version bumps trigger refetch
  }, [version]);
}
