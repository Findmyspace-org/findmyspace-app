"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isPlatformAdminRole, isSuperAdminRole } from "@/lib/admin-roles";

export function useAdminRole() {
  const [role, setRole] = useState<string | null>(null);
  const [adminAccessDisabled, setAdminAccessDisabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setAdminAccessDisabled(false);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, admin_access_disabled")
        .eq("id", user.id)
        .maybeSingle();

      const row = profile as {
        role?: string | null;
        admin_access_disabled?: boolean | null;
      } | null;

      setRole(row?.role ?? null);
      setAdminAccessDisabled(Boolean(row?.admin_access_disabled));
      setLoading(false);
    }
    void init();
  }, []);

  const isAdmin =
    isPlatformAdminRole(role) && !adminAccessDisabled;
  const isSuperAdmin = isSuperAdminRole(role) && !adminAccessDisabled;

  return { role, loading, isAdmin, isSuperAdmin, adminAccessDisabled };
}
