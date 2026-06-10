"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminUnclaimedSpaceForm } from "@/app/components/AdminUnclaimedSpaceForm";

function NewUnclaimedListingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crmOrgId = searchParams.get("crm_org_id") || undefined;
  const crmOrgName = searchParams.get("crm_org_name") || undefined;
  const crmContactId = searchParams.get("crm_contact_id") || undefined;
  const crmContactName = searchParams.get("crm_contact_name") || undefined;
  const prefillTitle = searchParams.get("title") || undefined;
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/admin/unclaimed-listings"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to unclaimed listings
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">New unclaimed listing</h1>
        <p className="mt-1 text-sm text-gray-600">
          Save a draft, add photos, then publish when ready. No owner account is required.
        </p>
        <div className="mt-6">
          <AdminUnclaimedSpaceForm
            mode="create"
            defaultOrganisationId={crmOrgId}
            defaultOrganisationName={crmOrgName}
            defaultContactId={crmContactId}
            defaultContactName={crmContactName}
            initial={prefillTitle ? { title: prefillTitle } : undefined}
            onCreated={(id) => router.replace(`/admin/unclaimed-listings/${id}/edit`)}
          />
        </div>
      </div>
    </main>
  );
}

export default function NewUnclaimedListingPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <NewUnclaimedListingContent />
    </Suspense>
  );
}
