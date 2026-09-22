"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { useHostingWorkspace } from "@/lib/use-hosting-workspace";
import { ownerApiFetch } from "@/lib/owner-api-client";
import { hostingHref } from "@/lib/access/hosting-access";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { canShowOrganisationAddProperty } from "@/lib/organisation-property";
import {
  hostingPrimaryActionClass,
  hostingSecondaryActionClass,
} from "@/app/components/hosting/hosting-ui";

type PropertyRow = {
  id: string;
  name: string;
  formatted_address: string;
  space_count: number;
  owner_accepted_at: string | null;
};

function PropertiesPageContent() {
  const searchParams = useSearchParams();
  const requestedOrganisationId = searchParams.get(ORGANISATION_QUERY_PARAM);
  const hosting = useHostingWorkspace(requestedOrganisationId);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [migrationWarning, setMigrationWarning] = useState("");

  useEffect(() => {
    if (hosting.loading) return;
    if (!hosting.summary.showProperties) {
      window.location.replace(hosting.listingsHref);
    }
  }, [hosting.loading, hosting.listingsHref, hosting.summary.showProperties]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ownerApiFetch(
        hostingHref("/api/owner/properties", requestedOrganisationId)
      );
      setProperties((result.properties as PropertyRow[]) || []);
      setMigrationWarning(
        typeof result.migration_warning === "string" ? result.migration_warning : ""
      );
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load properties.");
      setProperties([]);
      setMigrationWarning("");
    }
    setLoading(false);
  }, [requestedOrganisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canAddProperty = canShowOrganisationAddProperty({
    contextKind: hosting.context.kind,
    showOrganisationCommercial: hosting.summary.showOrganisationCommercial,
  });

  return (
      <DashboardShell
        workspaceLabel="Hosting"
        pageTitle="My properties"
        navItems={hosting.navItems}
        activeHref="/dashboard/properties"
        pageActions={
          canAddProperty ? (
            <Link
              href={hostingHref("/dashboard/properties/new", hosting.hrefOrganisationId)}
              className={hostingPrimaryActionClass}
            >
              Add property
            </Link>
          ) : null
        }
      >
      <div>
        <p className="text-sm text-gray-600">
          Venue locations linked to your account. Bookable rooms still appear under{" "}
          <Link href={hosting.listingsHref} className="font-medium text-[#0c1d2f] underline">
            My spaces
          </Link>
          .
        </p>

        {migrationWarning ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {migrationWarning}
          </p>
        ) : null}

        {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}

        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Loading…</p>
        ) : properties.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
            <p className="text-sm text-gray-600">
              {canAddProperty
                ? "Add a property for this organisation, then list spaces under it."
                : "You don't have any properties yet. Create a property or accept a property invitation from FindMySpace to get started."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {canAddProperty ? (
                <Link
                  href={hostingHref(
                    "/dashboard/properties/new",
                    hosting.hrefOrganisationId
                  )}
                  className={hostingPrimaryActionClass}
                >
                  Add property
                </Link>
              ) : (
                <Link
                  href="/contact"
                  className="inline-flex items-center rounded-md bg-[#0c1d2f] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  Request a property
                </Link>
              )}
              <Link
                href={hosting.listingsHref}
                className={hostingSecondaryActionClass}
              >
                Go to My spaces
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {properties.map((property) => (
              <li key={property.id}>
                <Link
                  href={hostingHref(
                    `/dashboard/properties/${property.id}`,
                    hosting.hrefOrganisationId
                  )}
                  className="flex items-start justify-between gap-3 px-3.5 py-3 hover:bg-[#fbfcfd]"
                >
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[#0c1d2f]">
                      {property.name}
                    </h2>
                    {property.formatted_address ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {property.formatted_address}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 pt-0.5 text-xs font-medium text-gray-500">
                    {property.space_count === 1
                      ? "1 space"
                      : `${property.space_count} spaces`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}

export default function OwnerPropertiesPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
        <PropertiesPageContent />
      </Suspense>
    </RequireAuth>
  );
}
