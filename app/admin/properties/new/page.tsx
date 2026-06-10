"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { AdminPropertyForm } from "@/app/components/AdminPropertyForm";

function NewPropertyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crmOrgId = searchParams.get("crm_org_id") || null;
  const crmOrgName = searchParams.get("crm_org_name") || null;

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
        <AdminNav current="properties" />

        <Link
          href="/admin/properties"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to properties
        </Link>

        <h1 className="text-2xl font-semibold text-gray-900">New property</h1>
        <p className="mt-1 text-sm text-gray-600">
          Create a venue profile, then add spaces and invite the owner.
        </p>

        <div className="mt-6">
          <AdminPropertyForm
            mode="create"
            defaultOrganisationId={crmOrgId || undefined}
            defaultOrganisationName={crmOrgName || undefined}
            initial={{
              name: searchParams.get("name") || "",
              description: "",
              ownerEmail: "",
              crmOrganisationId: crmOrgId,
              crmOrganisationName: crmOrgName,
              location: {
                streetAddress: "",
                suburb: "",
                city: "",
                province: "",
                postalCode: "",
                country: "South Africa",
                latitude: null,
                longitude: null,
              },
            }}
            onSuccess={(id) => router.replace(`/admin/properties/${id}`)}
          />
        </div>
      </div>
    </main>
  );
}

export default function NewPropertyPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <NewPropertyContent />
    </Suspense>
  );
}
