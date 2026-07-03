"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Building2, MapPin } from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { HOST_NAV } from "@/lib/dashboard-nav";
import { ownerApiFetch } from "@/lib/owner-api-client";

type PropertyRow = {
  id: string;
  name: string;
  formatted_address: string;
  space_count: number;
  owner_accepted_at: string | null;
};

function PropertiesPageContent() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [migrationWarning, setMigrationWarning] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ownerApiFetch("/api/owner/properties");
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell
      workspaceLabel="Hosting"
      pageTitle="My properties"
      pageSubtitle="Manage venues or locations that contain one or more spaces."
      navItems={HOST_NAV}
      activeHref="/dashboard/properties"
    >
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-gray-600">
          These are venue locations FindMySpace has linked to your account (for example a
          municipality or property portfolio). Each bookable space still appears under{" "}
          <Link href="/dashboard/listings" className="font-medium text-[#192a3a] underline">
            My spaces
          </Link>
          .
        </p>

        {migrationWarning ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {migrationWarning}
          </p>
        ) : null}

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {loading ? (
          <p className="mt-8 text-sm text-gray-500">Loading…</p>
        ) : properties.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-3 text-sm text-gray-600">
              You don&apos;t have any properties yet. Create a property or accept a property
              invitation from FindMySpace to get started.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/contact"
                className="rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Request a property
              </Link>
              <Link
                href="/dashboard/listings"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-[#192a3a] hover:bg-gray-50"
              >
                Go to My spaces
              </Link>
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Properties are venue locations that can contain multiple bookable spaces. FindMySpace
              can link an existing venue to your account or help you set one up.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {properties.map((property) => (
              <li key={property.id}>
                <Link
                  href={`/dashboard/properties/${property.id}`}
                  className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#0f2740]/30 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {property.name}
                      </h2>
                      {property.formatted_address ? (
                        <p className="mt-1 flex items-center gap-1 text-sm text-gray-600">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {property.formatted_address}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                      {property.space_count === 1
                        ? "1 space"
                        : `${property.space_count} spaces`}
                    </span>
                  </div>
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
