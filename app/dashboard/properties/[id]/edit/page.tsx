"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { OrganisationPropertyForm } from "@/app/components/OrganisationPropertyForm";
import { useHostingWorkspace } from "@/lib/use-hosting-workspace";
import { hostingHref } from "@/lib/access/hosting-access";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { fetchManageableOrganisations } from "@/lib/access/organisation-access-client";
import { ownerApiFetch } from "@/lib/owner-api-client";
import { patchOwnerPropertyRequest } from "@/lib/organisation-property-client";

function EditOrganisationPropertyContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const propertyId = typeof params.id === "string" ? params.id : "";
  const requestedOrganisationId = searchParams.get(ORGANISATION_QUERY_PARAM);
  const hosting = useHostingWorkspace(requestedOrganisationId);
  const [organisationName, setOrganisationName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [initial, setInitial] = useState({
    name: "",
    description: "",
    address_line1: "",
    suburb: "",
    city: "",
    province: "",
    postal_code: "",
  });

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const result = await ownerApiFetch(
        hostingHref(`/api/owner/properties/${propertyId}`, requestedOrganisationId)
      );
      const property = result.property as Record<string, unknown>;
      setInitial({
        name: String(property.name || ""),
        description: String(property.description || ""),
        address_line1: String(property.address_line1 || ""),
        suburb: String(property.suburb || ""),
        city: String(property.city || ""),
        province: String(property.province || ""),
        postal_code: String(property.postal_code || ""),
      });
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load property."
      );
    }
    setLoading(false);
  }, [propertyId, requestedOrganisationId]);

  useEffect(() => {
    if (hosting.loading) return;
    if (!hosting.summary.showProperties) {
      window.location.replace(hosting.listingsHref);
    }
  }, [hosting.loading, hosting.listingsHref, hosting.summary.showProperties]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hosting.organisationId) {
      setOrganisationName(null);
      return;
    }
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

  const backHref = hostingHref(
    `/dashboard/properties/${propertyId}`,
    hosting.hrefOrganisationId
  );

  return (
    <DashboardShell
      workspaceLabel="Hosting"
      pageTitle="Edit property"
      pageSubtitle={organisationName || undefined}
      navItems={hosting.navItems}
      activeHref="/dashboard/properties"
    >
      <div className="mx-auto max-w-xl">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Property
        </Link>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <OrganisationPropertyForm
            key={`${propertyId}-${initial.name}`}
            organisationName={organisationName}
            initial={initial}
            submitLabel="Save property"
            saving={saving}
            message={message}
            onSubmit={async (values) => {
              setSaving(true);
              setMessage("");
              try {
                await patchOwnerPropertyRequest(
                  hostingHref(
                    `/api/owner/properties/${propertyId}`,
                    requestedOrganisationId
                  ),
                  values
                );
                router.push(backHref);
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not save property."
                );
                setSaving(false);
              }
            }}
          />
        )}
      </div>
    </DashboardShell>
  );
}

export default function EditOrganisationPropertyPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
        <EditOrganisationPropertyContent />
      </Suspense>
    </RequireAuth>
  );
}
