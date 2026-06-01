"use client";

import { crmDb } from "@/lib/space-place/db";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  hasSpacePlaceAccess,
  SPACE_PLACE_ACCESS_DENIED_MESSAGE,
} from "@/lib/space-place/access";
import type { CrmProfile } from "@/lib/space-place/types";

type SpacePlaceContextValue = {
  profile: CrmProfile | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  canBootstrapMainAdmin: boolean;
  refreshProfile: () => Promise<void>;
};

const SpacePlaceContext = createContext<SpacePlaceContextValue | null>(null);

export function SpacePlaceProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<CrmProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canBootstrapMainAdmin, setCanBootstrapMainAdmin] = useState(false);

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCanBootstrapMainAdmin(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProfile(null);
        setError("Not signed in.");
        return;
      }

      const { data: existing, error: fetchErr } = await crmDb
        .profiles()
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (fetchErr) {
        setError(fetchErr.message);
        return;
      }

      const crmRow = existing as CrmProfile | null;

      if (crmRow && hasSpacePlaceAccess(crmRow)) {
        setProfile(crmRow);
        return;
      }

      if (crmRow && !crmRow.active) {
        setProfile(null);
        setError("Your Space Place access has been deactivated.");
        return;
      }

      if (crmRow && !hasSpacePlaceAccess(crmRow)) {
        setProfile(null);
        setError(SPACE_PLACE_ACCESS_DENIED_MESSAGE);
        return;
      }

      const { data: platformProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const isPlatformAdmin =
        (platformProfile as { role?: string } | null)?.role === "admin";

      if (isPlatformAdmin) {
        setProfile(null);
        setCanBootstrapMainAdmin(true);
        setError(null);
        return;
      }

      setProfile(null);
      setError(SPACE_PLACE_ACCESS_DENIED_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const value = useMemo(
    () => ({
      profile,
      loading,
      error,
      isAdmin: profile?.role === "admin",
      canBootstrapMainAdmin,
      refreshProfile,
    }),
    [profile, loading, error, canBootstrapMainAdmin, refreshProfile]
  );

  return (
    <SpacePlaceContext.Provider value={value}>
      {children}
    </SpacePlaceContext.Provider>
  );
}

export function useSpacePlace() {
  const ctx = useContext(SpacePlaceContext);
  if (!ctx) {
    throw new Error("useSpacePlace must be used within SpacePlaceProvider");
  }
  return ctx;
}
