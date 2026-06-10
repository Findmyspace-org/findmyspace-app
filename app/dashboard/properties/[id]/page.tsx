"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { HOST_NAV } from "@/lib/dashboard-nav";
import { ownerApiFetch } from "@/lib/owner-api-client";
import {
  getOwnerListingStatusBadgeClass,
  getPropertyChildSpaceNextAction,
} from "@/lib/listing-lifecycle";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";

type PropertyDetail = {
  id: string;
  name: string;
  description: string | null;
  formatted_address: string;
};

type SpaceRow = {
  id: string;
  title: string | null;
  status: string | null;
  status_label: string;
  space_type: string | null;
};

function PropertyDetailContent() {
  const params = useParams();
  const propertyId = typeof params.id === "string" ? params.id : "";

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const result = await ownerApiFetch(`/api/owner/properties/${propertyId}`);
      setProperty(result.property as PropertyDetail);
      setSpaces((result.spaces as SpaceRow[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load property.");
      setProperty(null);
      setSpaces([]);
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell
      workspaceLabel="Hosting"
      pageTitle={property?.name || "Property"}
      pageSubtitle="Spaces under this venue."
      navItems={HOST_NAV}
      activeHref="/dashboard/properties"
    >
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard/properties"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          All properties
        </Link>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !property ? (
          <p className="text-sm text-red-600">{message || "Property not found."}</p>
        ) : (
          <>
            {property.formatted_address ? (
              <p className="flex items-center gap-1 text-sm text-gray-600">
                <MapPin className="h-4 w-4 shrink-0" />
                {property.formatted_address}
              </p>
            ) : null}

            {property.description ? (
              <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">
                {property.description}
              </p>
            ) : null}

            <section className="mt-8">
              <h2 className="text-lg font-semibold text-gray-900">Spaces</h2>
              {spaces.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">
                  No spaces linked to this property yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {spaces.map((space) => {
                    const nextAction = getPropertyChildSpaceNextAction(
                      space.id,
                      space.status
                    );
                    return (
                      <li
                        key={space.id}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {space.title?.trim() || "Untitled space"}
                            </h3>
                            {space.space_type ? (
                              <p className="text-xs text-gray-500">
                                {formatSpaceTypeLabel(space.space_type)}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getOwnerListingStatusBadgeClass(space.status)}`}
                          >
                            {space.status_label}
                          </span>
                        </div>
                        {nextAction ? (
                          <Link
                            href={nextAction.href}
                            className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${
                              nextAction.urgent
                                ? "text-amber-800"
                                : nextAction.muted
                                  ? "text-gray-600"
                                  : "text-[#0f2740]"
                            } hover:underline`}
                          >
                            {nextAction.label}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

export default function OwnerPropertyDetailPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
        <PropertyDetailContent />
      </Suspense>
    </RequireAuth>
  );
}
