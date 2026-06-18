"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { AdminPropertyInvitePanel } from "@/app/components/AdminPropertyInvitePanel";
import { AdminPropertySpaceBreadcrumb } from "@/app/components/AdminPropertySpaceBreadcrumb";
import { AdminPropertyForm } from "@/app/components/AdminPropertyForm";
import { AdminPropertySummaryCards } from "@/app/components/AdminPropertySummaryCards";
import { AdminPropertySpacesHub } from "@/app/components/AdminPropertySpacesHub";
import {
  AdminPropertyGallery,
  type PropertyGalleryImage,
} from "@/app/components/AdminPropertyGallery";
import { computePropertyOnboardingProgress } from "@/lib/property-onboarding-progress";
import type {
  PropertySpacesHealth,
  PropertySpacesSummary,
  PropertySpaceHealthFilter,
  PropertySpaceRow,
} from "@/lib/property-space-ops";

type PropertyDetail = {
  id: string;
  name: string;
  description: string | null;
  formatted_address: string;
  address_line1: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  owner_email: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_status: string;
  invite_status: string;
  owner_invited_at: string | null;
  owner_accepted_at: string | null;
  crm_organisation_id: string | null;
  crm_organisation: { id: string; name: string } | null;
};

function AdminPropertyDetailContent({
  showCreatedBanner,
  showUpdatedBanner,
  showSavedBanner,
}: {
  showCreatedBanner: boolean;
  showUpdatedBanner: boolean;
  showSavedBanner: boolean;
}) {
  const params = useParams();
  const propertyId = typeof params.id === "string" ? params.id : "";

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [spaces, setSpaces] = useState<PropertySpaceRow[]>([]);
  const [archivedSpaces, setArchivedSpaces] = useState<PropertySpaceRow[]>([]);
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
  const [propertyImages, setPropertyImages] = useState<PropertyGalleryImage[]>([]);
  const [healthFilter, setHealthFilter] = useState<PropertySpaceHealthFilter>(null);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [galleryMessage, setGalleryMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (showCreatedBanner) {
      setSuccessMessage("Property created successfully.");
      window.history.replaceState({}, "", `/admin/properties/${propertyId}`);
    } else if (showUpdatedBanner) {
      setSuccessMessage("Property updated successfully.");
      window.history.replaceState({}, "", `/admin/properties/${propertyId}`);
    } else if (showSavedBanner) {
      setSuccessMessage("Space saved successfully.");
      window.history.replaceState({}, "", `/admin/properties/${propertyId}`);
    }
  }, [showCreatedBanner, showUpdatedBanner, showSavedBanner, propertyId]);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const result = await adminApiFetch(`/api/admin/properties/${propertyId}`);
      setProperty(result.property as PropertyDetail);
      setSpaces((result.spaces as PropertySpaceRow[]) || []);
      setArchivedSpaces((result.archived_spaces as PropertySpaceRow[]) || []);
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
      setPropertyImages(
        ((result.property_images as PropertyGalleryImage[]) || []).map((img) => ({
          ...img,
          sort_order: img.sort_order ?? 0,
        }))
      );
      if (!showCreatedBanner && !showUpdatedBanner && !showSavedBanner) {
        setMessage("");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load property.");
      setProperty(null);
      setSpaces([]);
      setArchivedSpaces([]);
    }
    setLoading(false);
  }, [propertyId, showCreatedBanner, showSavedBanner, showUpdatedBanner]);

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
      const r = (profile as { role?: string } | null)?.role ?? null;
      setRole(r);
      if (hasAdminUiAccess(r)) {
        await load();
      } else {
        setLoading(false);
      }
    }
    void init();
  }, [load]);

  const matrixSpaces = useMemo(
    () => [...spaces, ...archivedSpaces],
    [archivedSpaces, spaces]
  );

  const handleMatrixSpaceUpdated = useCallback(
    (spaceId: string, patch: Partial<PropertySpaceRow>) => {
      function applyPatch(list: PropertySpaceRow[]) {
        return list.map((space) =>
          space.id === spaceId ? { ...space, ...patch } : space
        );
      }

      setSpaces((current) => applyPatch(current));
      setArchivedSpaces((current) => {
        const next = applyPatch(current);
        if (patch.is_archived === false) {
          const restored = next.find((space) => space.id === spaceId);
          if (restored) {
            setSpaces((active) =>
              active.some((space) => space.id === spaceId)
                ? applyPatch(active)
                : [...active, restored]
            );
            return next.filter((space) => space.id !== spaceId);
          }
        }
        if (patch.is_archived === true) {
          setSpaces((active) => active.filter((space) => space.id !== spaceId));
          const archived = [...spaces, ...archivedSpaces].find(
            (space) => space.id === spaceId
          );
          if (archived && !next.some((space) => space.id === spaceId)) {
            return [...next, { ...archived, ...patch }];
          }
        }
        return next;
      });
    },
    [archivedSpaces, spaces]
  );

  const onboardingProgress = useMemo(() => {
    if (!property) return null;
    return computePropertyOnboardingProgress({
      property: {
        crm_organisation_id: property.crm_organisation_id,
        owner_id: property.owner_id,
        owner_invited_at: property.owner_invited_at,
        owner_accepted_at: property.owner_accepted_at,
      },
      spaces,
      archivedSpaces,
      summary,
      health,
      propertyImageCount: propertyImages.length,
    });
  }, [archivedSpaces, health, property, propertyImages.length, spaces, summary]);

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

  if (!property) {
    return (
      <main className="p-8">
        <p className="text-red-600">{message || "Property not found."}</p>
        <Link
          href="/admin/properties"
          className="mt-4 inline-block text-sm font-medium text-[#0f2740] hover:underline"
        >
          Back to properties
        </Link>
      </main>
    );
  }

  const hasOwner = Boolean(property.owner_id);

  return (
    <main className="bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <AdminNav current="properties" />

        <AdminPropertySpaceBreadcrumb
          propertyId={propertyId}
          propertyName={property.name}
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900">{property.name}</h1>
            {property.formatted_address ? (
              <p className="mt-1 text-sm text-gray-600">{property.formatted_address}</p>
            ) : null}
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {property.crm_organisation ? (
                <div>
                  <dt className="text-gray-500">CRM organisation</dt>
                  <dd>
                    <Link
                      href={`/space-place/organisations/${property.crm_organisation.id}`}
                      className="inline-flex items-center gap-1 font-medium text-[#0f2740] hover:underline"
                    >
                      {property.crm_organisation.name}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-gray-500">Owner</dt>
                <dd className="font-medium text-gray-900">
                  {property.owner_name ||
                    property.owner_email ||
                    "No owner assigned"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Owner status</dt>
                <dd className="font-medium text-gray-900">{property.owner_status}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Invite status</dt>
                <dd className="font-medium text-gray-900">{property.invite_status}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4" />
                Edit property
              </button>
            ) : null}
            <Link
              href={`/admin/properties/${propertyId}/spaces/new`}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Add space
            </Link>
          </div>
        </div>

        {successMessage ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            {successMessage}
          </p>
        ) : null}

        {message ? (
          <p
            className={`mt-4 text-sm ${
              message.toLowerCase().includes("fail") ||
              message.toLowerCase().includes("could not") ||
              message.toLowerCase().includes("error")
                ? "text-red-600"
                : "text-green-700"
            }`}
          >
            {message}
          </p>
        ) : null}

        {editing ? (
          <div className="mt-6">
            <AdminPropertyForm
              mode="edit"
              propertyId={propertyId}
              initial={{
                name: property.name,
                description: property.description || "",
                ownerEmail: property.owner_email || "",
                crmOrganisationId:
                  property.crm_organisation?.id ?? property.crm_organisation_id,
                crmOrganisationName: property.crm_organisation?.name ?? null,
                location: {
                  streetAddress: property.address_line1 || "",
                  suburb: property.suburb || "",
                  city: property.city || "",
                  province: property.province || "",
                  postalCode: property.postal_code || "",
                  country: property.country || "South Africa",
                  latitude: property.latitude,
                  longitude: property.longitude,
                },
              }}
              onSuccess={async () => {
                setEditing(false);
                setSuccessMessage("Property updated successfully.");
                await load();
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            {onboardingProgress ? (
              <div className="mt-6">
                <AdminPropertySummaryCards
                  summary={summary}
                  health={health}
                  healthFilter={healthFilter}
                  onHealthFilterChange={setHealthFilter}
                  progress={onboardingProgress}
                  matrixSpaces={matrixSpaces}
                  onMatrixSpaceUpdated={handleMatrixSpaceUpdated}
                  onMatrixReload={load}
                />
              </div>
            ) : null}

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Property details
                </h2>
                {property.description ? (
                  <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {property.description}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">No description.</p>
                )}
                {property.owner_email ? (
                  <p className="mt-3 text-sm text-gray-600">
                    Owner email:{" "}
                    <span className="font-medium text-gray-900">
                      {property.owner_email}
                    </span>
                  </p>
                ) : null}
              </section>

              <AdminPropertyInvitePanel
                propertyId={propertyId}
                propertyName={property.name}
                ownerEmailDefault={property.owner_email}
                hasOwner={hasOwner}
              />
            </div>

            <div className="mt-6">
              <AdminPropertySpacesHub
                propertyId={propertyId}
                spaces={spaces}
                archivedSpaces={archivedSpaces}
                healthFilter={healthFilter}
                onReload={load}
                onMessage={setMessage}
              />
            </div>

            <div className="mt-6">
              {galleryMessage ? (
                <p className="mb-2 text-sm text-gray-600">{galleryMessage}</p>
              ) : null}
              <AdminPropertyGallery
                propertyId={propertyId}
                images={propertyImages}
                onImagesChange={setPropertyImages}
                onMessage={setGalleryMessage}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function AdminPropertyDetailSearchParamsClient() {
  const searchParams = useSearchParams();
  return (
    <AdminPropertyDetailContent
      showCreatedBanner={searchParams.get("created") === "1"}
      showUpdatedBanner={searchParams.get("updated") === "1"}
      showSavedBanner={searchParams.get("saved") === "1"}
    />
  );
}

export default function AdminPropertyDetailPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <AdminPropertyDetailSearchParamsClient />
    </Suspense>
  );
}
