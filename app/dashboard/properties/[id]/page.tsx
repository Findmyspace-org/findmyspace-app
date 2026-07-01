"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { PropertyReadinessDashboard } from "@/app/components/PropertyReadinessDashboard";
import { OwnerPropertySpaceSteps } from "@/app/components/OwnerPropertySpaceSteps";
import { HOST_NAV } from "@/lib/dashboard-nav";
import { ownerApiFetch } from "@/lib/owner-api-client";
import {
  getOwnerListingStatusBadgeClass,
  getPropertyChildSpaceNextAction,
} from "@/lib/listing-lifecycle";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import type { PropertyOnboardingProgress } from "@/lib/property-onboarding-progress";
import type {
  PropertySpacesHealth,
  PropertySpacesSummary,
  PropertySpaceHealthFilter,
} from "@/lib/property-space-ops";
import { matchesPropertySpaceHealthFilter } from "@/lib/property-space-ops";
import { PropertyTermsSection } from "@/app/components/PropertyTermsSection";
import { normalizePropertyTermsRow } from "@/lib/property-booking-terms";
import type { OwnerSpaceStep } from "@/lib/owner-property-space-steps";

type PropertyDetail = {
  id: string;
  name: string;
  description: string | null;
  formatted_address: string;
  terms_title?: string | null;
  terms_text?: string | null;
  terms_document_url?: string | null;
  require_terms_acceptance?: boolean | null;
  terms_acceptance_label?: string | null;
  terms_updated_at?: string | null;
};

type SpaceRow = {
  id: string;
  title: string | null;
  status: string | null;
  status_label: string;
  can_submit?: boolean;
  inherited_ownership?: boolean;
  steps?: OwnerSpaceStep[];
  space_type: string | null;
  has_photos: boolean;
  has_pricing: boolean;
  has_location: boolean;
  has_ai_information: boolean;
  is_archived: boolean;
};

function PropertyDetailContent() {
  const params = useParams();
  const propertyId = typeof params.id === "string" ? params.id : "";

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [summary, setSummary] = useState<PropertySpacesSummary>({
    total: 0,
    hidden: 0,
    enquiry: 0,
    live: 0,
    archived: 0,
  });
  const [health, setHealth] = useState<PropertySpacesHealth>({
    withPhotos: 0,
    missingPhotos: 0,
    missingPricing: 0,
    missingLocation: 0,
    withAiInformation: 0,
    missingAiInformation: 0,
  });
  const [progress, setProgress] = useState<PropertyOnboardingProgress | null>(null);
  const [attentionHrefs, setAttentionHrefs] = useState<Record<string, string>>({});
  const [healthFilter, setHealthFilter] = useState<PropertySpaceHealthFilter>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const result = await ownerApiFetch(`/api/owner/properties/${propertyId}`);
      setProperty(result.property as PropertyDetail);
      setSpaces((result.spaces as SpaceRow[]) || []);
      setSummary(
        (result.summary as PropertySpacesSummary) || {
          total: 0,
          hidden: 0,
          enquiry: 0,
          live: 0,
          archived: 0,
        }
      );
      setHealth(
        (result.health as PropertySpacesHealth) || {
          withPhotos: 0,
          missingPhotos: 0,
          missingPricing: 0,
          missingLocation: 0,
          withAiInformation: 0,
          missingAiInformation: 0,
        }
      );
      setProgress((result.progress as PropertyOnboardingProgress) || null);
      setAttentionHrefs((result.attention_hrefs as Record<string, string>) || {});
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load property.");
      setProperty(null);
      setSpaces([]);
      setProgress(null);
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleSpaces = useMemo(() => {
    if (!healthFilter) return spaces;
    return spaces.filter((space) => matchesPropertySpaceHealthFilter(space, healthFilter));
  }, [healthFilter, spaces]);

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
              <p className="text-sm text-gray-600">{property.formatted_address}</p>
            ) : null}

            {property.description ? (
              <p className="mt-3 text-sm whitespace-pre-wrap text-gray-700">
                {property.description}
              </p>
            ) : null}

            {progress ? (
              <div className="mt-6">
                <PropertyReadinessDashboard
                  variant="owner"
                  summary={summary}
                  health={health}
                  progress={progress}
                  healthFilter={healthFilter}
                  onHealthFilterChange={setHealthFilter}
                  attentionHrefs={attentionHrefs}
                />
              </div>
            ) : null}

            <div className="mt-6">
              <PropertyTermsSection
                propertyId={propertyId}
                mode="owner"
                initial={normalizePropertyTermsRow(property as Record<string, unknown>)}
                onMessage={(msg) => setMessage(msg ?? "")}
              />
            </div>

            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Spaces</h2>
                {healthFilter ? (
                  <p className="text-xs text-gray-500">
                    Showing {visibleSpaces.length} of {spaces.length} spaces
                  </p>
                ) : null}
              </div>

              {spaces.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">
                  No spaces linked to this property yet.
                </p>
              ) : visibleSpaces.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">
                  No spaces match this filter.{" "}
                  <button
                    type="button"
                    onClick={() => setHealthFilter(null)}
                    className="font-medium text-[#0f2740] hover:underline"
                  >
                    Clear filter
                  </button>
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {visibleSpaces.map((space) => {
                    const nextAction = getPropertyChildSpaceNextAction(
                      space.id,
                      space.status,
                      { canSubmit: space.can_submit }
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

                        {space.steps && space.steps.length > 0 ? (
                          <OwnerPropertySpaceSteps steps={space.steps} />
                        ) : null}

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
