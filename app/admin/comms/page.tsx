"use client";

import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hasAdminUiAccess } from "@/lib/client-admin-access";
import { CommsCenterContent } from "@/app/dashboard/comms/page";

function AdminCommsGate() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setRole((data as { role?: string | null } | null)?.role ?? null);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading comms…
      </p>
    );
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <p className="text-sm text-red-600">
        You do not have permission to view admin comms.
      </p>
    );
  }

  return <CommsCenterContent adminMode />;
}

export default function AdminCommsPage() {
  return (
    <Suspense
      fallback={
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading comms…
        </p>
      }
    >
      <AdminCommsGate />
    </Suspense>
  );
}
