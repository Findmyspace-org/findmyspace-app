"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { OrganisationPropertyForm } from "@/app/components/OrganisationPropertyForm";
import { useHostingWorkspace } from "@/lib/use-hosting-workspace";
import { hostingHref } from "@/lib/access/hosting-access";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { fetchManageableOrganisations } from "@/lib/access/organisation-access-client";
import { canShowOrganisationAddProperty } from "@/lib/organisation-property";
import { createOrganisationPropertyRequest } from "@/lib/organisation-property-client";

function NewOrganisationPropertyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOrganisationId = searchParams.get(ORGANISATION_QUERY_PARAM);
  const hosting = useHostingWorkspace(requestedOrganisationId);
  const [organisationName, setOrganisationName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canCreate = canShowOrganisationAddProperty({
    contextKind: hosting.context.kind,
    showOrganisationCommercial: hosting.summary.showOrganisationCommercial,
  });

  useEffect(() => {
    if (hosting.loading) return;
    if (!canCreate || !hosting.organisationId) {
      window.location.replace(hosting.propertiesHref);
    }
  }, [
    canCreate,
    hosting.loading,
    hosting.organisationId,
    hosting.propertiesHref,
  ]);

  useEffect(() => {
    if (!hosting.organisationId) return;
    let mounted = true;
    fetchManageableOrganisations()
      .then((result) => {
        if (!mounted) return;
        const match = (result.organisations || []).find(
          (organisation) => organisation.id === hosting.organisationId
        );
        setOrganisationName(match?.name || null);
      })
      .catch(() => {
        if (mounted) setOrganisationName(null);
      });
    return () => {
      mounted = false;
    };
  }, [hosting.organisationId]);

  return (
    <DashboardShell
      workspaceLabel="Hosting"
      pageTitle="Add property"
      pageSubtitle={organisationName || undefined}
      navItems={hosting.navItems}
      activeHref="/dashboard/properties"
    >
      <div className="mx-auto max-w-xl">
        <Link
          href={hosting.propertiesHref}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          My properties
        </Link>

        <OrganisationPropertyForm
          organisationName={organisationName}
          initial={{
            name: "",
            description: "",
            address_line1: "",
            suburb: "",
            city: "",
            province: "",
            postal_code: "",
          }}
          submitLabel="Create property"
          saving={saving}
          message={message}
          onSubmit={async (values) => {
            if (!hosting.organisationId) return;
            setSaving(true);
            setMessage("");
            try {
              const created = await createOrganisationPropertyRequest(
                hosting.organisationId,
                values
              );
              router.push(
                hostingHref(
                  `/dashboard/properties/${created.property.id}`,
                  hosting.organisationId
                )
              );
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Could not create property."
              );
              setSaving(false);
            }
          }}
        />
      </div>
    </DashboardShell>
  );
}

export default function NewOrganisationPropertyPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
        <NewOrganisationPropertyContent />
      </Suspense>
    </RequireAuth>
  );
}
