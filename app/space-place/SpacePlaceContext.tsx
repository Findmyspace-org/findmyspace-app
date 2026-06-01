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
import type { CrmProfile } from "@/lib/space-place/types";

type SpacePlaceContextValue = {
  profile: CrmProfile | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
};

const SpacePlaceContext = createContext<SpacePlaceContextValue | null>(null);

export function SpacePlaceProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<CrmProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
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

      if (existing) {
        if (!existing.active) {
          setProfile(null);
          setError("Your Space Place access is inactive.");
          return;
        }
        setProfile(existing as CrmProfile);
        return;
      }

      const { data: platformProfile } = await supabase
        .from("profiles")
        .select("role, full_name, email, phone")
        .eq("id", user.id)
        .maybeSingle();

      const isPlatformAdmin =
        (platformProfile as { role?: string } | null)?.role === "admin";

      if (!isPlatformAdmin) {
        setProfile(null);
        setError(
          "You do not have access to The Space Place yet. Ask an admin to add you."
        );
        return;
      }

      const insertPayload = {
        id: user.id,
        full_name:
          (platformProfile as { full_name?: string } | null)?.full_name ||
          user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          "Spacer",
        email: user.email,
        phone: (platformProfile as { phone?: string } | null)?.phone ?? null,
        role: "admin" as const,
        active: true,
      };

      const { data: created, error: upsertErr } = await crmDb
        .profiles()
        .upsert(insertPayload, { onConflict: "id" })
        .select("*")
        .single();

      if (upsertErr) {
        setError(upsertErr.message);
        return;
      }

      setProfile(created as CrmProfile);
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
      refreshProfile,
    }),
    [profile, loading, error, refreshProfile]
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
