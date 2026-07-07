"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { crmDb } from "@/lib/space-place/db";
import {
  canAccessCrmDesktop,
  CRM_DESKTOP_ACCESS_DENIED,
} from "@/lib/crm-desktop/access";
import { hasSpacePlaceAccess } from "@/lib/space-place/access";
import { isPlatformAdminRole } from "@/lib/admin-roles";
import type { CrmProfile } from "@/lib/space-place/types";

type CrmDesktopContextValue = {
  profile: CrmProfile | null;
  platformRole: string | null;
  loading: boolean;
  error: string | null;
  canAccessDesktop: boolean;
  isMainAdmin: boolean;
  refresh: () => Promise<void>;
};

const CrmDesktopContext = createContext<CrmDesktopContextValue | null>(null);

export function CrmDesktopProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<CrmProfile | null>(null);
  const [platformRole, setPlatformRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
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

      const { data: platformProfile } = await supabase
        .from("profiles")
        .select("role, full_name, phone")
        .eq("id", user.id)
        .maybeSingle();

      const role = (platformProfile as { role?: string } | null)?.role ?? null;
      setPlatformRole(role);

      const { data: existing, error: fetchErr } = await crmDb
        .profiles()
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (fetchErr) {
        setError(fetchErr.message);
        return;
      }

      let crmRow = existing as CrmProfile | null;

      if ((!crmRow || !hasSpacePlaceAccess(crmRow)) && isPlatformAdminRole(role)) {
        const { data: bootstrapped, error: upsertErr } = await crmDb
          .profiles()
          .upsert(
            {
              id: user.id,
              full_name:
                (platformProfile as { full_name?: string } | null)?.full_name ||
                user.user_metadata?.full_name ||
                user.email?.split("@")[0] ||
                "Main Admin",
              email: user.email ?? null,
              phone: (platformProfile as { phone?: string } | null)?.phone ?? null,
              role: "admin",
              active: true,
            },
            { onConflict: "id" }
          )
          .select("*")
          .single();

        if (upsertErr) {
          setError(upsertErr.message);
          return;
        }
        crmRow = bootstrapped as CrmProfile;
      }

      if (!crmRow || !hasSpacePlaceAccess(crmRow)) {
        setProfile(null);
        setError(CRM_DESKTOP_ACCESS_DENIED);
        return;
      }

      if (
        !canAccessCrmDesktop({ crmRole: crmRow.role, platformRole: role })
      ) {
        setProfile(crmRow);
        setError(CRM_DESKTOP_ACCESS_DENIED);
        return;
      }

      setProfile(crmRow);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      profile,
      platformRole,
      loading,
      error,
      canAccessDesktop: canAccessCrmDesktop({
        crmRole: profile?.role,
        platformRole,
      }),
      isMainAdmin: profile?.role === "admin",
      refresh,
    }),
    [profile, platformRole, loading, error, refresh]
  );

  return (
    <CrmDesktopContext.Provider value={value}>
      {children}
    </CrmDesktopContext.Provider>
  );
}

export function useCrmDesktop() {
  const ctx = useContext(CrmDesktopContext);
  if (!ctx) {
    throw new Error("useCrmDesktop must be used within CrmDesktopProvider");
  }
  return ctx;
}
