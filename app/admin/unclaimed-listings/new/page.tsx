"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminUnclaimedSpaceForm } from "@/app/components/AdminUnclaimedSpaceForm";
import { GuardedLink, useUnsavedBackFallback, useUnsavedGuardEnabled } from "@/app/components/UnsavedChangesProvider";

function NewUnclaimedListingContent() {
  const searchParams = useSearchParams();
  const crmOrgId = searchParams.get("crm_org_id") || undefined;
  const crmOrgName = searchParams.get("crm_org_name") || undefined;
  const crmContactId = searchParams.get("crm_contact_id") || undefined;
  const crmContactName = searchParams.get("crm_contact_name") || undefined;
  const prefillTitle = searchParams.get("title") || undefined;
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useUnsavedBackFallback("/admin/unclaimed-listings");
  useUnsavedGuardEnabled(true);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setRole((profile as { role?: string } | null)?.role ?? null);
      setLoading(false);
    }
    void init();
  }, []);

  if (loading) {
    return <div className="text-gray-600">Loading…</div>;
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <div>
        <p className="text-red-600">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <GuardedLink
          href="/admin/unclaimed-listings"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to unclaimed spaces
        </GuardedLink>
        <h1 className="text-2xl font-semibold text-gray-900">New unclaimed space</h1>
        <p className="mt-1 text-sm text-gray-600">
          Save a draft, add photos, then publish when ready. No owner account is required yet.
        </p>
        <div className="mt-6">
          <AdminUnclaimedSpaceForm
            mode="create"
            wrapWithUnsavedGuard={false}
            defaultOrganisationId={crmOrgId}
            defaultOrganisationName={crmOrgName}
            defaultContactId={crmContactId}
            defaultContactName={crmContactName}
            initial={prefillTitle ? { title: prefillTitle } : undefined}
            onCreated={(id) => {
              window.history.replaceState(
                null,
                "",
                `/admin/spaces/${id}/edit?returnTo=${encodeURIComponent("/admin/unclaimed-listings")}`
              );
            }}
          />
        </div>
    </div>
  );
}

export default function NewUnclaimedListingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-600">Loading…</div>}>
      <NewUnclaimedListingContent />
    </Suspense>
  );
}
